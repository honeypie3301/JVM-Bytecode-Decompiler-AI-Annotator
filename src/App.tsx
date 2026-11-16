import React, { useState, useRef, useEffect } from "react";
import { AlertCircle, X } from "lucide-react";
import { parseClassFile, ParsedClass } from "./classParser";
import { subscribeToTelemetry, logTelemetryEvent, logVisitorSession } from "./lib/firebase";
import { SampleClass, base64ToArrayBuffer } from "./samples";
import { DecompilerFile, AuditLogItem, WorkspaceTab } from "./types";
import { TopBar } from "./components/TopBar";
import { LandingView } from "./components/LandingView";
import { WorkspaceView } from "./components/WorkspaceView";
import { AuditModal } from "./components/AuditModal";
import { ThreatModal } from "./components/ThreatModal";
import { SamplesModal } from "./components/SamplesModal";

// Check if a class file belongs to the protected mod "the_backwoods"
export function isProtectedBackwoodsClass(parsedClass?: ParsedClass, fileName?: string): boolean {
  if (!parsedClass) return false;

  const searchTargets = [
    parsedClass.thisClassName || "",
    parsedClass.superClassName || "",
    ...(parsedClass.interfaces || []),
    fileName || "",
    ...parsedClass.fields.map((f) => `${f.name} ${f.descriptor}`),
    ...parsedClass.methods.map((m) => `${m.name} ${m.descriptor}`),
    ...(parsedClass.constantPool || []).map((cp) => (typeof cp === "string" ? cp : JSON.stringify(cp))),
  ];

  const lowerTargets = searchTargets.join(" ").toLowerCase();

  return (
    lowerTargets.includes("the_backwoods") ||
    lowerTargets.includes("thebackwoods") ||
    lowerTargets.includes("net/mcreator/thebackwoods") ||
    lowerTargets.includes("net.mcreator.thebackwoods")
  );
}

