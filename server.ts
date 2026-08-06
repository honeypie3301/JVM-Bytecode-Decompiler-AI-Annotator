import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set up JSON body parser with increased limit for larger class files
  app.use(express.json({ limit: "50mb" }));

  // Initialize the server-side Gemini client
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  // API Route for AI Decompilation and Source Reconstruction
  app.post("/api/decompile", async (req, res) => {
    try {
      const { classData } = req.body;
      if (!classData) {
        return res.status(400).json({ error: "Missing class data" });
      }

      // Check if API key is configured
      if (!apiKey) {
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

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
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
          },
          systemInstruction: "You are a world-class, high-speed Java decompiler. Respond strictly with a valid JSON object conforming to the requested schema. Ensure the reconstructed Java code is flawless, beautiful, and syntactically valid. Keep explanations extremely concise and direct to maximize decompilation speed.",
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Empty response from Gemini");
      }

      let parsedResult;
      try {
        parsedResult = JSON.parse(responseText.trim());
      } catch (parseError) {
        console.error("Failed to parse Gemini JSON output. Raw output was:", responseText);
        // Fallback in case response had markdown block or formatting issues
        const cleanJsonStr = responseText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
        parsedResult = JSON.parse(cleanJsonStr);
      }

      res.json(parsedResult);
    } catch (error: any) {
      console.error("Decompilation error:", error);
      res.status(500).json({ error: error.message || "Decompilation failed" });
    }
  });

  // API Route for Interactive AI Chat
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, javaSource, classSummary, history } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Missing message" });
      }

      if (!apiKey) {
        return res.status(500).json({
          error: "GEMINI_API_KEY environment variable is not configured. Please configure it in Settings > Secrets.",
        });
      }

      // Build chat context
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

      const chat = ai.chats.create({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: chatContext,
        },
      });

      // Send chat message
      const response = await chat.sendMessage({ message });
      res.json({ text: response.text });
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
