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

const DECOMPILE_SYSTEM_INSTRUCTION =
  "You are a world-class, high-speed Java decompiler. Respond strictly with a valid JSON object conforming to the requested schema. Ensure the reconstructed Java code is flawless, beautiful, and syntactically valid. Keep explanations extremely concise and direct to maximize decompilation speed.";

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
    const { classData } = req.body;
    if (!classData) {
      return res.status(400).json({ error: "Missing class data" });
    }

    if (!apiKey && !process.env.GPT_OSS_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY environment variable is not configured. Please add it in Environment Variables.",
      });
    }

    const compactFields = (classData.fields || []).map((f: any) => ({
      name: f.name,
      descriptor: f.descriptor,
      accessFlags: f.accessFlagsNames,
    }));

    const compactMethods = (classData.methods || []).map((m: any) => ({
      name: m.name,
      descriptor: m.descriptor,
      accessFlags: m.accessFlagsNames,
      ...(m.code
        ? {
            maxStack: m.code.maxStack,
            maxLocals: m.code.maxLocals,
            ...(m.code.exceptionTable?.length ? { exceptionTable: m.code.exceptionTable } : {}),
            instructions: m.code.instructions?.map((inst: any) => ({
              offset: inst.offset,
              mnemonic: inst.mnemonic,
              ...(inst.details ? { details: inst.details } : {}),
            })),
          }
        : {}),
    }));

    const prompt = `You are an expert JVM bytecode decompiler and senior Java systems engineer specializing in Java reverse engineering, compiler design, and platform-level optimization.
Reconstruct the original high-level Java source code from the parsed JVM class structure and disassembled bytecode instructions, and provide educational annotations.

Class Structure:
- Class Name: ${classData.thisClassName}
- Super Class: ${classData.superClassName}
- Interfaces: ${JSON.stringify(classData.interfaces || [])}
- JDK Target Version: ${classData.jdkVersion} (Major version: ${classData.majorVersion})
- Access Modifiers/Flags: ${JSON.stringify(classData.accessFlagsNames || [])}
- Fields: ${JSON.stringify(compactFields)}
- Methods & Bytecode: ${JSON.stringify(compactMethods)}

Core Requirements:
1. Reconstruct the complete, correct, and compilation-ready high-level Java source code. Preserve all class annotations, fields, initializers, exception handlers, and method signatures.
2. Resolve local variables into natural, readable variable names (instead of 'local_0', 'local_1', etc.) based on how they are used in the bytecode.
3. Incorporate standard Java control structures (if-else, for/while loops, switch-cases, try-catch-finally) by analyzing jump targets and branch conditions.
4. Minecraft Mod Support: If this is a Minecraft mod element or MCreator-generated custom item, procedure, event handler, block, or entity, recognize standard Forge/NeoForge/Fabric APIs and MCreator patterns and add modding-specific annotations.
5. Provide concise inline Javadoc or comments explaining what the code does, how specific JVM bytecodes map to high-level Java syntax, and any compiler artifacts (synthetic bridges, string concatenation optimizations).`;

    let lastError: unknown;

    if (ai) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: PRIMARY_GEMINI_MODEL,
            contents: prompt,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: "application/json",
              responseSchema: DECOMPILE_SCHEMA,
              systemInstruction: DECOMPILE_SYSTEM_INSTRUCTION,
            },
          });
          if (response.text) {
            return res.status(200).json(parseJsonResponse(response.text));
          }
          throw new Error("Empty response from primary Gemini model");
        } catch (err) {
          lastError = err;
          const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
          if (
            msg.includes("429") ||
            msg.includes("503") ||
            msg.includes("resource_exhausted") ||
            msg.includes("unavailable") ||
            msg.includes("overloaded")
          ) {
            break;
          }
          if (attempt === 0) {
            await sleep(250);
          }
        }
      }

      try {
        const fallbackResponse = await ai.models.generateContent({
          model: FALLBACK_GEMINI_MODEL,
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            responseMimeType: "application/json",
            responseSchema: DECOMPILE_SCHEMA,
            systemInstruction: DECOMPILE_SYSTEM_INSTRUCTION,
          },
        });
        if (fallbackResponse.text) {
          return res.status(200).json(parseJsonResponse(fallbackResponse.text));
        }
        throw new Error("Empty response from fallback Gemini model");
      } catch (err) {
        lastError = err;
      }
    }

    if (process.env.GPT_OSS_API_KEY) {
      const parsedResult = await callGptOssFallback(prompt);
      return res.status(200).json(parsedResult);
    }

    throw lastError instanceof Error ? lastError : new Error("Decompilation failed");
  } catch (error: any) {
    console.error("Decompilation error:", error);
    return res.status(500).json({ error: error.message || "Decompilation failed" });
  }
}
