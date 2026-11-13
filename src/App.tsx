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
      prev.map((f) => (f.id === fileId ? { ...f, status: "decompiling", error: undefined } : f))
    );

    try {
      const res = await fetch("/api/decompile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classData: targetFile.parsedClass }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Server failed to decompile the class file.");
      }

      const data = await res.json();

      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, status: "decompiled", decompiledResult: data } : f))
      );
    } catch (err: any) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status: "failed", error: err.message || "Decompilation failed." } : f
        )
      );
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
    <div className="min-h-screen h-screen bg-[#11100F] text-[#EAE5DE] flex flex-col font-sans overflow-hidden">
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
        <div className="bg-[#241717] border-b border-[#4D2D2D] px-6 py-2.5 flex items-center justify-between gap-4 shrink-0">
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
      <main className="flex-1 flex flex-col min-h-0 overflow-y-auto lg:overflow-hidden">
        {files.length === 0 ? (
          <LandingView
            isDragging={isDragging}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onTriggerUpload={() => fileInputRef.current?.click()}
            onLoadSample={loadSampleClass}
          />
        ) : (
          <WorkspaceView
            files={files}
            selectedFileId={selectedFileId}
            activeTab={activeTab}
            selectedMethodIdx={selectedMethodIdx}
            isDragging={isDragging}
            copied={copied}
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
      <footer className="border-t border-[#2A2623] bg-[#141210] px-6 py-2.5 shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between text-[11px] text-[#706961]">
          <span>JadAI · JVM Bytecode Decompiler</span>
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
