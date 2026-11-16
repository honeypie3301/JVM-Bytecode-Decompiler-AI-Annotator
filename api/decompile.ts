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
        { role: "system", content: DECOMPILE_SYSTEM_INSTRUCTION },
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
    const { classData, chunk, includeAnnotations = true, mode, javaSource } = req.body;

    if (!apiKey && !process.env.GPT_OSS_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY environment variable is not configured. Please add it in Environment Variables.",
      });
    }

    async function callGeminiWithOrder(promptText: string, schemaObj: any, fastMode: boolean) {
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
              contents: promptText,
              config: {
                thinkingConfig: { thinkingLevel: thinking },
                responseMimeType: "application/json",
                responseSchema: schemaObj,
                systemInstruction: DECOMPILE_SYSTEM_INSTRUCTION,
              },
            });
            if (response.text) {
              return parseJsonResponse(response.text);
            }
            throw new Error(`Empty response from ${model}`);
          } catch (err) {
            lastError = err;
            if (i === attemptSchedule.length - 1) break;

            const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
            const transient =
              msg.includes("429") ||
              msg.includes("503") ||
              msg.includes("resource_exhausted") ||
              msg.includes("unavailable") ||
              msg.includes("high demand") ||
              msg.includes("overloaded") ||
              msg.includes("timed out") ||
              msg.includes("timeout");

            if (i === 0 && transient) {
              await sleep(250);
              continue;
            }

            if (transient) {
              const retryMs = extractRetryDelayMs(err) ?? (i === 1 ? 1800 : 3500) + Math.floor(Math.random() * 400);
              await sleep(retryMs);
              continue;
            }

            await sleep(300);
          }
        }
      }

      if (process.env.GPT_OSS_API_KEY) {
        return callGptOssFallback(promptText);
      }

      throw lastError instanceof Error ? lastError : new Error("Decompilation failed");
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
      const result = await callGeminiWithOrder(annotatePrompt, ANNOTATE_ONLY_SCHEMA, false);
      return res.status(200).json(result);
    }

    if (!classData) {
      return res.status(400).json({ error: "Missing class data" });
    }

    const wantAnnotations = Boolean(includeAnnotations);
    const fieldsText = formatCompactFields(classData.fields || []);
    const methodsText = formatCompactMethods(classData.methods || []);
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

    const rawResult = await callGeminiWithOrder(prompt, schema, !wantAnnotations);
    const parsedResult = wantAnnotations
      ? rawResult
      : {
          ...rawResult,
          classSummary: "",
          annotations: [],
        };

    return res.status(200).json(parsedResult);
  } catch (error: any) {
    console.error("Decompilation error:", error);
    return res.status(500).json({ error: extractReadableErrorMessage(error) });
  }
}
