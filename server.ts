import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import dotenv from "dotenv";
import {
  CfrCancelledError,
  CfrRestrictedError,
  decompileClassWithCfr,
  readClassMapping,
} from "./src/services/cfr.js";

dotenv.config();

const PRIMARY_GEMINI_MODEL = "gemini-4-hydrogen";
const FALLBACK_GEMINI_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_GPT_OSS_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_GPT_OSS_MODEL = "openai/gpt-oss-120b";

const ANNOTATE_ONLY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    classSummary: {
      type: Type.STRING,
      description: "A concise, developer-friendly summary of the class's purpose, design, and compiler details",
    },
    annotations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          method: {
            type: Type.STRING,
            description: "Name of the method being annotated",
          },
          concept: {
            type: Type.STRING,
            description: "High-level concept, e.g. String Concatenation Optimization, or Exception Handling Flow",
          },
          explanation: {
            type: Type.STRING,
            description: "Detailed explanation of the JVM bytecode mechanics used for this concept",
          },
        },
        required: ["method", "concept", "explanation"],
      },
      description: "List of key bytecode and architectural annotations for methods in this class",
    },
  },
  required: ["classSummary", "annotations"],
};

const ANNOTATE_SYSTEM_INSTRUCTION =
  "You are a senior Java systems engineer analyzing CFR-decompiled Java source code. Respond strictly with a valid JSON object matching the schema. Keep notes concise and technically accurate.";

function extractReadableErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || "Decompilation failed");
  try {
    const parsed = JSON.parse(raw);
    const apiErr = parsed?.error || parsed;
    if (apiErr?.message) {
      const firstLine = String(apiErr.message).split("\n")[0].trim();
      const code = apiErr.code ? ` (${apiErr.code})` : "";
      return `${firstLine}${code}`;
    }
  } catch {
    // Not raw JSON
  }
  return raw;
}

function extractRetryDelayMs(err: unknown): number | null {
  const raw = err instanceof Error ? err.message : String(err || "");
  const secMatch = raw.match(/retry in\s+([\d.]+)s/i) || raw.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (!secMatch) return null;
  const seconds = parseFloat(secMatch[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(16000, Math.max(1000, Math.ceil(seconds * 1000) + 300));
}

function parseJsonResponse(rawText: string) {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const cleaned = trimmed.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    return JSON.parse(cleaned);
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGptOssFallback(
  systemInstruction: string,
  userPrompt: string,
  expectJson: boolean
): Promise<string> {
  const gptOssKey = process.env.GPT_OSS_API_KEY;
  if (!gptOssKey) {
    throw new Error("GPT_OSS_API_KEY not configured");
  }

  const baseUrl = (process.env.GPT_OSS_BASE_URL || DEFAULT_GPT_OSS_BASE_URL).replace(/\/+$/, "");
  const model = process.env.GPT_OSS_MODEL || DEFAULT_GPT_OSS_MODEL;

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: userPrompt },
    ],
  };

  if (expectJson) {
    body.response_format = { type: "json_object" };
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gptOssKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`GPT-OSS fallback error (${resp.status}): ${errText}`);
  }

  const data = (await resp.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from GPT-OSS fallback");
  }
  return content;
}

