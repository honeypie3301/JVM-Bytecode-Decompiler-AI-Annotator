import React, { useState, useRef, useEffect } from "react";
import {
  Cpu,
  FileCode,
  Binary,
  Database,
  Upload,
  Code,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Info,
  Terminal,
  Copy,
  Check,
  Download,
  Shield,
  HelpCircle,
  Play,
  X,
  Trash2,
  FolderOpen,
  Settings,
  Key
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { parseClassFile, ParsedClass, getJdkVersion } from "./classParser";

export interface DecompilerFile {
  id: string;
  name: string;
  size: number;
  status: "idle" | "parsing" | "parsed" | "decompiling" | "decompiled" | "failed";
  parsedClass?: ParsedClass;
  decompiledResult?: {
    javaSource: string;
    classSummary: string;
    annotations: Array<{ method: string; concept: string; explanation: string }>;
  };
  error?: string;
}

export default function App() {
  // State variables
  const [files, setFiles] = useState<DecompilerFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client-side API Key settings for Static Deployment (e.g. GitHub Pages)
  const [userApiKey, setUserApiKey] = useState<string>(() => localStorage.getItem("user_gemini_api_key") || "");
  const [showKeySettings, setShowKeySettings] = useState(false);

  useEffect(() => {
    if (userApiKey) {
      localStorage.setItem("user_gemini_api_key", userApiKey);
    } else {
      localStorage.removeItem("user_gemini_api_key");
    }
  }, [userApiKey]);

  // Layout states
  const [activeTab, setActiveTab] = useState<"java" | "bytecode" | "structure">("java");
  const [selectedMethodIdx, setSelectedMethodIdx] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset selected method index on file switch to avoid out-of-bounds rendering
  useEffect(() => {
    setSelectedMethodIdx(0);
  }, [selectedFileId]);

  // Derived active file parameters
  const activeFile = files.find((f) => f.id === selectedFileId) || null;
  const parsedClass = activeFile?.parsedClass || null;
  const decompiledResult = activeFile?.decompiledResult || null;
  const isParsing = activeFile?.status === "parsing";
  const isDecompiling = activeFile?.status === "decompiling";

  // Handle local files parsing
  const processFiles = (fileList: FileList) => {
    const validFiles: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.name.endsWith(".class")) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      setError("Only .class compiled Java bytecode files are supported.");
      return;
    }

    const newDecompilerFiles: DecompilerFile[] = validFiles.map((file) => {
      const fileId = Math.random().toString(36).substring(7);
      return {
        id: fileId,
        name: file.name,
        size: file.size,
        status: "parsing",
      };
    });

    setFiles((prev) => [...prev, ...newDecompilerFiles]);
    
    // Select the first added file if none is selected
    setSelectedFileId((current) => current || newDecompilerFiles[0].id);

    // Asynchronously read and parse class files
    validFiles.forEach((file, index) => {
      const targetDecompilerFile = newDecompilerFiles[index];
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const parsed = parseClassFile(buffer);
          
          setFiles((prev) =>
            prev.map((f) =>
              f.id === targetDecompilerFile.id
                ? { ...f, status: "parsed", parsedClass: parsed }
                : f
            )
          );
        } catch (err: any) {
          console.error(err);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === targetDecompilerFile.id
                ? { ...f, status: "failed", error: err.message || "Failed to parse binary class file structure." }
                : f
            )
          );
        }
      };

      reader.onerror = () => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === targetDecompilerFile.id
              ? { ...f, status: "failed", error: "Failed to read local file content." }
              : f
          )
        );
      };

      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList) {
      processFiles(fileList);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const fileList = e.dataTransfer.files;
    if (fileList) {
      processFiles(fileList);
    }
  };

  // Decompile single file via AI (Server route or Client-side direct call)
  const decompileFile = async (fileId: string) => {
    const targetFile = files.find((f) => f.id === fileId);
    if (!targetFile || !targetFile.parsedClass || targetFile.status === "decompiling") return;

    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId ? { ...f, status: "decompiling", error: undefined } : f
      )
    );

    try {
      let data;

      if (userApiKey) {
        // Direct Client-Side decompilation using browser-based Gemini REST call
        const classData = targetFile.parsedClass;
        const promptText = `
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

        const modelName = "gemini-2.5-flash";
        const trimmedKey = userApiKey.trim();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${trimmedKey}`;
        
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  javaSource: {
                    type: "STRING",
                    description: "The complete, correct, and compilation-ready reconstructed high-level Java source code string",
                  },
                  classSummary: {
                    type: "STRING",
                    description: "A concise, developer-friendly summary of the class's purpose, design, and compiler details",
                  },
                  annotations: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        method: {
                          type: "STRING",
                          description: "Name of the method being annotated",
                        },
                        concept: {
                          type: "STRING",
                          description: "High-level concept",
                        },
                        explanation: {
                          type: "STRING",
                          description: "Detailed explanation of the JVM bytecode mechanics",
                        },
                      },
                      required: ["method", "concept", "explanation"],
                    },
                  },
                },
                required: ["javaSource", "classSummary", "annotations"],
              },
            },
            systemInstruction: {
              parts: [{
                text: "You are a world-class, high-speed Java decompiler. Respond strictly with a valid JSON object conforming to the requested schema. Ensure the reconstructed Java code is flawless, beautiful, and syntactically valid. Keep explanations extremely concise and direct to maximize decompilation speed.",
              }]
            }
          }),
        });

        if (!response.ok) {
          const errorJson = await response.json().catch(() => ({}));
          throw new Error(errorJson?.error?.message || `API error ${response.status}`);
        }

        const result = await response.json();
        const textContent = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textContent) {
          throw new Error("Empty response from client-side Gemini API.");
        }
        
        try {
          data = JSON.parse(textContent.trim());
        } catch (parseError) {
          console.warn("Standard JSON.parse failed on client response, attempting cleanup:", parseError);
          const cleanJsonStr = textContent.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
          data = JSON.parse(cleanJsonStr);
        }
      } else {
        // Fallback to Express backend decompile endpoint
        const res = await fetch("/api/decompile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classData: targetFile.parsedClass }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Server failed to decompile the class file.");
        }

        data = await res.json();
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, status: "decompiled", decompiledResult: data }
            : f
        )
      );
    } catch (err: any) {
      console.error(err);
      const isStaticSite = !window.location.port || window.location.hostname.includes("github.io");
      const errorMsg = isStaticSite && !userApiKey
        ? "Decompilation failed. Since this is hosted as a static site (such as GitHub Pages), you must configure your own Gemini API Key in Settings (gear icon in the top right) to run decompilation directly in the browser."
        : (err.message || "Decompilation failed.");

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, status: "failed", error: errorMsg }
            : f
        )
      );
    }
  };

  // Bulk decompile all files currently at status 'parsed'
  const handleBulkDecompile = async () => {
    const parsedFiles = files.filter((f) => f.status === "parsed");
    if (parsedFiles.length === 0) return;

    await Promise.all(parsedFiles.map((f) => decompileFile(f.id)));
  };

  // Remove individual file from list
  const handleRemoveFile = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFiles((prev) => {
      const filtered = prev.filter((f) => f.id !== fileId);
      if (selectedFileId === fileId) {
        setSelectedFileId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  // Clear workspace
  const handleClearAll = () => {
    setFiles([]);
    setSelectedFileId(null);
    setError(null);
  };

  // Copy Java source code helper
  const handleCopyCode = () => {
    if (decompiledResult?.javaSource) {
      navigator.clipboard.writeText(decompiledResult.javaSource);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Download Java file helper
  const handleDownloadJavaFile = () => {
    if (decompiledResult && parsedClass) {
      const className = parsedClass.thisClassName.split("/").pop() || "DecompiledClass";
      const blob = new Blob([decompiledResult.javaSource], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${className}.java`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  // Format size helper
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = 1;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#E0E0E6] flex flex-col selection:bg-zinc-800 selection:text-white font-sans">
      {/* Header */}
      <header className="border-b border-[#23232A] bg-[#121217] sticky top-0 z-50 shrink-0">
        <div className="w-full max-w-full px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 100 100" className="w-9 h-9 text-emerald-400" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polygon points="50,5 90,25 90,75 50,95 10,75 10,25" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" fill="url(#brandGrad)" />
                <path d="M25,40 H45 L50,45" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                <path d="M75,40 H55 L50,45" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                <path d="M50,45 V75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                <path d="M35,46 L23,54 L35,62" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M65,46 L77,54 L65,62" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M50,28 Q50,45 67,45 Q50,45 50,62 Q50,45 33,45 Q50,45 50,28 Z" fill="currentColor" />
                <defs>
                  <radialGradient id="brandGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#102E1B" />
                    <stop offset="100%" stopColor="#0B0B0E" />
                  </radialGradient>
                </defs>
              </svg>
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-lg text-white leading-none">
                Jad<span className="text-emerald-400">AI</span>
              </h1>
              <p className="text-[9px] text-[#5C5C66] font-mono hidden sm:block uppercase tracking-widest mt-1">
                Intelligent JVM Decompiler & Annotator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setShowKeySettings(!showKeySettings)}
              className={`text-xs font-mono transition border px-2.5 py-1.5 rounded-md flex items-center gap-2 ${
                userApiKey
                  ? "text-emerald-400 bg-[#0F2218] border-emerald-500/20 hover:border-emerald-500/40 hover:bg-[#153022]"
                  : "text-[#90909A] bg-[#16161D] border-[#23232A] hover:border-zinc-700 hover:text-white"
              }`}
              title="Configure Custom Gemini API Key for static deployments"
            >
              <Settings className={`w-3.5 h-3.5 ${showKeySettings ? "rotate-45" : ""} transition-transform duration-200`} />
              <span className="hidden sm:inline">{userApiKey ? "API Key: Configured" : "API Key Settings"}</span>
            </button>

            {files.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs font-mono text-[#90909A] hover:text-[#EF5350] transition bg-[#16161D] border border-[#23232A] hover:border-[#EF5350]/30 hover:bg-[#EF5350]/10 px-2.5 py-1.5 rounded-md"
              >
                Clear All Files
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Settings Panel */}
      <AnimatePresence>
        {showKeySettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-[#121217] border-b border-[#23232A] overflow-hidden shrink-0"
          >
            <div className="w-full max-w-7xl mx-auto px-6 py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-1.5">
                  <Key className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Gemini API Key Configuration</h3>
                </div>
                <p className="text-xs text-[#90909A] leading-relaxed">
                  By default, this app uses the built-in server-side API Key. If you build and deploy this app as a static site (like <strong className="text-zinc-300">GitHub Pages</strong>), the backend server is inactive. Enter your Gemini API key below to run high-speed AI reconstruction directly in your browser. Your key is stored locally in your browser cache and is never sent to any server other than Google's Gemini endpoint.
                </p>
              </div>
              <div className="w-full md:w-80 flex items-center gap-2 shrink-0">
                <input
                  type="password"
                  value={userApiKey}
                  onChange={(e) => setUserApiKey(e.target.value)}
                  placeholder="Enter your Gemini API Key..."
                  className="flex-1 text-xs bg-[#0E0E12] border border-[#23232A] focus:border-zinc-500 rounded px-3 py-2 text-white font-mono placeholder:text-zinc-700 outline-none"
                />
                {userApiKey && (
                  <button
                    onClick={() => setUserApiKey("")}
                    className="text-[10px] font-mono text-[#90909A] hover:text-[#EF5350] bg-[#16161D] border border-[#23232A] px-2.5 py-2 rounded transition cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-full px-4 sm:px-6 py-4 flex flex-col gap-4 overflow-hidden">
        
        {/* Error Notification */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 border-l-4 border-l-[#EF5350] bg-[#1E1E26] text-[#E0E0E6] rounded-r-lg flex items-start gap-3 text-xs border-y border-r border-[#23232A] shrink-0"
          >
            <AlertCircle className="w-4 h-4 text-[#EF5350] shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold text-white">Notification</h4>
              <p className="text-[#90909A] leading-relaxed font-mono text-[11px] mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-[#90909A] hover:text-[#EF5350]">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Landing Page (Visible if no files uploaded yet) */}
        {files.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center py-8 max-w-2xl mx-auto w-full">
            
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full p-12 border-2 border-dashed rounded-xl cursor-pointer text-center transition duration-300 relative overflow-hidden group ${
                isDragging
                  ? "border-zinc-500 bg-zinc-800/10 shadow-md shadow-zinc-800/10"
                  : "border-[#23232A] bg-[#0E0E12] hover:border-zinc-700 hover:bg-[#121217]"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".class"
                multiple
                className="hidden"
              />

              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#23232A] to-transparent"></div>
              
              <div className="mb-6 mx-auto w-14 h-14 rounded-xl bg-[#1E1E26] border border-[#23232A] flex items-center justify-center group-hover:scale-105 transition duration-300">
                <Upload className="w-7 h-7 text-zinc-400 group-hover:text-white transition" />
              </div>

              <h3 className="text-base font-semibold tracking-tight mb-2 text-white">
                JadAI JVM Decompiler
              </h3>
              <p className="text-xs text-[#90909A] max-w-sm mx-auto mb-4 leading-relaxed">
                Drag & drop your compiled <code className="text-zinc-300 font-mono">.class</code> files here or click to browse. Easily upload multiple class files and decompile them.
              </p>

              <div className="flex items-center justify-center gap-4 text-[10px] text-[#5C5C66] font-mono">
                <span className="flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" /> Client binary analysis
                </span>
                <span>•</span>
                <span>Supports bulk action</span>
              </div>
            </div>

            {/* AI Decompiler Features list */}
            <div className="mt-12 border-t border-[#23232A] pt-6 w-full grid grid-cols-1 md:grid-cols-2 gap-4 text-[#90909A] text-[11px]">
              <div className="flex gap-2.5">
                <Terminal className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-white mb-0.5">High-Speed Binary Parser</h5>
                  <p className="leading-relaxed text-[#5C5C66]">Instantly extracts constant pool references, field descriptors, and modifiers from bytecode. Disassembles raw JVM opcodes on the fly.</p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <Sparkles className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-white mb-0.5">AI Source Reconstruction</h5>
                  <p className="leading-relaxed text-[#5C5C66]">Leverages Gemini flash to reverse-engineer high-fidelity, compilation-ready Java code, automatically recovering conditional loops and MCreator patterns.</p>
                </div>
              </div>
            </div>

          </div>
        ) : (
          
          /* Main Multi-Column Responsive Layout */
          <div className="flex-1 flex flex-col md:flex-row xl:grid xl:grid-cols-12 gap-4 overflow-hidden min-h-0 w-full">
            
            {/* COLUMN 1: Bulk Files Manager (width: xl:col-span-3) */}
            <div className="w-full md:w-80 xl:w-auto xl:col-span-3 flex flex-col gap-3 shrink-0 min-h-0 bg-[#0E0E12] border border-[#23232A] rounded-xl p-3">
              <div className="flex items-center justify-between border-b border-[#23232A] pb-2">
                <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-zinc-400" /> Files ({files.length})
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] font-mono px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 transition"
                >
                  + Add Files
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".class"
                  multiple
                  className="hidden"
                />
              </div>

              {/* Sidebar drag drop pocket */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`p-3 border-2 border-dashed border-zinc-800 rounded-lg text-center transition ${
                  isDragging ? "bg-zinc-800/10 border-zinc-500" : "bg-[#09090B]"
                }`}
              >
                <p className="text-[10px] text-[#5C5C66] font-mono">
                  Drag .class files here to queue
                </p>
              </div>

              {/* Scrollable file list */}
              <div className="flex-1 overflow-y-auto pr-0.5 flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-zinc-900 min-h-[150px]">
                {files.map((file) => {
                  const isSelected = selectedFileId === file.id;
                  
                  // Pick status colors
                  let statusBadge = "";
                  if (file.status === "parsing") {
                    statusBadge = "border-zinc-800 bg-zinc-900/40 text-[#90909A]";
                  } else if (file.status === "parsed") {
                    statusBadge = "border-zinc-800 bg-[#1E1E26] text-zinc-300";
                  } else if (file.status === "decompiling") {
                    statusBadge = "border-zinc-700 bg-zinc-800 text-yellow-400 animate-pulse";
                  } else if (file.status === "decompiled") {
                    statusBadge = "border-zinc-800/40 bg-zinc-900/80 text-emerald-400";
                  } else if (file.status === "failed") {
                    statusBadge = "border-red-900/30 bg-red-950/20 text-red-400";
                  }

                  return (
                    <div
                      key={file.id}
                      onClick={() => setSelectedFileId(file.id)}
                      className={`p-2 rounded-lg border text-left transition duration-200 cursor-pointer relative group flex items-center justify-between gap-2 ${
                        isSelected
                          ? "border-zinc-500 bg-zinc-800/20"
                          : "border-[#23232A] bg-[#0F0F12] hover:bg-[#121217]"
                      }`}
                    >
                      <div className="min-w-0 flex-1 flex flex-col gap-0.5 font-mono">
                        <span className={`text-[11px] font-bold truncate ${isSelected ? "text-white" : "text-[#E0E0E6]"}`} title={file.name}>
                          {file.name}
                        </span>
                        <div className="flex items-center gap-1.5 text-[9px]">
                          <span className="text-[#5C5C66]">{formatSize(file.size)}</span>
                          <span className={`px-1 rounded border text-[8px] uppercase tracking-wider font-semibold ${statusBadge}`}>
                            {file.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {file.status === "parsed" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              decompileFile(file.id);
                            }}
                            title="Decompile"
                            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white shrink-0"
                          >
                            <Play className="w-2.5 h-2.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleRemoveFile(file.id, e)}
                          title="Remove File"
                          className="p-1 rounded hover:bg-red-950/40 hover:text-[#EF5350] text-[#5C5C66] transition shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sidebar bottom action control */}
              {files.some((f) => f.status === "parsed") && (
                <button
                  onClick={handleBulkDecompile}
                  className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs font-bold font-mono text-white transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Play className="w-3.5 h-3.5 text-zinc-300" />
                  Bulk Decompile All ({files.filter((f) => f.status === "parsed").length})
                </button>
              )}
            </div>

            {/* COLUMN 2: Active Class Info Overview (width: xl:col-span-3) */}
            <div className="w-full md:w-80 xl:w-auto xl:col-span-3 flex flex-col gap-4 shrink-0 min-h-0">
              
              {/* AI Class Summary Card (Visible if decompilation finished) - MOVED TO TOP OF COL 2 */}
              {decompiledResult?.classSummary && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-xl border border-[#23232A] bg-[#121217] p-3 relative overflow-hidden"
                >
                  <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#23232A] to-transparent"></div>
                  <h4 className="text-[10px] font-mono font-bold text-white flex items-center gap-1.5 mb-1 uppercase tracking-wide">
                    <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                    AI Class Summary
                  </h4>
                  <p className="text-[11px] text-[#90909A] leading-relaxed font-sans">
                    {decompiledResult.classSummary}
                  </p>
                </motion.div>
              )}

              {/* Class Metadata Card - Better Design */}
              <div className="rounded-xl border border-[#23232A] bg-[#0E0E12] overflow-hidden relative shrink-0">
                <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#23232A] to-transparent"></div>
                
                <div className="px-3 py-2 border-b border-[#23232A] bg-[#121217] flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-white flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-zinc-400" /> Metadata
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">
                    {parsedClass ? parsedClass.jdkVersion : "None Loaded"}
                  </span>
                </div>

                <div className="p-3 flex flex-col gap-2.5 font-mono text-[11px]">
                  <div>
                    <span className="text-[#5C5C66] text-[10px]">Class Name:</span>
                    <div className="text-white font-semibold truncate mt-0.5 bg-[#0F0F12] p-1.5 rounded border border-[#23232A]">
                      {parsedClass ? parsedClass.thisClassName : "N/A"}
                    </div>
                  </div>
                  <div>
                    <span className="text-[#5C5C66] text-[10px]">Super Class:</span>
                    <div className="text-[#90909A] truncate mt-0.5 bg-[#0F0F12] p-1.5 rounded border border-[#23232A]" title={parsedClass?.superClassName}>
                      {parsedClass ? parsedClass.superClassName : "N/A"}
                    </div>
                  </div>
                  {parsedClass?.interfaces && parsedClass.interfaces.length > 0 && (
                    <div>
                      <span className="text-[#5C5C66] text-[10px]">Interfaces:</span>
                      <div className="flex flex-wrap gap-1 mt-1 max-h-16 overflow-y-auto">
                        {parsedClass.interfaces.map((intf, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-[#121217] border border-[#23232A] rounded text-[#90909A] truncate text-[9px]">
                            {intf}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 mt-0.5 pt-2 border-t border-[#23232A]">
                    <div>
                      <span className="text-[#5C5C66] text-[10px]">Major / Minor:</span>
                      <div className="text-white font-bold mt-0.5">
                        {parsedClass ? `${parsedClass.majorVersion} / ${parsedClass.minorVersion}` : "N/A"}
                      </div>
                    </div>
                    {parsedClass?.accessFlagsNames && parsedClass.accessFlagsNames.length > 0 && (
                      <div>
                        <span className="text-[#5C5C66] text-[10px]">Modifiers:</span>
                        <div className="flex flex-wrap gap-1 mt-0.5 max-w-full">
                          {parsedClass.accessFlagsNames.slice(0, 2).map((flag, i) => (
                            <span key={i} className="px-1 py-0.2 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 text-[8px] uppercase font-bold">
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Methods and Fields List Panel */}
              <div className="rounded-xl border border-[#23232A] bg-[#0E0E12] flex-1 flex flex-col min-h-[220px] overflow-hidden relative">
                <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#23232A] to-transparent"></div>
                
                <div className="px-3 py-2 border-b border-[#23232A] bg-[#121217] flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-white flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-zinc-400" />
                    Methods & Fields Index
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#1E1E26] border border-[#23232A] text-[#90909A]">
                    {parsedClass ? parsedClass.methods.length : 0} methods
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-3.5 scrollbar-thin scrollbar-thumb-zinc-900">
                  {/* Fields Section */}
                  {parsedClass?.fields && parsedClass.fields.length > 0 && (
                    <div>
                      <h4 className="text-[9px] font-mono font-bold text-[#5C5C66] uppercase tracking-widest px-1 mb-1.5">
                        Declared Fields ({parsedClass.fields.length})
                      </h4>
                      <div className="flex flex-col gap-1">
                        {parsedClass.fields.map((field, i) => (
                          <div
                            key={i}
                            className="p-1.5 rounded-md border border-[#23232A] bg-[#0F0F12] font-mono text-[10px] flex flex-col gap-0.5 hover:border-zinc-700 transition"
                          >
                            <div className="flex items-center gap-1 flex-wrap">
                              {field.accessFlagsNames.map((flag) => (
                                <span key={flag} className="text-[8px] text-zinc-400 uppercase font-bold">
                                  {flag}
                                </span>
                              ))}
                              <span className="text-white font-semibold break-all">{field.name}</span>
                            </div>
                            <span className="text-[9px] text-[#5C5C66] truncate">{field.descriptor}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Methods Section */}
                  {parsedClass?.methods && parsedClass.methods.length > 0 ? (
                    <div>
                      <h4 className="text-[9px] font-mono font-bold text-[#5C5C66] uppercase tracking-widest px-1 mb-1.5">
                        Declared Methods ({parsedClass.methods.length})
                      </h4>
                      <div className="flex flex-col gap-1">
                        {parsedClass.methods.map((method, i) => {
                          const isSelected = selectedMethodIdx === i;
                          const hasCode = !!method.code;
                          return (
                            <button
                              key={i}
                              onClick={() => setSelectedMethodIdx(i)}
                              className={`p-1.5 rounded-md border text-left transition duration-200 flex flex-col gap-1 w-full ${
                                isSelected
                                  ? "border-zinc-500 bg-zinc-800/20"
                                  : "border-[#23232A] bg-[#0F0F12] hover:bg-[#121217]"
                              }`}
                            >
                              <div className="flex items-center justify-between w-full gap-2">
                                <div className="flex items-center gap-1 flex-wrap min-w-0">
                                  {method.accessFlagsNames.slice(0, 1).map((flag) => (
                                    <span key={flag} className="text-[8px] text-zinc-400 uppercase font-bold font-mono">
                                      {flag}
                                    </span>
                                  ))}
                                  <span className={`font-mono text-[11px] font-bold truncate ${isSelected ? "text-white" : "text-zinc-200"}`}>
                                    {method.name}
                                  </span>
                                </div>
                                {hasCode && (
                                  <span className="text-[8px] font-mono text-[#5C5C66] bg-[#1E1E26] px-1.5 py-0.2 rounded border border-[#23232A] shrink-0">
                                    {method.code?.instructions.length} inst
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] font-mono text-[#5C5C66] truncate max-w-full">
                                {method.descriptor}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[#5C5C66] text-[10px] italic text-center py-6">
                      No parsed class loaded yet
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* COLUMN 3: Tabs Details Viewer (width: xl:col-span-6) */}
            <div className="flex-1 xl:col-span-6 flex flex-col gap-3 min-h-0">
              
              {/* Tab Nav Menu */}
              <div className="flex items-center justify-between border-b border-[#23232A] pb-0.5 shrink-0">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveTab("java")}
                    className={`px-3 py-1.5 text-xs font-mono font-bold border-b-2 transition flex items-center gap-1.5 ${
                      activeTab === "java"
                        ? "border-zinc-400 text-white font-bold"
                        : "border-transparent text-[#90909A] hover:text-[#E0E0E6]"
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    Reconstructed Java
                  </button>
                  <button
                    onClick={() => setActiveTab("bytecode")}
                    className={`px-3 py-1.5 text-xs font-mono font-bold border-b-2 transition flex items-center gap-1.5 ${
                      activeTab === "bytecode"
                        ? "border-zinc-400 text-white font-bold"
                        : "border-transparent text-[#90909A] hover:text-[#E0E0E6]"
                    }`}
                  >
                    <Binary className="w-3.5 h-3.5" />
                    Disassembled Bytecode
                  </button>
                  <button
                    onClick={() => setActiveTab("structure")}
                    className={`px-3 py-1.5 text-xs font-mono font-bold border-b-2 transition flex items-center gap-1.5 ${
                      activeTab === "structure"
                        ? "border-zinc-400 text-white font-bold"
                        : "border-transparent text-[#90909A] hover:text-[#E0E0E6]"
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                    Constant Pool
                  </button>
                </div>
              </div>

              {/* Tab Display Screens */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <AnimatePresence mode="wait">
                  
                  {/* TAB 1: Java Source Reconstructed */}
                  {activeTab === "java" && (
                    <motion.div
                      key="java"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden"
                    >
                      {isDecompiling ? (
                        /* Loading state */
                        <div className="flex-1 flex flex-col items-center justify-center border border-[#23232A] bg-[#0E0E12] rounded-xl p-12 min-h-[300px]">
                          <div className="relative mb-5 flex items-center justify-center">
                            <div className="w-14 h-14 rounded-full border-4 border-zinc-700/20 border-t-zinc-400 animate-spin"></div>
                            <Sparkles className="w-5 h-5 text-zinc-400 absolute animate-pulse" />
                          </div>
                          <h4 className="text-sm font-bold font-mono text-white">Reconstructing Java Source Code...</h4>
                          <p className="text-[10px] text-[#90909A] font-mono mt-1.5 text-center max-w-sm leading-relaxed">
                            AI is analyzing bytecode control paths, mapping MCreator and Forge mods patterns, and outputting compilation-ready high-level code.
                          </p>
                        </div>
                      ) : decompiledResult ? (
                        /* Java Editor Viewer & Side Annotations */
                        <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
                          <div className="flex items-center justify-between border border-[#23232A] bg-[#121217] rounded-xl px-3 py-1.5 shrink-0">
                            <div className="flex items-center gap-1.5 text-[11px] text-[#90909A] font-mono min-w-0">
                              <Code className="w-3.5 h-3.5 text-zinc-400" />
                              <span className="truncate">{parsedClass?.thisClassName.split("/").pop()}.java</span>
                            </div>
                            
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={handleCopyCode}
                                className="px-2.5 py-1 rounded-md border border-[#23232A] bg-[#1E1E26] hover:bg-[#2D2D39] hover:text-white text-[10px] font-mono font-bold text-[#90909A] transition flex items-center gap-1.5"
                              >
                                {copied ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    Copied!
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    Copy
                                  </>
                                )}
                              </button>
                              
                              <button
                                onClick={handleDownloadJavaFile}
                                className="px-2.5 py-1 rounded-md border border-[#23232A] bg-[#1E1E26] hover:bg-[#2D2D39] hover:text-white text-[10px] font-mono font-bold text-[#90909A] transition flex items-center gap-1.5"
                              >
                                <Download className="w-3 h-3" />
                                Download
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden items-stretch">
                            {/* Reconstructed Code Panel (col-span-7) */}
                            <div className="xl:col-span-7 border border-[#23232A] bg-[#0F0F12] rounded-xl relative overflow-hidden flex flex-col min-h-[300px] xl:min-h-0">
                              <div className="px-3 py-1.5 bg-[#121217] border-b border-[#23232A] flex items-center gap-1.5 shrink-0">
                                <span className="w-2 h-2 rounded-full bg-zinc-600"></span>
                                <span className="w-2 h-2 rounded-full bg-zinc-700"></span>
                                <span className="w-2 h-2 rounded-full bg-zinc-800"></span>
                                <span className="text-[9px] text-[#5C5C66] font-mono ml-2">Java Source View</span>
                              </div>
                              <div className="flex-1 p-3 font-mono text-[11px] leading-relaxed overflow-auto scrollbar-thin scrollbar-thumb-zinc-900 bg-[#0F0F12] text-[#E0E0E6] select-text">
                                <pre className="whitespace-pre-wrap">
                                  <code>{decompiledResult.javaSource}</code>
                                </pre>
                              </div>
                            </div>

                            {/* AI Bytecode Concept Annotations (col-span-5) */}
                            <div className="xl:col-span-5 flex flex-col min-h-[250px] xl:min-h-0">
                              <div className="rounded-xl border border-[#23232A] bg-[#0E0E12] p-3 flex-1 flex flex-col overflow-hidden">
                                <h4 className="text-[10px] font-mono font-bold text-white uppercase tracking-wider mb-2.5 flex items-center gap-1.5 shrink-0">
                                  <Sparkles className="w-3.5 h-3.5 text-zinc-400" /> AI Bytecode Annotations
                                </h4>
                                <div className="flex-1 overflow-y-auto pr-0.5 flex flex-col gap-2 scrollbar-thin scrollbar-thumb-zinc-900">
                                  {decompiledResult.annotations && decompiledResult.annotations.length > 0 ? (
                                    decompiledResult.annotations.map((annot, idx) => {
                                      const conceptLower = annot.concept.toLowerCase();
                                      const conceptBadgeClass = conceptLower.includes("sec") || conceptLower.includes("warn")
                                        ? "bg-red-950/30 text-red-400 border-red-900/30"
                                        : conceptLower.includes("opt") || conceptLower.includes("perf")
                                        ? "bg-emerald-950/30 text-emerald-400 border-emerald-900/30"
                                        : "bg-zinc-800/50 text-zinc-300 border-zinc-700";
                                      
                                      const cardBorderClass = conceptLower.includes("sec") || conceptLower.includes("warn")
                                        ? "border-l-4 border-l-[#EF5350] border-y border-r border-[#23232A]"
                                        : conceptLower.includes("opt") || conceptLower.includes("perf")
                                        ? "border-l-4 border-l-[#4CAF50] border-y border-r border-[#23232A]"
                                        : "border-l-4 border-l-zinc-500 border-y border-r border-[#23232A]";

                                      return (
                                        <div
                                          key={idx}
                                          className={`p-2 rounded-r-lg bg-[#1E1E26] hover:bg-[#1E1E26]/80 transition flex flex-col gap-1 text-[11px] ${cardBorderClass}`}
                                        >
                                          {/* Concept header wrap fix for responsive sizes */}
                                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                                            <span className="font-mono text-white font-bold truncate">
                                              {annot.method}()
                                            </span>
                                            <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border shrink whitespace-normal text-right max-w-[65%] break-words ${conceptBadgeClass}`}>
                                              {annot.concept}
                                            </span>
                                          </div>
                                          <p className="text-[#90909A] leading-relaxed font-sans text-[10px] mt-0.5">
                                            {annot.explanation}
                                          </p>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="text-[#5C5C66] text-[10px] italic text-center py-6">
                                      No bytecode annotations available.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : activeFile?.status === "failed" ? (
                        <div className="flex-1 flex flex-col items-center justify-center border border-red-950/30 bg-[#0E0E12] rounded-xl p-8 min-h-[300px]">
                          <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                          <h4 className="text-sm font-bold font-mono text-white">Decompilation Failed</h4>
                          <p className="text-xs text-red-400/80 font-mono mt-2 text-center max-w-md bg-red-950/10 p-3 rounded-lg border border-red-900/20 leading-relaxed whitespace-pre-wrap select-text">
                            {activeFile?.error || "An unknown error occurred during AI reconstruction."}
                          </p>
                          <button
                            onClick={() => decompileFile(activeFile.id)}
                            className="mt-5 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs font-bold font-mono text-white transition flex items-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Retry Decompilation
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center border border-[#23232A] bg-[#0E0E12] rounded-xl p-12">
                          <HelpCircle className="w-10 h-10 text-[#5C5C66] mb-2" />
                          <h4 className="text-xs font-bold font-mono text-[#5C5C66]">Source Code Not Decompiled</h4>
                          <p className="text-[10px] text-[#5C5C66] font-mono mt-1 text-center max-w-xs">
                            Select a file from the sidebar and click Decompile to reconstruct the high-level source code.
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TAB 2: Bytecode Disassembly */}
                  {activeTab === "bytecode" && (
                    <motion.div
                      key="bytecode"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden"
                    >
                      {parsedClass && parsedClass.methods[selectedMethodIdx] ? (
                        <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
                          
                          {/* Method Selector Detail Header */}
                          <div className="border border-[#23232A] bg-[#121217] rounded-xl px-3 py-2 flex items-center justify-between flex-wrap gap-2 shrink-0">
                            <div className="min-w-0">
                              <span className="text-[9px] font-mono font-bold text-[#5C5C66] uppercase">Selected Method</span>
                              <div className="text-[11px] font-mono font-bold text-white mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span className="text-zinc-400">
                                  {parsedClass.methods[selectedMethodIdx].accessFlagsNames.join(" ")}
                                </span>
                                <span className="text-zinc-300 font-semibold">
                                  {parsedClass.methods[selectedMethodIdx].name}
                                </span>
                                <span className="text-[#5C5C66] truncate">
                                  {parsedClass.methods[selectedMethodIdx].descriptor}
                                </span>
                              </div>
                            </div>

                            {/* Stack and Locals Info badges */}
                            {parsedClass.methods[selectedMethodIdx].code && (
                              <div className="flex items-center gap-2 text-[10px] font-mono shrink-0">
                                <span className="px-2 py-0.5 bg-[#1E1E26] border border-[#23232A] rounded-md text-zinc-300">
                                  max_stack: {parsedClass.methods[selectedMethodIdx].code?.maxStack}
                                </span>
                                <span className="px-2 py-0.5 bg-[#1E1E26] border border-[#23232A] rounded-md text-zinc-300">
                                  max_locals: {parsedClass.methods[selectedMethodIdx].code?.maxLocals}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Split screen: bytecode table & educational glossary */}
                          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden items-stretch">
                            
                            {/* Bytecode Mnemonics Table (col-span-7) */}
                            <div className="xl:col-span-7 border border-[#23232A] bg-[#0F0F12] rounded-xl overflow-hidden flex flex-col min-h-[300px] xl:min-h-0">
                              
                              <div className="px-3 py-2 bg-[#121217] border-b border-[#23232A] text-[#5C5C66] font-mono text-[9px] grid grid-cols-12 font-bold select-none shrink-0">
                                <div className="col-span-2">OFFSET</div>
                                <div className="col-span-2">OPCODE</div>
                                <div className="col-span-3">MNEMONIC</div>
                                <div className="col-span-5 font-bold">CP / CONSTANT DESCRIPTION</div>
                              </div>

                              <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-900 font-mono text-[11px] text-[#E0E0E6] select-text">
                                {parsedClass.methods[selectedMethodIdx].code?.instructions &&
                                parsedClass.methods[selectedMethodIdx].code!.instructions.length > 0 ? (
                                  parsedClass.methods[selectedMethodIdx].code!.instructions.map((inst, i) => {
                                    return (
                                      <div
                                        key={i}
                                        className="px-3 py-1.5 border-b border-[#23232A]/30 hover:bg-zinc-800/10 grid grid-cols-12 items-center"
                                      >
                                        <div className="col-span-2 text-[#5C5C66] font-bold">{inst.offset}</div>
                                        <div className="col-span-2 text-[#5C5C66]">
                                          0x{inst.opcode.toString(16).padStart(2, "0").toUpperCase()}
                                        </div>
                                        <div className="col-span-3 text-zinc-300 font-bold">{inst.mnemonic}</div>
                                        <div className="col-span-5 text-[#E0E0E6] select-text truncate max-w-full" title={inst.details}>
                                          {inst.details}
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="text-[#5C5C66] text-[11px] italic text-center py-20 flex flex-col gap-2 items-center justify-center">
                                    <Shield className="w-7 h-7 text-[#5C5C66]" />
                                    <span>Method contains no executable bytecode attributes (Abstract/Native).</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Opcode Glossary Cheat sheet (col-span-5) */}
                            <div className="xl:col-span-5 flex flex-col min-h-[250px] xl:min-h-0">
                              <div className="rounded-xl border border-[#23232A] bg-[#0E0E12] p-3 flex-1 flex flex-col overflow-hidden">
                                <h4 className="text-[10px] font-mono font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5 shrink-0">
                                  <Info className="w-3.5 h-3.5 text-zinc-400" /> Bytecode Dictionary
                                </h4>
                                
                                <div className="flex-1 overflow-y-auto pr-0.5 flex flex-col gap-2 scrollbar-thin scrollbar-thumb-zinc-900 text-[10px]">
                                  
                                  <div className="p-2 border border-[#23232A] bg-[#1E1E26] rounded-lg">
                                    <div className="font-bold text-white font-mono text-[10px] mb-0.5">aload_0 / aload_1</div>
                                    <p className="text-[#90909A] leading-relaxed font-sans">
                                      Pushes a reference value from Local Variables List (Index 0 is <code className="text-zinc-400">this</code> for instance methods, 1 is the first argument) onto the stack.
                                    </p>
                                  </div>

                                  <div className="p-2 border border-[#23232A] bg-[#1E1E26] rounded-lg">
                                    <div className="font-bold text-white font-mono text-[10px] mb-0.5">invokevirtual</div>
                                    <p className="text-[#90909A] leading-relaxed font-sans">
                                      Invokes an instance method on a reference object dynamically, dispatching based on actual runtime type.
                                    </p>
                                  </div>

                                  <div className="p-2 border border-[#23232A] bg-[#1E1E26] rounded-lg">
                                    <div className="font-bold text-white font-mono text-[10px] mb-0.5">invokestatic</div>
                                    <p className="text-[#90909A] leading-relaxed font-sans">
                                      Invokes a class static method directly, bypassing dynamic lookup and dispatching immediately.
                                    </p>
                                  </div>

                                  <div className="p-2 border border-[#23232A] bg-[#1E1E26] rounded-lg">
                                    <div className="font-bold text-white font-mono text-[10px] mb-0.5">getstatic / getfield</div>
                                    <p className="text-[#90909A] leading-relaxed font-sans">
                                      Fetches a static/instance variable field and places its value on the operand evaluation stack.
                                    </p>
                                  </div>

                                  <div className="p-2 border border-[#23232A] bg-[#1E1E26] rounded-lg">
                                    <div className="font-bold text-white font-mono text-[10px] mb-0.5">areturn / ireturn</div>
                                    <p className="text-[#90909A] leading-relaxed font-sans">
                                      Returns an object reference (<code className="text-white">areturn</code>) or integer/boolean value (<code className="text-white">ireturn</code>) from the active method.
                                    </p>
                                  </div>

                                  <div className="p-2 border border-[#23232A] bg-[#1E1E26] rounded-lg">
                                    <div className="font-bold text-white font-mono text-[10px] mb-0.5">ldc / ldc_w</div>
                                    <p className="text-[#90909A] leading-relaxed font-sans">
                                      Pushes a runtime constant (String, Integer, or Class pointer) from the constant pool lookup table onto the stack.
                                    </p>
                                  </div>

                                </div>
                              </div>
                            </div>

                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center border border-[#23232A] bg-[#0E0E12] rounded-xl p-12">
                          <HelpCircle className="w-10 h-10 text-[#5C5C66] mb-2" />
                          <h4 className="text-xs font-bold font-mono text-[#5C5C66]">No Method Selected</h4>
                          <p className="text-[10px] text-[#5C5C66] font-mono mt-1 text-center max-w-xs">
                            Select a method from the Methods Index list on the left column to view its disassembled mnemonics.
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TAB 3: Constant Pool Analysis */}
                  {activeTab === "structure" && (
                    <motion.div
                      key="structure"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden"
                    >
                      {parsedClass ? (
                        <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
                          <div className="border border-[#23232A] bg-[#121217] rounded-xl px-3 py-2 shrink-0">
                            <h4 className="text-[11px] font-mono font-bold text-white">Constant Pool Lookup Table</h4>
                            <p className="text-[10px] text-[#90909A] font-sans mt-0.5">
                              Lookup array that holds numeric constants, string content, class descriptors, and key names referenced inside compiled binary bytecode.
                            </p>
                          </div>

                          <div className="border border-[#23232A] bg-[#0F0F12] rounded-xl overflow-hidden flex-1 flex flex-col min-h-[300px]">
                            <div className="px-3 py-2 bg-[#121217] border-b border-[#23232A] text-[#5C5C66] font-mono text-[9px] grid grid-cols-12 font-bold select-none shrink-0">
                              <div className="col-span-2">INDEX</div>
                              <div className="col-span-3">TAG TYPE</div>
                              <div className="col-span-7 font-bold">RESOLVED STRING / REFERENCE VALUES</div>
                            </div>

                            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-900 font-mono text-[11px] text-[#E0E0E6] select-text">
                              {parsedClass.constantPool.map((cp, idx) => (
                                <div
                                  key={idx}
                                  className="px-3 py-2 border-b border-[#23232A]/30 hover:bg-zinc-800/10 grid grid-cols-12 items-center"
                                >
                                  <div className="col-span-2 text-[#5C5C66] font-bold">#{cp.index}</div>
                                  <div className="col-span-3">
                                    <span className="px-1.5 py-0.2 rounded text-[8px] uppercase font-bold bg-zinc-850 border border-zinc-700 text-zinc-300">
                                      {cp.tagName}
                                    </span>
                                  </div>
                                  <div className="col-span-7 text-[#E0E0E6] select-text truncate max-w-full" title={cp.details}>
                                    {cp.details}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center border border-[#23232A] bg-[#0E0E12] rounded-xl p-12">
                          <HelpCircle className="w-10 h-10 text-[#5C5C66] mb-2" />
                          <h4 className="text-xs font-bold font-mono text-[#5C5C66]">No Constant Pool Data</h4>
                          <p className="text-[10px] text-[#5C5C66] font-mono mt-1 text-center max-w-xs">
                            Load a compiled class file to analyze its constant pool lookups.
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-[#23232A] bg-[#0E0E12] py-4 shrink-0">
        <div className="w-full max-w-full px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] font-mono text-[#5C5C66]">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-[#5C5C66]" />
            <span>Class Decompiler • Sandboxed JVM Static Parser</span>
          </div>
          <div>
            <span>Gemini AI Decompiler Active</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
