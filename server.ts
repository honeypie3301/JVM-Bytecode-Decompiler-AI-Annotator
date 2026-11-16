import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const PRIMARY_GEMINI_MODEL = "gemini-4-hydrogen";
const FALLBACK_GEMINI_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_GPT_OSS_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_GPT_OSS_MODEL = "openai/gpt-oss-120b";

const DECOMPILE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    javaSource: {
      type: Type.STRING,
      description: "The complete, correct, and compilation-ready reconstructed high-level Java source code string",
    },
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
      description: "List of annotations for various methods based on the bytecode disassembly",
    },
  },
  required: ["javaSource", "classSummary", "annotations"],
};

const CHUNK_DECOMPILE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    methodsCode: {
      type: Type.STRING,
      description:
        "Complete reconstructed Java method and constructor implementations for this batch only, without package, imports, fields, or outer class wrapper",
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
      description: "List of annotations for the methods in this batch",
    },
  },
  required: ["methodsCode", "annotations"],
};

const FAST_DECOMPILE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    javaSource: {
      type: Type.STRING,
      description: "The complete, compilation-ready reconstructed high-level Java source code string",
    },
  },
  required: ["javaSource"],
};

const FAST_CHUNK_DECOMPILE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    methodsCode: {
      type: Type.STRING,
      description:
        "Complete reconstructed Java method and constructor implementations for this batch only, without package, imports, fields, or outer class wrapper",
    },
  },
  required: ["methodsCode"],
};

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

const DECOMPILE_SYSTEM_INSTRUCTION =
  "You are a world-class, high-speed Java decompiler. Respond strictly with a valid JSON object conforming to the requested schema. Ensure the reconstructed Java code is flawless, beautiful, and syntactically valid. Keep explanations extremely concise and direct to maximize decompilation speed.";

