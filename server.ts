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

  async function runDecompileWithFallback(prompt: string) {
    let lastError: unknown;

    if (ai) {
      // Attempt 1 & 2: Primary Gemini 4 Hydrogen with short backoff retry
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
            return parseJsonResponse(response.text);
          }
          throw new Error("Empty response from primary Gemini model");
        } catch (err) {
          lastError = err;
          if (attempt === 0) {
            await sleep(750);
          }
        }
      }

      // Attempt 3: Automatic Gemini Flash-Lite fallback (same API key, separate capacity pool)
      try {
        console.warn("Primary model busy; falling back to", FALLBACK_GEMINI_MODEL);
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
          return parseJsonResponse(fallbackResponse.text);
        }
        throw new Error("Empty response from fallback Gemini model");
      } catch (err) {
        lastError = err;
      }
    }

    // Attempt 4: Optional GPT-OSS 120B OpenAI-compatible fallback
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
      const { classData } = req.body;
      if (!classData) {
        return res.status(400).json({ error: "Missing class data" });
      }

      if (!apiKey && !process.env.GPT_OSS_API_KEY) {
        return res.status(500).json({
          error: "GEMINI_API_KEY environment variable is not configured. Please configure it in Settings > Secrets.",
        });
      }

      const prompt = `
You are an expert JVM bytecode decompiler and senior Java systems engineer specializing in Java reverse engineering, compiler design, and platform-level optimization.
Your task is to reconstruct the original high-level Java source code from the provided parsed JVM class structure and disassembled bytecode instructions, and provide educational annotations.

Here is the parsed class structure:
- Class Name: ${classData.thisClassName}
- Super Class: ${classData.superClassName}
- Interfaces: ${JSON.stringify(classData.interfaces)}
- JDK Target Version: ${classData.jdkVersion} (Major version: ${classData.majorVersion})
- Access Modifiers/Flags: ${JSON.stringify(classData.accessFlagsNames)}

Fields:
${JSON.stringify(classData.fields, null, 2)}

Methods and Disassembled Bytecode Mnemonic Instructions:
${JSON.stringify(
  classData.methods.map((m: any) => ({
    name: m.name,
    descriptor: m.descriptor,
    accessFlags: m.accessFlagsNames,
    maxStack: m.code?.maxStack,
    maxLocals: m.code?.maxLocals,
    exceptionTable: m.code?.exceptionTable,
    instructions: m.code?.instructions?.map((inst: any) => ({
      offset: inst.offset,
      mnemonic: inst.mnemonic,
      details: inst.details,
    })),
  })),
  null,
  2
)}

Core Requirements:
1. Reconstruct the complete, correct, and compilation-ready high-level Java source code. Preserve all class annotations, fields, initializers, exception handlers, and method signatures.
2. Resolve local variables into natural, readable variable names (instead of 'local_0', 'local_1', etc.) based on how they are used in the bytecode.
3. Incorporate standard Java control structures (like if-else, for/while loops, switch-cases, try-catch-finally blocks) by analyzing jump targets and branch conditions.
4. Minecraft Mod Support: If this is a Minecraft mod element or MCreator-generated custom item, procedure, event handler, block, or entity (since the developer works extensively with Minecraft MCreator procedures and source code), recognize standard Forge/NeoForge/Fabric APIs, MCreator patterns, and add rich modding-specific code annotations!
5. Provide detailed, elegant, inline Javadoc or comments explaining:
   - What the code is doing.
   - How specific JVM bytecodes map to high-level Java syntax (e.g., explaining how 'invokevirtual' or 'invokedynamic' represents lambdas or method calls).
   - Any compiler artifacts (like synthetic bridge methods, string concatenation optimizations).
6. Format your response as a valid JSON object with the following fields:
   - "javaSource": "The fully reconstructed Java source code string"
   - "classSummary": "A concise, developer-friendly summary of the class's purpose, design, and compiler details"
   - "annotations": [
       {
         "method": "Name of the method being explained",
         "concept": "High-level concept (e.g., 'String Concatenation Optimization' or 'Exception Handling Flow')",
         "explanation": "Detailed explanation of the JVM bytecode mechanics used for this concept"
       }
     ]

Ensure the output is strictly valid JSON in the response, matching the JSON schema. Do not enclose the JSON inside a markdown block like \`\`\`json.
`;

      const parsedResult = await runDecompileWithFallback(prompt);
      res.json(parsedResult);
    } catch (error: any) {
      console.error("Decompilation error:", error);
      res.status(500).json({ error: error.message || "Decompilation failed" });
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
