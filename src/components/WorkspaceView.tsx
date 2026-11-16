import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  X,
  Copy,
  Check,
  Download,
  RefreshCw,
  AlertCircle,
  Search,
  Lock,
  Loader2,
  FileCode2,
  ChevronDown,
  Square,
  Upload,
} from "lucide-react";
import { DecompilerFile, WorkspaceTab } from "../types";
import { WARM_OBSIDIAN_THEME } from "../theme";
import {
  VirtualBytecodeViewer,
  VirtualCodeViewer,
  VirtualConstantPoolViewer,
} from "./VirtualViewers";

interface WorkspaceViewProps {
  files: DecompilerFile[];
  selectedFileId: string | null;
  activeTab: WorkspaceTab;
  selectedMethodIdx: number;
  isDragging: boolean;
  copied: boolean;
  includeAnnotations: boolean;
  annotatingFileId: string | null;
  mappingName: string | null;
  onToggleAnnotations: (val: boolean) => void;
  onGenerateAnnotations: (fileId: string) => void;
  onUploadMapping: () => void;
  onClearMapping: () => void;
  onSelectFile: (fileId: string) => void;
  onRemoveFile: (fileId: string, e: React.MouseEvent) => void;
  onClearAll: () => void;
  onDecompileFile: (fileId: string) => void;
  onCancelDecompile: (fileId: string) => void;
  onBulkDecompile: () => void;
  onSelectTab: (tab: WorkspaceTab) => void;
  onSelectMethod: (idx: number, switchToBytecode?: boolean) => void;
  onCopyCode: () => void;
  onDownloadJava: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  formatSize: (bytes: number) => string;
}

const OPCODE_REFERENCE = [
  {
    name: "aload_0 / aload_1",
    summary:
      "Pushes an object reference from the local variable frame onto the operand stack (index 0 is 'this' in instance methods).",
  },
  {
    name: "invokevirtual",
    summary:
      "Dispatches an instance method dynamically based on the runtime class of the target object reference.",
  },
  {
    name: "invokestatic",
    summary:
      "Invokes a static class method directly without an object receiver or virtual method table lookup.",
  },
  {
    name: "invokespecial",
    summary:
      "Calls constructors (<init>), private methods, or superclass implementations directly.",
  },
  {
    name: "getstatic / getfield",
    summary:
      "Reads a static class field or instance field reference and pushes its value onto the stack.",
  },
  {
    name: "ldc / ldc_w",
    summary:
      "Loads a numeric, string, or class constant entry from the constant pool onto the operand stack.",
  },
  {
    name: "areturn / ireturn",
    summary:
      "Returns an object reference (areturn) or 32-bit integer/boolean value (ireturn) from the current frame.",
  },
];

function formatErrorDisplay(rawError?: string): { summary: string; details?: string } {
  const fallback = "Unable to reconstruct Java source for this class file.";
  if (!rawError) return { summary: fallback };

  const trimmed = rawError.trim();
  try {
    const parsed = JSON.parse(trimmed);
    const apiErr = parsed?.error || parsed;
    if (apiErr?.message) {
      const firstLine = String(apiErr.message).split("\n")[0].trim();
      const codePrefix = apiErr.code ? `Error ${apiErr.code}: ` : "";
      return {
        summary: `${codePrefix}${firstLine}`,
        details: JSON.stringify(parsed, null, 2),
      };
    }
  } catch {
    // Not raw JSON
  }

  if (trimmed.length > 240) {
    const firstSentence = trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed.slice(0, 220) + "…";
    return {
      summary: firstSentence,
      details: trimmed,
    };
  }

  return { summary: trimmed };
}