function formatBytecodeDetails(details: string): string {
  if (!details) return "";
  const bracketMatch = details.match(/^#\d+\s+\[(.+)\]$/);
  return bracketMatch ? bracketMatch[1] : details;
}

function formatCompactFields(fields: any[]): string {
  if (!fields || fields.length === 0) return "none";
  return fields
    .map((f: any) => `${(f.accessFlagsNames || f.accessFlags || []).join(" ")} ${f.name}:${f.descriptor}`.trim())
    .join("\n");
}

function formatCompactMethods(methods: any[]): string {
  if (!methods || methods.length === 0) return "none";
  return methods
    .map((m: any) => {
      const flags = (m.accessFlagsNames || m.accessFlags || []).join(" ");
      const header = `${flags ? flags + " " : ""}${m.name}${m.descriptor}`;
      if (!m.code) return `${header};`;
      const meta = `[stack=${m.code.maxStack} locals=${m.code.maxLocals}]`;
      const exc =
        m.code.exceptionTable?.length > 0
          ? `\n  catch: ${m.code.exceptionTable
              .map((e: any) => `${e.startPc}..${e.endPc}->${e.handlerPc}:${e.catchClassName}`)
              .join(", ")}`
          : "";
      const insns = (m.code.instructions || [])
        .map((inst: any) => {
          const d = inst.details ? ` ${formatBytecodeDetails(inst.details)}` : "";
          return `  ${inst.offset}: ${inst.mnemonic}${d}`;
        })
        .join("\n");
      return `${header} ${meta}${exc}${insns ? "\n" + insns : ""}`;
    })
    .join("\n\n");
}

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
  const PORT = 3000;

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

  const decompileCache = new Map<string, any>();

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

  async function runDecompileWithFallback(
    prompt: string,
    schema: any = DECOMPILE_SCHEMA,
    fastMode: boolean = false
  ) {
    let lastError: unknown;

    if (ai) {
      const attemptSchedule = fastMode
        ? [
            { model: FALLBACK_GEMINI_MODEL, thinking: ThinkingLevel.MINIMAL },
            { model: PRIMARY_GEMINI_MODEL, thinking: ThinkingLevel.LOW },
            { model: FALLBACK_GEMINI_MODEL, thinking: ThinkingLevel.MINIMAL },
            { model: PRIMARY_GEMINI_MODEL, thinking: ThinkingLevel.LOW },
          ]
        : [
            { model: PRIMARY_GEMINI_MODEL, thinking: ThinkingLevel.LOW },
            { model: FALLBACK_GEMINI_MODEL, thinking: ThinkingLevel.MINIMAL },
            { model: PRIMARY_GEMINI_MODEL, thinking: ThinkingLevel.LOW },
            { model: FALLBACK_GEMINI_MODEL, thinking: ThinkingLevel.MINIMAL },
          ];

      for (let i = 0; i < attemptSchedule.length; i++) {
        const { model, thinking } = attemptSchedule[i];
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              thinkingConfig: { thinkingLevel: thinking },
              responseMimeType: "application/json",
              responseSchema: schema,
              systemInstruction: DECOMPILE_SYSTEM_INSTRUCTION,
            },
          });
          if (response.text) {
            return parseJsonResponse(response.text);
          }
          throw new Error(`Empty response from ${model}`);
        } catch (err) {
          lastError = err;
          const isLastAttempt = i === attemptSchedule.length - 1;
          if (isLastAttempt) break;

          const transient = isTransientCapacityError(err);
          // First fallback to the alternate model immediately; wait with backoff on subsequent retries
          if (i === 0 && transient) {
            await sleep(250);
            continue;
          }

          if (transient) {
            const retryMs = extractRetryDelayMs(err) ?? (i === 1 ? 1800 : 3500) + Math.floor(Math.random() * 400);
            console.warn(`Model ${model} busy/rate-limited; retrying in ${retryMs}ms`);
            await sleep(retryMs);
            continue;
          }

          await sleep(300);
        }
      }
    }

    // Optional GPT-OSS 120B OpenAI-compatible fallback
    if (process.env.GPT_OSS_API_KEY) {
      console.warn("Gemini unavailable; falling back to GPT-OSS 120B");
      const raw = await callGptOssFallback(DECOMPILE_SYSTEM_INSTRUCTION, prompt, true);
      return parseJsonResponse(raw);
    }

    throw lastError instanceof Error ? lastError : new Error("Decompilation failed");
  }

  // API Route for AI Decompilation and Source Reconstruction
  app.post("/api/decompile", async (req, res) => {
    try {
      const { classData, chunk, includeAnnotations = true, mode, javaSource } = req.body;

      if (!apiKey && !process.env.GPT_OSS_API_KEY) {
        return res.status(500).json({
          error: "GEMINI_API_KEY environment variable is not configured. Please configure it in Settings > Secrets.",
        });
      }

      if (mode === "annotate") {
        if (!javaSource) {
          return res.status(400).json({ error: "Missing Java source for annotation" });
        }
        const truncatedSource = String(javaSource).slice(0, 45000);
        const annotatePrompt = `Analyze this reconstructed Java class (${classData?.thisClassName || "Class"}, target ${classData?.jdkVersion || "Java"}) and produce a concise classSummary plus high-value method bytecode/architectural annotations (up to 12 most important methods).

\`\`\`java
${truncatedSource}
\`\`\``;
        const result = await runDecompileWithFallback(annotatePrompt, ANNOTATE_ONLY_SCHEMA, false);
        return res.json(result);
      }

      if (!classData) {
        return res.status(400).json({ error: "Missing class data" });
      }

      const wantAnnotations = Boolean(includeAnnotations);
      const fieldsText = formatCompactFields(classData.fields || []);
      const methodsText = formatCompactMethods(classData.methods || []);
      const chunkTag = chunk ? `chunk:${chunk.index}/${chunk.total}` : "full";
      const modeTag = wantAnnotations ? "annotated" : "fast";
      const cacheKey = `${modeTag}|${chunkTag}|${classData.thisClassName}|${classData.superClassName}|${classData.majorVersion}|${fieldsText}|${methodsText}`;

      const cached = decompileCache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const isFollowUpChunk = Boolean(chunk && chunk.index > 0);
      const batchNote = chunk
        ? isFollowUpChunk
          ? `\nBatch ${chunk.index + 1} of ${chunk.total}: Reconstruct ONLY the methods listed below. Do NOT output package, imports, fields, or the outer class declaration.`
          : `\nBatch 1 of ${chunk.total} for a large class: Reconstruct the package declaration, imports, class header, ALL fields listed below, and ONLY the methods in this batch inside the class body (closing with '}').`
        : "";

      const prompt = wantAnnotations
        ? `You are an expert JVM bytecode decompiler and senior Java systems engineer specializing in Java reverse engineering, compiler design, and platform-level optimization.
Reconstruct high-level Java source code from the parsed JVM class structure and javap-style bytecode disassembly, and provide educational annotations.${batchNote}

Class: ${classData.thisClassName}
Extends: ${classData.superClassName}
Implements: ${(classData.interfaces || []).join(", ") || "none"}
Target: ${classData.jdkVersion} (Major ${classData.majorVersion})
Modifiers: ${(classData.accessFlagsNames || []).join(" ") || "package-private"}

Fields:
${fieldsText}

Methods & Bytecode:
${methodsText}

Core Requirements:
1. Reconstruct accurate, compilation-ready Java source code preserving annotations, fields, initializers, exception handlers, and method signatures.
2. Resolve local variables into natural, readable names based on bytecode usage.
3. Reconstruct standard Java control structures (if-else, loops, switch, try-catch-finally) from branch targets.
4. Minecraft Mod Support: Recognize Forge/NeoForge/Fabric APIs and MCreator patterns when present and add modding-specific annotations.
5. Provide concise inline comments/annotations explaining bytecode mechanics and compiler artifacts.`
        : `Reconstruct clean, accurate, compilation-ready Java source code from this JVM bytecode disassembly. Output ONLY pure Java code—omit Javadocs, summary prose, and explanatory comments to maximize speed.${batchNote}

Class: ${classData.thisClassName}
Extends: ${classData.superClassName}
Implements: ${(classData.interfaces || []).join(", ") || "none"}
Target: ${classData.jdkVersion} (Major ${classData.majorVersion})
Modifiers: ${(classData.accessFlagsNames || []).join(" ") || "package-private"}

Fields:
${fieldsText}

Methods & Bytecode:
${methodsText}

Rules: Preserve all field/method signatures, exception handlers, control flow (if-else, loops, switch, try-catch), and readable local variable names.`;

      const schema = wantAnnotations
        ? isFollowUpChunk
          ? CHUNK_DECOMPILE_SCHEMA
          : DECOMPILE_SCHEMA
        : isFollowUpChunk
          ? FAST_CHUNK_DECOMPILE_SCHEMA
          : FAST_DECOMPILE_SCHEMA;

      const rawResult = await runDecompileWithFallback(prompt, schema, !wantAnnotations);
      const parsedResult = wantAnnotations
        ? rawResult
        : {
            ...rawResult,
            classSummary: "",
            annotations: [],
          };

      if (decompileCache.size >= 100) {
        const oldestKey = decompileCache.keys().next().value;
        if (oldestKey) decompileCache.delete(oldestKey);
      }
      decompileCache.set(cacheKey, parsedResult);

      res.json(parsedResult);
    } catch (error: any) {
      console.error("Decompilation error:", error);
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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