async function startServer() {
  const app = express();
  const isHostedPreview = Boolean(
    process.env.K_SERVICE ||
      process.env.CLOUD_RUN_JOB ||
      (process.env.APP_URL && process.env.APP_URL.includes(".run.app"))
  );
  const parsedPort = Number(process.env.JADAI_PORT || process.env.PORT);
  const PORT = isHostedPreview ? 3000 : Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 4730;

  app.use(express.json({ limit: "50mb" }));

  const apiKey = process.env.GEMINI_API_KEY;
  const ai = apiKey
    ? new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      })
    : null;

  function isTransientCapacityError(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("503") ||
      msg.includes("resource_exhausted") ||
      msg.includes("unavailable") ||
      msg.includes("high demand") ||
      msg.includes("overloaded") ||
      msg.includes("timed out") ||
      msg.includes("timeout")
    );
  }

  async function runAnnotateWithFallback(prompt: string, signal?: AbortSignal) {
    let lastError: unknown;

    if (ai) {
      const attemptSchedule = [
        { model: PRIMARY_GEMINI_MODEL, thinking: ThinkingLevel.LOW },
        { model: FALLBACK_GEMINI_MODEL, thinking: ThinkingLevel.MINIMAL },
        { model: PRIMARY_GEMINI_MODEL, thinking: ThinkingLevel.LOW },
      ];

      for (let i = 0; i < attemptSchedule.length; i++) {
        if (signal?.aborted) {
          throw new CfrCancelledError("Annotation cancelled");
        }
        const { model, thinking } = attemptSchedule[i];
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              thinkingConfig: { thinkingLevel: thinking },
              responseMimeType: "application/json",
              responseSchema: ANNOTATE_ONLY_SCHEMA,
              systemInstruction: ANNOTATE_SYSTEM_INSTRUCTION,
            },
          });
          if (response.text) {
            return { ...parseJsonResponse(response.text), summaryModel: model };
          }
          throw new Error(`Empty response from ${model}`);
        } catch (err) {
          lastError = err;
          if (signal?.aborted) {
            throw new CfrCancelledError("Annotation cancelled");
          }
          const isLastAttempt = i === attemptSchedule.length - 1;
          if (isLastAttempt) break;

          const transient = isTransientCapacityError(err);
          if (i === 0 && transient) {
            await sleep(250);
            continue;
          }
          if (transient) {
            const retryMs = extractRetryDelayMs(err) ?? 1800 + Math.floor(Math.random() * 400);
            await sleep(retryMs);
            continue;
          }
          await sleep(300);
        }
      }
    }

    if (process.env.GPT_OSS_API_KEY) {
      const raw = await callGptOssFallback(ANNOTATE_SYSTEM_INSTRUCTION, prompt, true);
      return {
        ...parseJsonResponse(raw),
        summaryModel: process.env.GPT_OSS_MODEL || DEFAULT_GPT_OSS_MODEL,
      };
    }

    throw lastError instanceof Error ? lastError : new Error("AI annotation unavailable");
  }

  // API Route for CFR Bytecode Decompilation & Optional AI Annotation
  app.post("/api/decompile", async (req, res) => {
    const abortController = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    try {
      const {
        classBytesBase64,
        fileName,
        mappingText,
        classData,
        includeAnnotations = false,
        mode,
        javaSource,
      } = req.body;

      if (mode === "annotate") {
        if (!apiKey && !process.env.GPT_OSS_API_KEY) {
          return res.status(500).json({
            error: "GEMINI_API_KEY environment variable is not configured. Please configure it in Settings > Secrets.",
          });
        }
        if (!javaSource) {
          return res.status(400).json({ error: "Missing Java source for annotation" });
        }
        const truncatedSource = String(javaSource).slice(0, 45000);
        const annotatePrompt = `Analyze this CFR-decompiled Java class (${classData?.thisClassName || "Class"}, target ${classData?.jdkVersion || "Java"}) and produce a concise classSummary plus high-value method bytecode/architectural annotations (up to 12 most important methods).

\`\`\`java
${truncatedSource}
\`\`\``;
        const result = await runAnnotateWithFallback(annotatePrompt, abortController.signal);
        if (abortController.signal.aborted) return;
        return res.json(result);
      }

      if (!classBytesBase64 || typeof classBytesBase64 !== "string") {
        return res.status(400).json({ error: "Missing binary .class payload for CFR decompilation." });
      }

      const bytes = new Uint8Array(Buffer.from(classBytesBase64, "base64"));
      const mapping = readClassMapping(mappingText);

      const cfrSource = await decompileClassWithCfr(bytes, {
        mapping,
        fileName: typeof fileName === "string" ? fileName : undefined,
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) return;

      let classSummary = "";
      let summaryModel: string | undefined;
      let annotations: Array<{ method: string; concept: string; explanation: string }> = [];

      if (includeAnnotations && (apiKey || process.env.GPT_OSS_API_KEY)) {
        try {
          const truncatedSource = cfrSource.slice(0, 45000);
          const annotatePrompt = `Analyze this CFR-decompiled Java class (${classData?.thisClassName || fileName || "Class"}, target ${classData?.jdkVersion || "Java"}) and produce a concise classSummary plus high-value method architectural annotations (up to 12 most important methods).

\`\`\`java
${truncatedSource}
\`\`\``;
          const noteResult = await runAnnotateWithFallback(annotatePrompt, abortController.signal);
          classSummary = noteResult?.classSummary || "";
          summaryModel = noteResult?.summaryModel;
          annotations = Array.isArray(noteResult?.annotations) ? noteResult.annotations : [];
        } catch (annotErr) {
          if (abortController.signal.aborted) return;
          console.warn("Optional AI annotation skipped:", extractReadableErrorMessage(annotErr));
        }
      }

      if (abortController.signal.aborted) return;

      res.json({
        javaSource: cfrSource,
        classSummary,
        summaryModel,
        annotations,
      });
    } catch (error: any) {
      if (error instanceof CfrCancelledError || abortController.signal.aborted) {
        if (!res.headersSent) {
          res.status(499).json({ cancelled: true, error: "Decompilation cancelled" });
        }
        return;
      }
      if (error instanceof CfrRestrictedError) {
        return res.status(403).json({
          restricted: true,
          error: "Restricted bytecode signature detected. Source reconstruction is disabled.",
        });
      }
      console.error("CFR decompilation error:", error);
      res.status(500).json({ error: extractReadableErrorMessage(error) });
    }
  });

  // API Route for Interactive AI Chat
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, javaSource, classSummary } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Missing message" });
      }

      if (!apiKey && !process.env.GPT_OSS_API_KEY) {
        return res.status(500).json({
          error: "GEMINI_API_KEY environment variable is not configured. Please configure it in Settings > Secrets.",
        });
      }

      const chatContext = `
You are the interactive AI assistant embedded inside the JVM Bytecode Decompiler & AI Annotator.
The user is inspecting the following Java class:

SUMMARY:
${classSummary || "A parsed Java class file."}

RECONSTRUCTED JAVA SOURCE CODE:
\`\`\`java
${javaSource || "// Code not available yet"}
\`\`\`

Answer the user's questions about this class, explain specific bytecode structures, convert code to Kotlin, optimize the logic, or help them understand JVM mechanisms. Keep explanations elegant, clear, and focused on systems/modding concepts where applicable (like Minecraft Forge, Fabric, or MCreator procedures).
`;

      if (ai) {
        try {
          const chat = ai.chats.create({
            model: PRIMARY_GEMINI_MODEL,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              systemInstruction: chatContext,
            },
          });
          const response = await chat.sendMessage({ message });
          return res.json({ text: response.text });
        } catch {
          try {
            const fallbackChat = ai.chats.create({
              model: FALLBACK_GEMINI_MODEL,
              config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                systemInstruction: chatContext,
              },
            });
            const fallbackResponse = await fallbackChat.sendMessage({ message });
            return res.json({ text: fallbackResponse.text });
          } catch (fallbackErr) {
            if (!process.env.GPT_OSS_API_KEY) {
              throw fallbackErr;
            }
          }
        }
      }

      const text = await callGptOssFallback(chatContext, message, false);
      res.json({ text });
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ error: error.message || "Chat failed" });
    }
  });

  const isCompiledServer = process.argv[1]?.replace(/\\/g, "/").endsWith("/server.cjs") ?? false;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !isCompiledServer) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