function getStatusDisplay(file: DecompilerFile): { label: string; colorClass: string } {
  if (file.isProtected) {
    return { label: "Blocked", colorClass: "text-[#C76E6E]" };
  }
  switch (file.status) {
    case "parsing":
      return { label: "Parsing", colorClass: "text-[#A69E94]" };
    case "parsed":
      return { label: "Ready", colorClass: "text-[#A69E94]" };
    case "decompiling":
      return { label: "Decompiling", colorClass: "text-[#C8A064]" };
    case "decompiled":
      return { label: "Decompiled", colorClass: "text-[#7EA287]" };
    case "failed":
      return { label: "Failed", colorClass: "text-[#C76E6E]" };
    default:
      return { label: "Idle", colorClass: "text-[#706961]" };
  }
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  files,
  selectedFileId,
  activeTab,
  selectedMethodIdx,
  isDragging,
  copied,
  includeAnnotations,
  annotatingFileId,
  mappingName,
  onToggleAnnotations,
  onGenerateAnnotations,
  onUploadMapping,
  onClearMapping,
  onSelectFile,
  onRemoveFile,
  onClearAll,
  onDecompileFile,
  onCancelDecompile,
  onBulkDecompile,
  onSelectTab,
  onSelectMethod,
  onCopyCode,
  onDownloadJava,
  onDragOver,
  onDragLeave,
  onDrop,
  formatSize,
}) => {
  const SUMMARY_STORAGE_KEY = "jadai.summaryWidthPct";
  const DEFAULT_SUMMARY_PCT = 41.67;

  const readSavedSummaryWidth = () => {
    try {
      const raw = localStorage.getItem(SUMMARY_STORAGE_KEY);
      if (!raw) return DEFAULT_SUMMARY_PCT;
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? Math.min(70, Math.max(22, parsed)) : DEFAULT_SUMMARY_PCT;
    } catch {
      return DEFAULT_SUMMARY_PCT;
    }
  };

  const [cpSearch, setCpSearch] = useState("");
  const [isMethodMenuOpen, setIsMethodMenuOpen] = useState(false);
  const [isMobileRailOpen, setIsMobileRailOpen] = useState(false);
  const [summaryWidthPct, setSummaryWidthPct] = useState<number>(readSavedSummaryWidth);
  const [isResizingSummary, setIsResizingSummary] = useState(false);

  const methodMenuRef = useRef<HTMLDivElement>(null);
  const sourceSplitRef = useRef<HTMLDivElement>(null);
  const summaryPaneRef = useRef<HTMLDivElement>(null);
  const latestSummaryWidthRef = useRef<number>(summaryWidthPct);

  const persistSummaryWidth = (pct: number) => {
    const clamped = Math.round(Math.min(70, Math.max(22, pct)) * 100) / 100;
    latestSummaryWidthRef.current = clamped;
    setSummaryWidthPct(clamped);
    try {
      localStorage.setItem(SUMMARY_STORAGE_KEY, String(clamped));
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    const handlePointerDownOutside = (e: MouseEvent) => {
      if (methodMenuRef.current && !methodMenuRef.current.contains(e.target as Node)) {
        setIsMethodMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMethodMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setIsMethodMenuOpen(false);
  }, [selectedFileId, activeTab]);

  useEffect(() => {
    if (!isResizingSummary) return;

    let rafId: number | null = null;
    let pendingPct = latestSummaryWidthRef.current;

    const applyWidth = () => {
      rafId = null;
      if (summaryPaneRef.current) {
        summaryPaneRef.current.style.setProperty("--summary-width", `${pendingPct}%`);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const container = sourceSplitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const rawPct = ((rect.right - e.clientX) / rect.width) * 100;
      pendingPct = Math.round(Math.min(70, Math.max(22, rawPct)) * 100) / 100;
      latestSummaryWidthRef.current = pendingPct;
      if (rafId === null) {
        rafId = requestAnimationFrame(applyWidth);
      }
    };

    const handlePointerUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      persistSummaryWidth(latestSummaryWidthRef.current);
      setIsResizingSummary(false);
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingSummary]);

  const activeFile = files.find((f) => f.id === selectedFileId) || null;
  const parsedClass = activeFile?.parsedClass || null;
  const decompiledResult = activeFile?.decompiledResult || null;
  const parsedQueueCount = files.filter((f) => f.status === "parsed").length;

  const { packagePath, simpleClassName } = useMemo(() => {
    const raw = parsedClass?.thisClassName || activeFile?.name.replace(/\.class$/i, "") || "Class";
    const parts = raw.split("/");
    const name = parts.pop() || raw;
    const pkg = parts.join(".");
    return { packagePath: pkg, simpleClassName: name };
  }, [parsedClass?.thisClassName, activeFile?.name]);

  const sourceLines = useMemo(() => {
    if (!decompiledResult?.javaSource) return [];
    return decompiledResult.javaSource.split("\n");
  }, [decompiledResult?.javaSource]);

  const filteredConstantPool = useMemo(() => {
    if (!parsedClass?.constantPool) return [];
    const q = cpSearch.trim().toLowerCase();
    if (!q) return parsedClass.constantPool;
    return parsedClass.constantPool.filter(
      (cp) =>
        `#${cp.index}`.includes(q) ||
        cp.tagName.toLowerCase().includes(q) ||
        cp.details.toLowerCase().includes(q)
    );
  }, [parsedClass?.constantPool, cpSearch]);

  const selectedMethod = parsedClass?.methods[selectedMethodIdx] || null;

  const activeStatus = activeFile ? getStatusDisplay(activeFile) : null;
  const isAnnotating = Boolean(activeFile && annotatingFileId === activeFile.id);
  const hasSummaryOrNotes = Boolean(
    decompiledResult &&
      (decompiledResult.classSummary?.trim() || (decompiledResult.annotations && decompiledResult.annotations.length > 0))
  );

  return (
    <div className="flex-1 max-w-[1600px] w-full mx-auto flex flex-col lg:flex-row min-h-0 overflow-hidden">
      {/* MOBILE COMPACT RAIL BAR */}
      <div className="lg:hidden px-4 py-2 border-b border-[#2A2623] bg-[#141210] flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0 flex items-center gap-2 text-xs">
          <span className="font-mono text-[#EAE5DE] truncate">
            {activeFile?.name || "No class selected"}
          </span>
          {activeStatus && (
            <>
              <span className="text-[#4A443E]" aria-hidden="true">
                ·
              </span>
              <span className={`${activeStatus.colorClass} shrink-0`}>{activeStatus.label}</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsMobileRailOpen((prev) => !prev)}
          aria-expanded={isMobileRailOpen}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1C1917] hover:bg-[#24211E] border border-[#2E2A26] text-[11px] font-medium text-[#C4BCB3] shrink-0 cursor-pointer"
        >
          <span>Queue &amp; Outline ({files.length})</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-[#A69E94] transition-transform duration-150 ${
              isMobileRailOpen ? "rotate-180 text-[#C5A880]" : ""
            }`}
          />
        </button>
      </div>

      {/* LEFT RAIL: Class Queue & Class Outline */}
      <aside
        className={`${
          isMobileRailOpen ? "flex max-h-[48vh]" : "hidden"
        } lg:flex w-full lg:w-76 shrink-0 border-b lg:border-b-0 lg:border-r border-[#2A2623] bg-[#141210] flex-col min-h-0 lg:max-h-none`}
      >
        {/* Queue Header */}
        <div className="px-4 py-3 border-b border-[#2A2623] flex items-center justify-between shrink-0">
          <span className="text-xs font-medium text-[#EAE5DE] tabular-nums">
            Class Queue ({files.length})
          </span>
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-[#706961] hover:text-[#C76E6E] transition-colors cursor-pointer"
          >
            Clear all
          </button>
        </div>

        {/* Queue Drop Pocket & File List */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`px-3 pt-3 pb-2 shrink-0 transition-colors ${
            isDragging ? "bg-[#1F1C1A]" : ""
          }`}
        >
          <div
            className={`px-3 py-2 rounded-lg border border-dashed text-center text-[11px] transition-colors ${
              isDragging
                ? "border-[#C5A880] text-[#EAE5DE] bg-[#1F1C1A]"
                : "border-[#2E2A26] text-[#706961]"
            }`}
          >
            Drop additional .class files here
          </div>
        </div>

        <div className="px-2 pb-2 overflow-y-auto divide-y divide-[#201D1A] max-h-44 lg:max-h-56 shrink-0">
          {files.map((file) => {
            const isSelected = file.id === selectedFileId;
            const status = getStatusDisplay(file);

            return (
              <div
                key={file.id}
                onClick={() => {
                  onSelectFile(file.id);
                  setIsMobileRailOpen(false);
                }}
                className={`px-2.5 py-2.5 rounded-lg cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                  isSelected ? "bg-[#1F1C1A]" : "hover:bg-[#191715]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className={`font-mono text-xs truncate ${
                      isSelected ? "text-[#EAE5DE] font-medium" : "text-[#C4BCB3]"
                    }`}
                    title={file.name}
                  >
                    {file.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums">
                    <span className="text-[#706961]">{formatSize(file.size)}</span>
                    <span className="text-[#4A443E]" aria-hidden="true">
                      ·
                    </span>
                    <span className={status.colorClass}>{status.label}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {file.status === "parsed" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDecompileFile(file.id);
                      }}
                      title="Decompile with CFR"
                      aria-label={`Decompile ${file.name}`}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-[#C5A880] hover:bg-[#2A2623] transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {file.status === "decompiling" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancelDecompile(file.id);
                      }}
                      title="Cancel reconstruction"
                      aria-label={`Cancel reconstruction for ${file.name}`}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-[#C76E6E] hover:bg-[#2A2623] transition-colors cursor-pointer"
                    >
                      <Square className="w-3 h-3 fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => onRemoveFile(file.id, e)}
                    title="Remove file"
                    aria-label={`Remove ${file.name}`}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-[#706961] hover:text-[#C76E6E] hover:bg-[#2A2623] transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {parsedQueueCount > 0 && (
          <div className="px-3 pb-3 pt-1 border-b border-[#2A2623] shrink-0">
            <button
              type="button"
              onClick={onBulkDecompile}
              className="w-full py-2 px-3 rounded-lg bg-[#221F1C] hover:bg-[#2B2723] border border-[#35302B] text-xs font-medium text-[#EAE5DE] transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 text-[#C5A880]" />
              <span>Decompile Queued ({parsedQueueCount})</span>
            </button>
          </div>
        )}

        {/* ProGuard / R8 / Mojang Deobfuscation Mapping */}
        <div className="px-3 py-2.5 border-b border-[#2A2623] shrink-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-medium text-[#706961]">Deobfuscation Mapping</span>
            {mappingName && (
              <button
                type="button"
                onClick={onClearMapping}
                className="text-[11px] text-[#706961] hover:text-[#C76E6E] transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          {mappingName ? (
            <div className="px-2.5 py-1.5 rounded-md bg-[#181614] border border-[#2E2A26] flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-[#C5A880] truncate" title={mappingName}>
                {mappingName}
              </span>
              <button
                type="button"
                onClick={onUploadMapping}
                className="text-[10px] text-[#A69E94] hover:text-[#EAE5DE] shrink-0 cursor-pointer"
              >
                Replace
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onUploadMapping}
              className="w-full py-1.5 px-2.5 rounded-md bg-[#181614] hover:bg-[#1F1C1A] border border-[#2A2623] hover:border-[#35302B] text-[11px] text-[#A69E94] hover:text-[#EAE5DE] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3 h-3 text-[#C5A880]" />
              <span>Load mapping.txt</span>
            </button>
          )}
        </div>

        {/* Class Outline (Metadata, Fields, Methods) */}
        <div className="flex-1 flex flex-col min-h-0 border-t border-[#2A2623]">
          <div className="px-4 py-2.5 border-b border-[#24211E] flex items-center justify-between shrink-0">
            <span className="text-xs font-medium text-[#EAE5DE]">Class Outline</span>
            {parsedClass && (
              <span className="font-mono text-[11px] text-[#706961] tabular-nums">
                {parsedClass.jdkVersion}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
            {parsedClass ? (
              <>
                {/* Compact Metadata */}
                <dl className="space-y-1.5 text-xs px-1">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#706961]">Bytecode</dt>
                    <dd className="font-mono text-[#C4BCB3] tabular-nums">
                      {parsedClass.majorVersion}.{parsedClass.minorVersion}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#706961]">Modifiers</dt>
                    <dd className="font-mono text-[#C4BCB3] truncate text-right">
                      {parsedClass.accessFlagsNames.join(" ") || "package-private"}
                    </dd>
                  </div>
                </dl>

                {/* Fields */}
                {parsedClass.fields.length > 0 && (
                  <div>
                    <h3 className="px-1 text-[11px] font-medium text-[#706961] mb-1.5 tabular-nums">
                      Fields ({parsedClass.fields.length})
                    </h3>
                    <div className="space-y-1">
                      {parsedClass.fields.map((field, idx) => (
                        <div
                          key={idx}
                          className="px-2 py-1.5 rounded-md bg-[#181614] border border-[#24211E] font-mono text-[11px]"
                        >
                          <div className="text-[#EAE5DE] truncate">{field.name}</div>
                          <div className="text-[#706961] text-[10px] truncate">{field.descriptor}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Methods */}
                <div>
                  <h3 className="px-1 text-[11px] font-medium text-[#706961] mb-1.5 tabular-nums">
                    Methods ({parsedClass.methods.length})
                  </h3>
                  <div className="space-y-1">
                    {parsedClass.methods.map((method, idx) => {
                      const isMethodSelected = idx === selectedMethodIdx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            onSelectMethod(idx, true);
                            setIsMobileRailOpen(false);
                          }}
                          className={`w-full px-2.5 py-2 rounded-md text-left transition-colors cursor-pointer ${
                            isMethodSelected
                              ? "bg-[#221F1C] border border-[#38332E]"
                              : "hover:bg-[#191715] border border-transparent"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`font-mono text-xs truncate ${
                                isMethodSelected ? "text-[#C5A880] font-medium" : "text-[#EAE5DE]"
                              }`}
                            >
                              {method.name}
                            </span>
                            {method.code && (
                              <span className="font-mono text-[10px] text-[#706961] tabular-nums shrink-0">
                                {method.code.instructions.length} op
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-[#706961] truncate mt-0.5">
                            {method.descriptor}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-[#706961] px-1 py-4">Select a parsed class to inspect its outline.</p>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <section className="flex-1 min-w-0 flex flex-col bg-[#11100F] min-h-0 overflow-hidden">
        {/* Context Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-[#2A2623] flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs font-mono text-[#706961]">
              {packagePath && <span className="break-all sm:truncate">{packagePath}</span>}
              {packagePath && <span aria-hidden="true">/</span>}
              <span className="text-[#EAE5DE] font-medium">{simpleClassName}</span>
            </div>
            {parsedClass && (
              <p className="mt-1 text-xs text-[#A69E94] truncate tabular-nums">
                extends <span className="font-mono text-[#C4BCB3]">{parsedClass.superClassName.replace(/\//g, ".")}</span>
                {parsedClass.interfaces.length > 0 && (
                  <>
                    {" · "}implements {parsedClass.interfaces.map((i) => i.split("/").pop()).join(", ")}
                  </>
                )}
                {" · "}
                {parsedClass.methods.length} methods · {parsedClass.constantPool.length} constants
              </p>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-2 sm:gap-2.5 shrink-0">
            {activeFile && activeFile.status === "decompiling" && (
              <button
                type="button"
                onClick={() => onCancelDecompile(activeFile.id)}
                className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg bg-[#261818] hover:bg-[#332020] border border-[#5A3232] text-[#E6A3A3] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Cancel Reconstruction</span>
              </button>
            )}

            {activeFile && !activeFile.isProtected && (activeFile.status === "parsed" || activeFile.status === "failed") && (
              <>
                <label
                  data-theme={WARM_OBSIDIAN_THEME.bgCanvas}
                  className="group inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#181614] hover:bg-[#1F1C1A] border border-[#2A2623] hover:border-[#35302B] text-xs font-medium text-[#C4BCB3] cursor-pointer select-none whitespace-nowrap transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={includeAnnotations}
                    onChange={(e) => onToggleAnnotations(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`w-4 h-4 rounded flex items-center justify-center border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#C5A880]/60 ${
                      includeAnnotations
                        ? "bg-[#C5A880] border-[#C5A880] text-[#11100F]"
                        : "bg-[#12100E] border-[#35302B] group-hover:border-[#C5A880]/70 text-transparent"
                    }`}
                  >
                    <Check className="w-3 h-3 stroke-[2.75]" />
                  </span>
                  <span className={includeAnnotations ? "text-[#EAE5DE]" : "text-[#C4BCB3]"}>
                    AI Summary &amp; Notes
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => onDecompileFile(activeFile.id)}
                  className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg bg-[#C5A880] hover:bg-[#D2B894] text-[#11100F] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Reconstruct Source</span>
                </button>
              </>
            )}

            {decompiledResult && (
              <>
                <button
                  type="button"
                  onClick={() => activeFile && onDecompileFile(activeFile.id)}
                  title="Re-run CFR decompilation (applies current mapping)"
                  className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg bg-[#181614] hover:bg-[#221F1C] border border-[#2A2623] text-xs font-medium text-[#EAE5DE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#C5A880]" />
                  <span>Re-decompile</span>
                </button>
                <button
                  type="button"
                  onClick={onCopyCode}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg bg-[#181614] hover:bg-[#221F1C] border border-[#2A2623] text-xs font-medium text-[#EAE5DE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#7EA287]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#A69E94]" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onDownloadJava}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg bg-[#181614] hover:bg-[#221F1C] border border-[#2A2623] text-xs font-medium text-[#EAE5DE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#A69E94]" />
                  <span>Download .java</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="px-4 sm:px-6 border-b border-[#2A2623] bg-[#141210] flex items-center gap-4 sm:gap-6 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => onSelectTab("java")}
            className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "java"
                ? "border-[#C5A880] text-[#EAE5DE]"
                : "border-transparent text-[#A69E94] hover:text-[#EAE5DE]"
            }`}
          >
            <span className="hidden sm:inline">Reconstructed </span>Source
          </button>
          <button
            type="button"
            onClick={() => onSelectTab("bytecode")}
            className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "bytecode"
                ? "border-[#C5A880] text-[#EAE5DE]"
                : "border-transparent text-[#A69E94] hover:text-[#EAE5DE]"
            }`}
          >
            Bytecode<span className="hidden sm:inline"> Disassembly</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab("structure")}
            className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "structure"
                ? "border-[#C5A880] text-[#EAE5DE]"
                : "border-transparent text-[#A69E94] hover:text-[#EAE5DE]"
            }`}
          >
            Constant Pool
          </button>
        </div>

        {/* TAB CONTENT */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* TAB 1: RECONSTRUCTED JAVA */}
          {activeTab === "java" && (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {activeFile?.status === "decompiling" ? (
                <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-10 flex">
                  <div className="m-auto w-full max-w-md flex flex-col items-center text-center">
                    <Loader2 className="w-7 h-7 text-[#C5A880] animate-spin mb-4" />
                    <h3 className="font-display text-lg font-normal text-[#EAE5DE]">
                      Reconstructing Java source
                    </h3>
                    <p className="mt-1.5 text-sm text-[#A69E94]">
                      Decompiling JVM bytecode deterministically with CFR 0.152.
                    </p>
                    {activeFile.decompileProgress && (
                      <p className="mt-3 font-mono text-xs text-[#C5A880] tabular-nums">
                        {activeFile.decompileProgress}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => onCancelDecompile(activeFile.id)}
                      className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#261818] hover:bg-[#332020] border border-[#5A3232] text-xs font-medium text-[#E6A3A3] transition-colors cursor-pointer shrink-0"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>Cancel Reconstruction</span>
                    </button>
                  </div>
                </div>
              ) : decompiledResult ? (
                <div
                  ref={sourceSplitRef}
                  className="flex-1 min-h-0 flex flex-col xl:flex-row overflow-hidden"
                >
                  {/* Source Code Pane */}
                  <div className="flex-1 min-w-0 border-b xl:border-b-0 bg-[#141210] flex flex-col min-h-[320px] xl:min-h-0 overflow-hidden">
                    <div className="px-5 py-2.5 border-b border-[#24211E] flex items-center justify-between text-xs text-[#706961] shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[#A69E94] truncate">{simpleClassName}.java</span>
                        {activeFile?.mappingName && (
                          <span className="font-mono text-[11px] text-[#7EA287] truncate">
                            · {activeFile.mappingName}
                          </span>
                        )}
                      </div>
                      <span className="tabular-nums shrink-0">{sourceLines.length} lines</span>
                    </div>
                    <VirtualCodeViewer lines={sourceLines} />
                  </div>

                  {/* Draggable Summary Edge Handle */}
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize summary panel"
                    tabIndex={0}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      latestSummaryWidthRef.current = summaryWidthPct;
                      setIsResizingSummary(true);
                    }}
                    onDoubleClick={() => persistSummaryWidth(DEFAULT_SUMMARY_PCT)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        persistSummaryWidth(summaryWidthPct + 2);
                      } else if (e.key === "ArrowRight") {
                        e.preventDefault();
                        persistSummaryWidth(summaryWidthPct - 2);
                      }
                    }}
                    className={`hidden xl:flex w-1.5 -ml-[3px] z-10 shrink-0 cursor-col-resize items-center justify-center group focus:outline-none ${
                      isResizingSummary ? "bg-[#C5A880]/20" : "hover:bg-[#C5A880]/10"
                    }`}
                  >
                    <div
                      className={`w-px h-full transition-colors ${
                        isResizingSummary
                          ? "bg-[#C5A880]"
                          : "bg-[#2A2623] group-hover:bg-[#C5A880]/70 group-focus-visible:bg-[#C5A880]"
                      }`}
                    />
                  </div>

                  {/* Class Summary & AI Annotations Pane */}
                  <div
                    ref={summaryPaneRef}
                    style={{ ["--summary-width" as string]: `${summaryWidthPct}%` }}
                    className={`w-full xl:w-[var(--summary-width)] xl:shrink-0 bg-[#11100F] flex flex-col overflow-y-auto ${
                      hasSummaryOrNotes ? "min-h-[220px] xl:min-h-0" : "shrink-0 xl:min-h-0"
                    }`}
                  >
                    {!hasSummaryOrNotes ? (
                      <div className="p-4 sm:p-6 flex flex-col sm:flex-row xl:flex-col sm:items-center xl:items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xs font-medium text-[#C5A880]">AI Summary &amp; Notes</h3>
                          <p className="mt-1 text-xs text-[#A69E94] leading-relaxed">
                            Skipped for faster decompilation. Generate an AI architectural summary and bytecode notes anytime.
                          </p>
                        </div>
                        {activeFile && (
                          <button
                            type="button"
                            disabled={isAnnotating}
                            onClick={() => onGenerateAnnotations(activeFile.id)}
                            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-[#221F1C] hover:bg-[#2B2723] disabled:opacity-60 border border-[#35302B] text-xs font-medium text-[#EAE5DE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {isAnnotating ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A880]" />
                                <span>Generating...</span>
                              </>
                            ) : (
                              <span>Generate Summary &amp; Notes</span>
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="p-5 sm:p-6 border-b border-[#24211E]">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h3 className="text-xs font-medium text-[#C5A880]">Class Summary</h3>
                            {decompiledResult.summaryModel && (
                              <span
                                className="font-mono text-[11px] text-[#706961] truncate"
                                title={`Model: ${decompiledResult.summaryModel}`}
                              >
                                {decompiledResult.summaryModel}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-[#C4BCB3] leading-relaxed">
                            {decompiledResult.classSummary}
                          </p>
                        </div>

                        <div className="p-5 sm:p-6 flex-1">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-medium text-[#EAE5DE]">Bytecode Annotations</h3>
                            <span className="text-xs text-[#706961] tabular-nums">
                              {decompiledResult.annotations.length} notes
                            </span>
                          </div>

                          {decompiledResult.annotations.length > 0 ? (
                            <div className="divide-y divide-[#24211E]">
                              {decompiledResult.annotations.map((annot, idx) => {
                                const lower = annot.concept.toLowerCase();
                                const conceptTone =
                                  lower.includes("sec") || lower.includes("warn")
                                    ? "text-[#C76E6E]"
                                    : lower.includes("opt") || lower.includes("perf")
                                      ? "text-[#7EA287]"
                                      : "text-[#C5A880]";

                                return (
                                  <div key={idx} className="py-4 first:pt-0 last:pb-0">
                                    <div className="flex items-baseline justify-between gap-3">
                                      <span className="font-mono text-xs font-medium text-[#EAE5DE]">
                                        {annot.method}()
                                      </span>
                                      <span className={`text-xs font-medium text-right ${conceptTone}`}>
                                        {annot.concept}
                                      </span>
                                    </div>
                                    <p className="mt-1.5 text-[13px] text-[#A69E94] leading-relaxed">
                                      {annot.explanation}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-[#706961]">No method annotations returned.</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : activeFile?.status === "failed" ? (
                (() => {
                  const formattedError = formatErrorDisplay(activeFile.error);
                  return (
                    <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-10 flex">
                      <div className="m-auto w-full max-w-xl flex flex-col items-center text-center">
                        <div className="w-11 h-11 rounded-lg bg-[#261818] border border-[#5A3232] flex items-center justify-center text-[#C76E6E] mb-4 shrink-0">
                          {activeFile.isProtected ? <Lock className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        </div>
                        <h3 className="font-display text-lg font-normal text-[#EAE5DE]">
                          {activeFile.isProtected ? "Protected Class Blocked" : "Reconstruction Failed"}
                        </h3>
                        <p className="mt-2 text-sm text-[#A69E94] leading-relaxed break-words max-w-lg">
                          {formattedError.summary}
                        </p>
                        {formattedError.details && (
                          <details className="mt-3 w-full max-w-lg text-left">
                            <summary className="text-xs text-[#706961] hover:text-[#EAE5DE] cursor-pointer select-none text-center">
                              Show technical details
                            </summary>
                            <pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-[#141210] border border-[#2A2623] p-3 font-mono text-[11px] leading-relaxed text-[#A69E94] whitespace-pre-wrap break-all">
                              {formattedError.details}
                            </pre>
                          </details>
                        )}
                        {!activeFile.isProtected && (
                          <button
                            type="button"
                            onClick={() => onDecompileFile(activeFile.id)}
                            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#221F1C] hover:bg-[#2B2723] border border-[#35302B] text-xs font-medium text-[#EAE5DE] transition-colors cursor-pointer shrink-0"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Retry Reconstruction</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-10 flex">
                  <div className="m-auto w-full max-w-md flex flex-col items-center text-center">
                    <div className="w-11 h-11 rounded-lg bg-[#181614] border border-[#2A2623] flex items-center justify-center text-[#C5A880] mb-4 shrink-0">
                      <FileCode2 className="w-5 h-5" />
                    </div>
                    <h3 className="font-display text-lg font-normal text-[#EAE5DE]">
                      Ready to reconstruct source
                    </h3>
                    <p className="mt-2 text-sm text-[#A69E94] leading-relaxed">
                      Binary metadata and disassembled opcodes are loaded. Run source reconstruction to generate annotated Java code.
                    </p>
                    {activeFile && (
                      <button
                        type="button"
                        onClick={() => onDecompileFile(activeFile.id)}
                        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#C5A880] hover:bg-[#D2B894] text-[#11100F] text-xs font-semibold transition-colors cursor-pointer shrink-0"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Reconstruct Source</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DISASSEMBLED BYTECODE */}
          {activeTab === "bytecode" && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {parsedClass && selectedMethod ? (
                <>
                  {/* Method Telemetry Header */}
                  <div className="px-6 py-3 border-b border-[#24211E] bg-[#141210] flex flex-wrap items-center justify-between gap-4 shrink-0">
                    <div className="flex items-center gap-3 min-w-0" ref={methodMenuRef}>
                      <span id="method-select-label" className="text-xs text-[#706961] shrink-0">
                        Method
                      </span>
                      <div className="relative min-w-0 max-w-md">
                        <button
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={isMethodMenuOpen}
                          aria-labelledby="method-select-label"
                          onClick={() => setIsMethodMenuOpen((prev) => !prev)}
                          className={`w-full flex items-center justify-between gap-3 bg-[#181614] hover:bg-[#1C1A17] border rounded-lg px-3 py-1.5 font-mono text-xs text-[#EAE5DE] transition-colors cursor-pointer focus:outline-none ${
                            isMethodMenuOpen ? "border-[#C5A880]" : "border-[#2E2A26] hover:border-[#3D3732]"
                          }`}
                        >
                          <span className="truncate">
                            {selectedMethod.name} {selectedMethod.descriptor}
                          </span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-[#A69E94] shrink-0 transition-transform duration-150 ${
                              isMethodMenuOpen ? "rotate-180 text-[#C5A880]" : ""
                            }`}
                          />
                        </button>

                        {isMethodMenuOpen && (
                          <div
                            role="listbox"
                            aria-labelledby="method-select-label"
                            className="absolute left-0 top-full mt-1.5 min-w-full w-max max-w-[min(90vw,36rem)] max-h-72 overflow-y-auto rounded-lg bg-[#181614] border border-[#2E2A26] shadow-2xl py-1 z-30"
                          >
                            {parsedClass.methods.map((m, idx) => {
                              const isSelected = idx === selectedMethodIdx;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  role="option"
                                  aria-selected={isSelected}
                                  onClick={() => {
                                    onSelectMethod(idx, false);
                                    setIsMethodMenuOpen(false);
                                  }}
                                  className={`w-full px-3 py-2 flex items-center justify-between gap-3 text-left font-mono text-xs transition-colors cursor-pointer ${
                                    isSelected
                                      ? "bg-[#221F1C] text-[#C5A880]"
                                      : "text-[#C4BCB3] hover:bg-[#1F1C1A] hover:text-[#EAE5DE]"
                                  }`}
                                >
                                  <span className="truncate">
                                    {m.name} {m.descriptor}
                                  </span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-[#C5A880] shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedMethod.code && (
                      <div className="flex items-center gap-4 text-xs font-mono text-[#A69E94] tabular-nums">
                        <span>max_stack {selectedMethod.code.maxStack}</span>
                        <span className="text-[#4A443E]" aria-hidden="true">
                          ·
                        </span>
                        <span>max_locals {selectedMethod.code.maxLocals}</span>
                        <span className="text-[#4A443E]" aria-hidden="true">
                          ·
                        </span>
                        <span>{selectedMethod.code.instructions.length} instructions</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 overflow-hidden">
                    {/* Bytecode Table */}
                    <div className="xl:col-span-7 border-b xl:border-b-0 xl:border-r border-[#2A2623] bg-[#141210] flex flex-col min-h-[280px] xl:min-h-0 overflow-hidden">
                      {selectedMethod.code && selectedMethod.code.instructions.length > 0 ? (
                        <VirtualBytecodeViewer instructions={selectedMethod.code.instructions} />
                      ) : (
                        <div className="flex-1 flex items-center justify-center p-10 text-xs text-[#706961]">
                          This method is abstract or native and contains no bytecode attribute.
                        </div>
                      )}
                    </div>

                    {/* Opcode Reference */}
                    <div className="xl:col-span-5 bg-[#11100F] overflow-y-auto p-6">
                      <h3 className="text-xs font-medium text-[#EAE5DE] mb-4">Opcode Reference</h3>
                      <div className="divide-y divide-[#24211E]">
                        {OPCODE_REFERENCE.map((item) => (
                          <div key={item.name} className="py-3.5 first:pt-0 last:pb-0">
                            <div className="font-mono text-xs font-medium text-[#C5A880]">
                              {item.name}
                            </div>
                            <p className="mt-1 text-[13px] text-[#A69E94] leading-relaxed">
                              {item.summary}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-10 text-sm text-[#706961]">
                  Select a method from the class outline to inspect its bytecode.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CONSTANT POOL */}
          {activeTab === "structure" && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {parsedClass ? (
                <>
                  <div className="px-6 py-3 border-b border-[#24211E] bg-[#141210] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                    <div className="relative w-full sm:w-80">
                      <Search className="w-3.5 h-3.5 text-[#706961] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={cpSearch}
                        onChange={(e) => setCpSearch(e.target.value)}
                        placeholder="Filter by index, tag, or symbol..."
                        className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#181614] border border-[#2E2A26] text-xs text-[#EAE5DE] placeholder:text-[#706961] focus:outline-none focus:border-[#C5A880]"
                      />
                    </div>
                    <span className="text-xs text-[#706961] tabular-nums">
                      Showing {filteredConstantPool.length} of {parsedClass.constantPool.length} entries
                    </span>
                  </div>

                  <div className="flex-1 min-h-0 flex flex-col bg-[#141210] overflow-hidden">
                    {filteredConstantPool.length > 0 ? (
                      <VirtualConstantPoolViewer entries={filteredConstantPool} />
                    ) : (
                      <div className="py-16 text-center text-xs text-[#706961]">
                        No constant pool entries match "{cpSearch}".
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-10 text-sm text-[#706961]">
                  Load a compiled class file to inspect its constant pool.
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
