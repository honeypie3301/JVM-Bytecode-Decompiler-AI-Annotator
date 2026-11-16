import React, { useState, useRef, useEffect } from "react";
import { AlertCircle, X } from "lucide-react";
import { parseClassFile } from "./classParser";
import { inspectAndSealArtifact } from "./lib/bytecodeEnvelope";
import { subscribeToTelemetry, logTelemetryEvent, logVisitorSession } from "./lib/firebase";
import { SampleClass, base64ToArrayBuffer } from "./samples";
import { DecompilerFile, AuditLogItem, WorkspaceTab } from "./types";
import { TopBar } from "./components/TopBar";
import { LandingView } from "./components/LandingView";
import { WorkspaceView } from "./components/WorkspaceView";
import { AuditModal } from "./components/AuditModal";
import { ThreatModal } from "./components/ThreatModal";
import { SamplesModal } from "./components/SamplesModal";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(""));
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
  const [classMapping, setClassMapping] = useState<{ name: string; text: string } | null>(null);

  // Modals
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showSamplesModal, setShowSamplesModal] = useState(false);
  const [showThreatModal, setShowThreatModal] = useState<AuditLogItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mappingInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

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

    return () => {
      unsubscribe();
      abortControllersRef.current.forEach((ctrl) => ctrl.abort());
      abortControllersRef.current.clear();
    };
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
      const envelope = inspectAndSealArtifact(buffer, parsed, sample.name);
      const isRestricted = !envelope.allowed;
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
        flagged: isRestricted,
        reason: isRestricted ? `Restricted bytecode signature [${envelope.code || "SIG-0x9C4E"}]` : undefined,
        ipPlaceholder: `10.84.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 255)}`,
      };

      addAuditLog(logItem);

      if (isRestricted) {
        setShowThreatModal(logItem);
      }

      const newFile: DecompilerFile = {
        id: fileId,
        name: sample.name,
        size: buffer.byteLength,
        status: isRestricted ? "failed" : "parsed",
        parsedClass: parsed,
        rawBase64: isRestricted ? undefined : sample.base64,
        envelopeSeal: isRestricted ? undefined : envelope.seal,
        isProtected: isRestricted,
        error: isRestricted
          ? "Restricted bytecode signature detected. Source reconstruction is disabled."
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
          const envelope = inspectAndSealArtifact(buffer, parsed, file.name);
          const isRestricted = !envelope.allowed;

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
            flagged: isRestricted,
            reason: isRestricted ? `Restricted bytecode signature [${envelope.code || "SIG-0x9C4E"}]` : undefined,
            ipPlaceholder: `10.84.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 255)}`,
          };

          addAuditLog(logItem);

          if (isRestricted) {
            setShowThreatModal(logItem);
            setFiles((prev) =>
              prev.map((f) =>
                f.id === targetDecompilerFile.id
                  ? {
                      ...f,
                      status: "failed",
                      parsedClass: parsed,
                      rawBase64: undefined,
                      envelopeSeal: undefined,
                      isProtected: true,
                      error:
                        "Restricted bytecode signature detected. Source reconstruction is disabled and this attempt has been logged.",
                    }
                  : f
              )
            );
          } else {
            const rawBase64 = arrayBufferToBase64(buffer);
            setFiles((prev) =>
              prev.map((f) =>
                f.id === targetDecompilerFile.id
                  ? {
                      ...f,
                      status: "parsed",
                      parsedClass: parsed,
                      rawBase64,
                      envelopeSeal: envelope.seal,
                    }
                  : f
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

  const cancelDecompile = (fileId: string) => {
    const controller = abortControllersRef.current.get(fileId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(fileId);
    }
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId && f.status === "decompiling"
          ? {
              ...f,
              status: "parsed",
              decompileProgress: undefined,
              error: undefined,
            }
          : f
      )
    );
  };

  const decompileFile = async (fileId: string) => {
    const targetFile = files.find((f) => f.id === fileId);
    if (!targetFile || !targetFile.parsedClass || targetFile.status === "decompiling") return;

    const envelope = inspectAndSealArtifact(undefined, targetFile.parsedClass, targetFile.name);
    if (targetFile.isProtected || !envelope.allowed || !targetFile.envelopeSeal || !targetFile.rawBase64) {
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
        reason: `Restricted bytecode signature [${envelope.code || "SIG-0x9C4E"}]`,
        ipPlaceholder: `10.84.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 255)}`,
      };

      setShowThreatModal(threatItem);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: "failed",
                rawBase64: undefined,
                envelopeSeal: undefined,
                isProtected: true,
                error: "Restricted bytecode signature detected. Source reconstruction is disabled.",
              }
            : f
        )
      );
      return;
    }

    abortControllersRef.current.get(fileId)?.abort();
    const controller = new AbortController();
    abortControllersRef.current.set(fileId, controller);

    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? {
              ...f,
              status: "decompiling",
              decompileProgress: includeAnnotations
                ? "Decompiling with CFR 0.152 & preparing notes..."
                : "Running CFR 0.152 decompiler...",
              error: undefined,
            }
          : f
      )
    );

    try {
      const res = await fetch("/api/decompile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          classBytesBase64: targetFile.rawBase64,
          fileName: targetFile.name,
          mappingText: classMapping?.text,
          envelopeSeal: targetFile.envelopeSeal,
          includeAnnotations,
          classData: {
            thisClassName: targetFile.parsedClass.thisClassName,
            jdkVersion: targetFile.parsedClass.jdkVersion,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403 || errData.restricted) {
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
            reason: "Restricted bytecode signature [SIG-0x9C4E]",
            ipPlaceholder: `10.84.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 255)}`,
          };
          addAuditLog(threatItem);
          setShowThreatModal(threatItem);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileId
                ? {
                    ...f,
                    status: "failed",
                    rawBase64: undefined,
                    envelopeSeal: undefined,
                    isProtected: true,
                    decompileProgress: undefined,
                    error: errData.error || "Restricted bytecode signature detected.",
                  }
                : f
            )
          );
          return;
        }
        throw new Error(errData.error || "CFR decompilation failed.");
      }

      const data = await res.json();
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: "decompiled",
                decompileProgress: undefined,
                mappingName: classMapping?.name,
                decompiledResult: {
                  javaSource: data.javaSource || "",
                  classSummary: data.classSummary || "",
                  summaryModel: data.summaryModel,
                  annotations: Array.isArray(data.annotations) ? data.annotations : [],
                  includeAnnotations,
                },
              }
            : f
        )
      );
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId && f.status === "decompiling"
              ? {
                  ...f,
                  status: "parsed",
                  decompileProgress: undefined,
                  error: undefined,
                }
              : f
          )
        );
        return;
      }

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
    } finally {
      if (abortControllersRef.current.get(fileId) === controller) {
        abortControllersRef.current.delete(fileId);
      }
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
                  summaryModel: data.summaryModel,
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
    abortControllersRef.current.get(fileId)?.abort();
    abortControllersRef.current.delete(fileId);
    setFiles((prev) => {
      const filtered = prev.filter((f) => f.id !== fileId);
      if (selectedFileId === fileId) {
        setSelectedFileId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  const handleClearAll = () => {
    abortControllersRef.current.forEach((ctrl) => ctrl.abort());
    abortControllersRef.current.clear();
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

  const handleMappingChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      setError("Mapping file exceeds the 16 MiB limit.");
      return;
    }
    try {
      const text = await file.text();
      if (!/^[^\s#]+\s+->\s+[^\s:]+:\s*$/m.test(text)) {
        setError("Choose a valid ProGuard/R8/Mojang mapping file (mapping.txt).");
        return;
      }
      setError(null);
      setClassMapping({ name: file.name, text });
    } catch {
      setError("Failed to read mapping file.");
    }
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
      <input
        type="file"
        ref={mappingInputRef}
        onChange={handleMappingChange}
        accept=".txt,.map,.proguard"
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
            mappingName={classMapping?.name || null}
            onToggleAnnotations={setIncludeAnnotations}
            onGenerateAnnotations={generateAnnotationsForFile}
            onUploadMapping={() => mappingInputRef.current?.click()}
            onClearMapping={() => setClassMapping(null)}
            onSelectFile={setSelectedFileId}
            onRemoveFile={handleRemoveFile}
            onClearAll={handleClearAll}
            onDecompileFile={decompileFile}
            onCancelDecompile={cancelDecompile}
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
