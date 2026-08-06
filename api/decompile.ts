import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize the Gemini client using Vercel's environment variable
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

export default async function handler(req: any, res: any) {
  // Handle CORS
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

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY environment variable is not configured on Vercel. Please add it in your Vercel Project Settings > Environment Variables.",
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
      const cleanJsonStr = responseText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      parsedResult = JSON.parse(cleanJsonStr);
    }

    return res.status(200).json(parsedResult);
  } catch (error: any) {
    console.error("Decompilation error:", error);
    return res.status(500).json({ error: error.message || "Decompilation failed" });
  }
}
