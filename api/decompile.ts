import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import dotenv from "dotenv";
import {
  CfrCancelledError,
  CfrRestrictedError,
  decompileClassWithCfr,
  readClassMapping,
} from "../src/services/cfr.js";

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

function parseJsonResponse(rawText: string) {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const cleaned = trimmed.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    return JSON.parse(cleaned);
  }
}

async function callGptOssFallback(prompt: string) {
  const gptOssKey = process.env.GPT_OSS_API_KEY;
  if (!gptOssKey) {
    throw new Error("GPT_OSS_API_KEY not configured");
  }

  const baseUrl = (process.env.GPT_OSS_BASE_URL || DEFAULT_GPT_OSS_BASE_URL).replace(/\/+$/, "");
  const model = process.env.GPT_OSS_MODEL || DEFAULT_GPT_OSS_MODEL;

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gptOssKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: ANNOTATE_SYSTEM_INSTRUCTION },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
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
  return parseJsonResponse(content);
}

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

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { classBytesBase64, fileName, mappingText, classData, includeAnnotations = false, mode, javaSource } =
      req.body;

    async function callAnnotate(promptText: string) {
      if (ai) {
        const schedule = [
          { model: PRIMARY_GEMINI_MODEL, thinking: ThinkingLevel.LOW },
          { model: FALLBACK_GEMINI_MODEL, thinking: ThinkingLevel.MINIMAL },
        ];
        for (const { model, thinking } of schedule) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: promptText,
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
          } catch {
            // Try next fallback
          }
        }
      }
      if (process.env.GPT_OSS_API_KEY) {
        return {
          ...(await callGptOssFallback(promptText)),
          summaryModel: process.env.GPT_OSS_MODEL || DEFAULT_GPT_OSS_MODEL,
        };
      }
      throw new Error("AI annotation unavailable");
    }

    if (mode === "annotate") {
      if (!apiKey && !process.env.GPT_OSS_API_KEY) {
        return res.status(500).json({
          error: "GEMINI_API_KEY environment variable is not configured. Please add it in Environment Variables.",
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
      const result = await callAnnotate(annotatePrompt);
      return res.status(200).json(result);
    }

    if (!classBytesBase64 || typeof classBytesBase64 !== "string") {
      return res.status(400).json({ error: "Missing binary .class payload for CFR decompilation." });
    }

    const bytes = new Uint8Array(Buffer.from(classBytesBase64, "base64"));
    const mapping = readClassMapping(mappingText);
    const cfrSource = await decompileClassWithCfr(bytes, {
      mapping,
      fileName: typeof fileName === "string" ? fileName : undefined,
    });

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
        const noteResult = await callAnnotate(annotatePrompt);
        classSummary = noteResult?.classSummary || "";
        summaryModel = noteResult?.summaryModel;
        annotations = Array.isArray(noteResult?.annotations) ? noteResult.annotations : [];
      } catch {
        // Return CFR source even if AI annotation fails
      }
    }

    return res.status(200).json({
      javaSource: cfrSource,
      classSummary,
      summaryModel,
      annotations,
    });
  } catch (error: any) {
    if (error instanceof CfrCancelledError) {
      return res.status(499).json({ cancelled: true, error: "Decompilation cancelled" });
    }
    if (error instanceof CfrRestrictedError) {
      return res.status(403).json({
        restricted: true,
        error: "Restricted bytecode signature detected. Source reconstruction is disabled.",
      });
    }
    console.error("Decompilation error:", error);
    return res.status(500).json({ error: extractReadableErrorMessage(error) });
  }
}