export default function App() {
  const [files, setFiles] = useState<DecompilerFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("java");
  const [selectedMethodIdx, setSelectedMethodIdx] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [includeAnnotations, setIncludeAnnotations] = useState(false);
  const [annotatingFileId, setAnnotatingFileId] = useState<string | null>(null);

  // Modals
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showSamplesModal, setShowSamplesModal] = useState(false);
  const [showThreatModal, setShowThreatModal] = useState<AuditLogItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to real-time Firebase telemetry logs and register visitor session
  useEffect(() => {
    logVisitorSession().catch(console.error);

    const unsubscribe = subscribeToTelemetry((firebaseLogs) => {
      const formatted: AuditLogItem[] = firebaseLogs.map((l) => ({
        id: l.id || Math.random().toString(36).substring(7),
        timestamp: l.timestamp || new Date().toLocaleTimeString(),
        fileName: l.fileName,
        className: l.className,
        fileSize: l.fileSize,
        flagged: l.flagged,
        reason: l.reason,
        ipPlaceholder: l.clientToken || "10.84.x.x",
      }));
      setAuditLogs(formatted);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setSelectedMethodIdx(0);
  }, [selectedFileId]);

  const addAuditLog = (item: AuditLogItem) => {
    setAuditLogs((prev) => [item, ...prev].slice(0, 100));

    logTelemetryEvent({
      fileName: item.fileName,
      className: item.className,
      fileSize: item.fileSize,
      flagged: item.flagged,
      reason: item.reason,
      clientToken: item.ipPlaceholder || "10.84.x.x",
      timestamp: item.timestamp,
    });
  };

  const loadSampleClass = (sample: SampleClass) => {
    try {
      const buffer = base64ToArrayBuffer(sample.base64);
      const parsed = parseClassFile(buffer);
      const isProtected = isProtectedBackwoodsClass(parsed, sample.name);
      const fileId = Math.random().toString(36).substring(7);

      const logItem: AuditLogItem = {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        fileName: sample.name,
        className: parsed.thisClassName || "UnknownClass",
        fileSize: buffer.byteLength,
        flagged: isProtected,
        reason: isProtected ? "Protected Mod 'the_backwoods' (net.mcreator.thebackwoods)" : undefined,
        ipPlaceholder: `10.84.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 255)}`,
      };

      addAuditLog(logItem);

      if (isProtected) {
        setShowThreatModal(logItem);
      }

      const newFile: DecompilerFile = {
        id: fileId,
        name: sample.name,
        size: buffer.byteLength,
        status: isProtected ? "failed" : "parsed",
        parsedClass: parsed,
        isProtected,
        error: isProtected
          ? "Protected class artifact detected (net.mcreator.thebackwoods). Source reconstruction is disabled."
          : undefined,
      };

      setFiles((prev) => [...prev, newFile]);
      setSelectedFileId(fileId);
      setActiveTab("java");
      setError(null);
    } catch (err: any) {
      setError(`Failed to load sample ${sample.name}: ${err.message}`);
    }
  };

  const processFiles = (fileList: FileList) => {
    const validFiles: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.name.endsWith(".class")) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      setError("Only compiled Java .class bytecode files are supported.");
      return;
    }

    setError(null);

    const newDecompilerFiles: DecompilerFile[] = validFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size,
      status: "parsing",
    }));

    setFiles((prev) => [...prev, ...newDecompilerFiles]);
    setSelectedFileId((current) => current || newDecompilerFiles[0].id);

    validFiles.forEach((file, index) => {
      const targetDecompilerFile = newDecompilerFiles[index];
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const parsed = parseClassFile(buffer);
          const isProtected = isProtectedBackwoodsClass(parsed, file.name);

          const logItem: AuditLogItem = {
            id: Math.random().toString(36).substring(7),
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            fileName: file.name,
            className: parsed.thisClassName || "UnknownClass",
            fileSize: file.size,
            flagged: isProtected,
            reason: isProtected ? "Protected Mod 'the_backwoods' (net.mcreator.thebackwoods)" : undefined,
            ipPlaceholder: `10.84.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 255)}`,
          };

          addAuditLog(logItem);

          if (isProtected) {
            setShowThreatModal(logItem);
            setFiles((prev) =>
              prev.map((f) =>
                f.id === targetDecompilerFile.id
                  ? {
                      ...f,
                      status: "failed",
                      parsedClass: parsed,
                      isProtected: true,
                      error:
                        "Protected class artifact detected (net.mcreator.thebackwoods). Source reconstruction is disabled and this attempt has been logged.",
                    }
                  : f
              )
            );
          } else {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === targetDecompilerFile.id ? { ...f, status: "parsed", parsedClass: parsed } : f
              )
            );
          }
        } catch (err: any) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === targetDecompilerFile.id
                ? { ...f, status: "failed", error: err.message || "Failed to parse binary class structure." }
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
    if (e.target.files) {
      processFiles(e.target.files);
      e.target.value = "";
    }
  };

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
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const decompileFile = async (fileId: string) => {
    const targetFile = files.find((f) => f.id === fileId);
    if (!targetFile || !targetFile.parsedClass || targetFile.status === "decompiling") return;

    if (targetFile.isProtected || isProtectedBackwoodsClass(targetFile.parsedClass, targetFile.name)) {
      const threatItem: AuditLogItem = {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        fileName: targetFile.name,
        className: targetFile.parsedClass.thisClassName || targetFile.name,
        fileSize: targetFile.size,
        flagged: true,
        reason: "Protected Mod 'the_backwoods' (net.mcreator.thebackwoods)",
        ipPlaceholder: `10.84.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 255)}`,
      };

      setShowThreatModal(threatItem);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: "failed",
                isProtected: true,
                error: "Protected class artifact detected (net.mcreator.thebackwoods). Source reconstruction is disabled.",
              }
            : f
        )
      );
      return;
    }

    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? { ...f, status: "decompiling", decompileProgress: undefined, error: undefined }
          : f
      )
    );

    const updateProgress = (progressText?: string) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, decompileProgress: progressText } : f))
      );
    };

    const postDecompile = async (payload: Record<string, unknown>) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch("/api/decompile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          return res.json();
        }

        const errData = await res.json().catch(() => ({}));
        const msg = String(errData.error || "Server failed to decompile the class file.");
        const lowerMsg = msg.toLowerCase();
        const isTransient =
          lowerMsg.includes("429") ||
          lowerMsg.includes("503") ||
          lowerMsg.includes("quota") ||
          lowerMsg.includes("high demand") ||
          lowerMsg.includes("unavailable") ||
          lowerMsg.includes("overloaded") ||
          lowerMsg.includes("resource_exhausted");

        if (isTransient && attempt < 2) {
          const match = msg.match(/retry in\s+([\d.]+)s/i);
          const defaultWait = attempt === 0 ? 2500 : 5000;
          const waitMs = match
            ? Math.min(15000, Math.max(2000, Math.ceil(parseFloat(match[1]) * 1000) + 400))
            : defaultWait;
          updateProgress(
            `Model busy — retrying in ${Math.ceil(waitMs / 1000)}s (attempt ${attempt + 2}/3)`
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw new Error(msg);
      }
    };

    try {
      const compactFields = targetFile.parsedClass.fields.map((f) => ({
        name: f.name,
        descriptor: f.descriptor,
        accessFlagsNames: f.accessFlagsNames,
      }));

      const compactMethods = targetFile.parsedClass.methods.map((m) => ({
        name: m.name,
        descriptor: m.descriptor,
        accessFlagsNames: m.accessFlagsNames,
        code: m.code
          ? {
              maxStack: m.code.maxStack,
              maxLocals: m.code.maxLocals,
              ...(m.code.exceptionTable.length > 0 ? { exceptionTable: m.code.exceptionTable } : {}),
              instructions: m.code.instructions.map((inst) => ({
                offset: inst.offset,
                mnemonic: inst.mnemonic,
                ...(inst.details ? { details: inst.details } : {}),
              })),
            }
          : undefined,
      }));

      const baseClassData = {
        thisClassName: targetFile.parsedClass.thisClassName,
        superClassName: targetFile.parsedClass.superClassName,
        interfaces: targetFile.parsedClass.interfaces,
        jdkVersion: targetFile.parsedClass.jdkVersion,
        majorVersion: targetFile.parsedClass.majorVersion,
        accessFlagsNames: targetFile.parsedClass.accessFlagsNames,
        fields: compactFields,
      };

      const totalInstructions = compactMethods.reduce(
        (sum, m) => sum + (m.code?.instructions.length || 0),
        0
      );

      const singleMethodLimit = includeAnnotations ? 35 : 50;
      const singleInsnLimit = includeAnnotations ? 1200 : 1800;

      // Small/medium classes: single fast pass
      if (compactMethods.length <= singleMethodLimit && totalInstructions <= singleInsnLimit) {
        const data = await postDecompile({
          classData: { ...baseClassData, methods: compactMethods },
          includeAnnotations,
        });
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  status: "decompiled",
                  decompileProgress: undefined,
                  decompiledResult: {
                    javaSource: data.javaSource || "",
                    classSummary: data.classSummary || "",
                    annotations: Array.isArray(data.annotations) ? data.annotations : [],
                    includeAnnotations,
                  },
                }
              : f
          )
        );
        return;
      }

      // Large classes: partition methods into balanced batches and run concurrently
      const maxBatchMethods = includeAnnotations ? 25 : 45;
      const maxBatchInsns = includeAnnotations ? 900 : 1600;
      const batches: typeof compactMethods[] = [];
      let currentBatch: typeof compactMethods = [];
      let currentInsns = 0;

      for (const method of compactMethods) {
        const methodInsns = method.code?.instructions.length || 0;
        if (
          currentBatch.length > 0 &&
          (currentBatch.length >= maxBatchMethods || currentInsns + methodInsns > maxBatchInsns)
        ) {
          batches.push(currentBatch);
          currentBatch = [];
          currentInsns = 0;
        }
        currentBatch.push(method);
        currentInsns += methodInsns;
      }
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }

      const batchResults = new Array<any>(batches.length);
      let nextIndex = 0;
      let completedBatches = 0;
      let completedMethods = 0;
      const concurrency = Math.min(2, batches.length);

      updateProgress(
        `Decompiling ${batches.length} batches (0/${compactMethods.length} methods)`
      );

      const worker = async () => {
        while (true) {
          const i = nextIndex++;
          if (i >= batches.length) return;
          const batch = batches[i];

          const chunkResult = await postDecompile({
            classData: { ...baseClassData, methods: batch },
            chunk: { index: i, total: batches.length },
            includeAnnotations,
          });

          batchResults[i] = chunkResult;
          completedBatches += 1;
          completedMethods += batch.length;
          updateProgress(
            `Batch ${completedBatches}/${batches.length} · ${completedMethods}/${compactMethods.length} methods`
          );
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      let combinedJavaSource = "";
      let classSummary = "";
      const combinedAnnotations: Array<{ method: string; concept: string; explanation: string }> = [];

      for (let i = 0; i < batchResults.length; i++) {
        const chunkResult = batchResults[i];
        if (!chunkResult) continue;

        if (i === 0) {
          combinedJavaSource = chunkResult.javaSource || "";
          classSummary = chunkResult.classSummary || "";
        } else if (chunkResult.methodsCode) {
          const cleanedExtra = String(chunkResult.methodsCode).trim();
          if (cleanedExtra) {
            const lastBraceIdx = combinedJavaSource.lastIndexOf("}");
            const indentedExtra = cleanedExtra
              .split("\n")
              .map((line) => (line.trim() === "" ? "" : /^\s/.test(line) ? line : `    ${line}`))
              .join("\n");
            combinedJavaSource =
              lastBraceIdx === -1
                ? `${combinedJavaSource}\n\n${indentedExtra}`
                : `${combinedJavaSource.slice(0, lastBraceIdx).trimEnd()}\n\n${indentedExtra}\n}\n`;
          }
        }

        if (Array.isArray(chunkResult.annotations)) {
          combinedAnnotations.push(...chunkResult.annotations);
        }
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: "decompiled",
                decompileProgress: undefined,
                decompiledResult: {
                  javaSource: combinedJavaSource,
                  classSummary,
                  annotations: combinedAnnotations,
                  includeAnnotations,
                },
              }
            : f
        )
      );
    } catch (err: any) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: "failed",
                decompileProgress: undefined,
                error: err.message || "Decompilation failed.",
              }
            : f
        )
      );
    }
  };

  const generateAnnotationsForFile = async (fileId: string) => {
    const targetFile = files.find((f) => f.id === fileId);
    if (!targetFile || !targetFile.decompiledResult?.javaSource || annotatingFileId) return;

    setAnnotatingFileId(fileId);
    try {
      const res = await fetch("/api/decompile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "annotate",
          classData: {
            thisClassName: targetFile.parsedClass?.thisClassName,
            jdkVersion: targetFile.parsedClass?.jdkVersion,
          },
          javaSource: targetFile.decompiledResult.javaSource,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate AI summary and annotations.");
      }

      const data = await res.json();
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId && f.decompiledResult
            ? {
                ...f,
                decompiledResult: {
                  ...f.decompiledResult,
                  classSummary: data.classSummary || "",
                  annotations: Array.isArray(data.annotations) ? data.annotations : [],
                  includeAnnotations: true,
                },
              }
            : f
        )
      );
    } catch (err: any) {
      setError(err.message || "Failed to generate AI summary and annotations.");
    } finally {
      setAnnotatingFileId(null);
    }
  };

  const handleBulkDecompile = async () => {
    const parsedFiles = files.filter((f) => f.status === "parsed");
    if (parsedFiles.length === 0) return;
    await Promise.all(parsedFiles.map((f) => decompileFile(f.id)));
  };

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

  const handleClearAll = () => {
    setFiles([]);
    setSelectedFileId(null);
    setError(null);
  };

  const activeFile = files.find((f) => f.id === selectedFileId) || null;
  const parsedClass = activeFile?.parsedClass || null;
  const decompiledResult = activeFile?.decompiledResult || null;

  const handleCopyCode = () => {
    if (decompiledResult?.javaSource) {
      navigator.clipboard.writeText(decompiledResult.javaSource);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] bg-[#11100F] text-[#EAE5DE] flex flex-col font-sans overflow-hidden">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".class"
        multiple
        className="hidden"
      />

      <TopBar
        onOpenSecretAudit={() => setShowAuditModal(true)}
        onTriggerUpload={() => fileInputRef.current?.click()}
      />

      {/* Global Notification Banner */}
      {error && (
        <div className="bg-[#241717] border-b border-[#4D2D2D] px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 text-xs text-[#E6A3A3]">
            <AlertCircle className="w-4 h-4 text-[#C76E6E] shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss notification"
            className="text-[#A69E94] hover:text-[#EAE5DE] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {files.length === 0 ? (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <LandingView
              isDragging={isDragging}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onTriggerUpload={() => fileInputRef.current?.click()}
              onLoadSample={loadSampleClass}
            />
          </div>
        ) : (
          <WorkspaceView
            files={files}
            selectedFileId={selectedFileId}
            activeTab={activeTab}
            selectedMethodIdx={selectedMethodIdx}
            isDragging={isDragging}
            copied={copied}
            includeAnnotations={includeAnnotations}
            annotatingFileId={annotatingFileId}
            onToggleAnnotations={setIncludeAnnotations}
            onGenerateAnnotations={generateAnnotationsForFile}
            onSelectFile={setSelectedFileId}
            onRemoveFile={handleRemoveFile}
            onClearAll={handleClearAll}
            onDecompileFile={decompileFile}
            onBulkDecompile={handleBulkDecompile}
            onSelectTab={setActiveTab}
            onSelectMethod={(idx, switchToBytecode) => {
              setSelectedMethodIdx(idx);
              if (switchToBytecode) {
                setActiveTab("bytecode");
              }
            }}
            onCopyCode={handleCopyCode}
            onDownloadJava={handleDownloadJavaFile}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            formatSize={formatSize}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[#2A2623] bg-[#141210] px-4 sm:px-6 py-2.5 shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center justify-end text-[11px] text-[#706961]">
          <button
            type="button"
            onClick={() => setShowSamplesModal(true)}
            className="hover:text-[#EAE5DE] transition-colors cursor-pointer"
          >
            Browse Samples
          </button>
        </div>
      </footer>

      <AuditModal
        isOpen={showAuditModal}
        logs={auditLogs}
        formatSize={formatSize}
        onClose={() => setShowAuditModal(false)}
      />

      <SamplesModal
        isOpen={showSamplesModal}
        onClose={() => setShowSamplesModal(false)}
        onLoadSample={loadSampleClass}
      />

      <ThreatModal threat={showThreatModal} onDismiss={() => setShowThreatModal(null)} />
    </div>
  );
}
