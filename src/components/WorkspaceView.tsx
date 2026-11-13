import React, { useMemo, useState } from "react";
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
} from "lucide-react";
import { DecompilerFile, WorkspaceTab } from "../types";

interface WorkspaceViewProps {
  files: DecompilerFile[];
  selectedFileId: string | null;
  activeTab: WorkspaceTab;
  selectedMethodIdx: number;
  isDragging: boolean;
  copied: boolean;
  onSelectFile: (fileId: string) => void;
  onRemoveFile: (fileId: string, e: React.MouseEvent) => void;
  onClearAll: () => void;
  onDecompileFile: (fileId: string) => void;
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
  onSelectFile,
  onRemoveFile,
  onClearAll,
  onDecompileFile,
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
  const [cpSearch, setCpSearch] = useState("");

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

  return (
    <div className="flex-1 max-w-[1600px] w-full mx-auto flex flex-col lg:flex-row min-h-0 overflow-hidden">
      {/* LEFT RAIL: Class Queue & Class Outline */}
      <aside className="w-full lg:w-76 shrink-0 border-b lg:border-b-0 lg:border-r border-[#2A2623] bg-[#141210] flex flex-col min-h-0 max-h-[340px] lg:max-h-none">
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
                onClick={() => onSelectFile(file.id)}
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
                      title="Reconstruct source"
                      aria-label={`Decompile ${file.name}`}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-[#C5A880] hover:bg-[#2A2623] transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
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
                          onClick={() => onSelectMethod(idx, true)}
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
        <div className="px-6 py-4 border-b border-[#2A2623] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-mono text-[#706961] truncate">
              {packagePath && <span>{packagePath}</span>}
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

          <div className="flex items-center gap-2.5 shrink-0">
            {activeFile && !activeFile.isProtected && (activeFile.status === "parsed" || activeFile.status === "failed") && (
              <button
                type="button"
                onClick={() => onDecompileFile(activeFile.id)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C5A880] hover:bg-[#D2B894] text-[#11100F] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Reconstruct Source</span>
              </button>
            )}

            {decompiledResult && (
              <>
                <button
                  type="button"
                  onClick={onCopyCode}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#181614] hover:bg-[#221F1C] border border-[#2A2623] text-xs font-medium text-[#EAE5DE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#181614] hover:bg-[#221F1C] border border-[#2A2623] text-xs font-medium text-[#EAE5DE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#A69E94]" />
                  <span>Download .java</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="px-6 border-b border-[#2A2623] bg-[#141210] flex items-center gap-6 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => onSelectTab("java")}
            className={`py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "java"
                ? "border-[#C5A880] text-[#EAE5DE]"
                : "border-transparent text-[#A69E94] hover:text-[#EAE5DE]"
            }`}
          >
            Reconstructed Source
          </button>
          <button
            type="button"
            onClick={() => onSelectTab("bytecode")}
            className={`py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "bytecode"
                ? "border-[#C5A880] text-[#EAE5DE]"
                : "border-transparent text-[#A69E94] hover:text-[#EAE5DE]"
            }`}
          >
            Bytecode Disassembly
          </button>
          <button
            type="button"
            onClick={() => onSelectTab("structure")}
            className={`py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                  <Loader2 className="w-7 h-7 text-[#C5A880] animate-spin mb-4" />
                  <h3 className="font-display text-lg font-normal text-[#EAE5DE]">
                    Reconstructing Java source
                  </h3>
                  <p className="mt-1.5 text-sm text-[#A69E94] max-w-md">
                    Analyzing control flow, resolving local variable types, and preparing compiler notes.
                  </p>
                </div>
              ) : decompiledResult ? (
                <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 overflow-hidden">
                  {/* Source Code Pane */}
                  <div className="xl:col-span-7 border-b xl:border-b-0 xl:border-r border-[#2A2623] bg-[#141210] flex flex-col min-h-[320px] xl:min-h-0 overflow-hidden">
                    <div className="px-5 py-2.5 border-b border-[#24211E] flex items-center justify-between text-xs text-[#706961] shrink-0">
                      <span className="font-mono text-[#A69E94]">{simpleClassName}.java</span>
                      <span className="tabular-nums">{sourceLines.length} lines</span>
                    </div>
                    <div className="flex-1 overflow-auto py-4 px-3 font-mono text-[13px] leading-[1.7] text-[#EAE5DE] select-text">
                      <table className="w-full border-collapse">
                        <tbody>
                          {sourceLines.map((line, i) => (
                            <tr key={i} className="hover:bg-[#1A1815]">
                              <td className="w-10 pr-4 text-right select-none text-[#57514B] text-xs tabular-nums align-top">
                                {i + 1}
                              </td>
                              <td className="whitespace-pre pr-4">{line || " "}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Class Summary & AI Annotations Pane */}
                  <div className="xl:col-span-5 bg-[#11100F] flex flex-col min-h-[260px] xl:min-h-0 overflow-y-auto">
                    <div className="p-6 border-b border-[#24211E]">
                      <h3 className="text-xs font-medium text-[#C5A880] mb-2">Class Summary</h3>
                      <p className="text-sm text-[#C4BCB3] leading-relaxed">
                        {decompiledResult.classSummary}
                      </p>
                    </div>

                    <div className="p-6 flex-1">
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
                  </div>
                </div>
              ) : activeFile?.status === "failed" ? (
                <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                  <div className="w-11 h-11 rounded-lg bg-[#261818] border border-[#5A3232] flex items-center justify-center text-[#C76E6E] mb-4">
                    {activeFile.isProtected ? <Lock className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  </div>
                  <h3 className="font-display text-lg font-normal text-[#EAE5DE]">
                    {activeFile.isProtected ? "Protected Class Blocked" : "Reconstruction Failed"}
                  </h3>
                  <p className="mt-2 text-sm text-[#A69E94] max-w-md leading-relaxed">
                    {activeFile.error || "Unable to reconstruct Java source for this class file."}
                  </p>
                  {!activeFile.isProtected && (
                    <button
                      type="button"
                      onClick={() => onDecompileFile(activeFile.id)}
                      className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#221F1C] hover:bg-[#2B2723] border border-[#35302B] text-xs font-medium text-[#EAE5DE] transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Reconstruction</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                  <div className="w-11 h-11 rounded-lg bg-[#181614] border border-[#2A2623] flex items-center justify-center text-[#C5A880] mb-4">
                    <FileCode2 className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-lg font-normal text-[#EAE5DE]">
                    Ready to reconstruct source
                  </h3>
                  <p className="mt-2 text-sm text-[#A69E94] max-w-md leading-relaxed">
                    Binary metadata and disassembled opcodes are loaded. Run source reconstruction to generate annotated Java code.
                  </p>
                  {activeFile && (
                    <button
                      type="button"
                      onClick={() => onDecompileFile(activeFile.id)}
                      className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#C5A880] hover:bg-[#D2B894] text-[#11100F] text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Reconstruct Source</span>
                    </button>
                  )}
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
                    <div className="flex items-center gap-3 min-w-0">
                      <label htmlFor="method-select" className="text-xs text-[#706961] shrink-0">
                        Method
                      </label>
                      <select
                        id="method-select"
                        value={selectedMethodIdx}
                        onChange={(e) => onSelectMethod(Number(e.target.value), false)}
                        className="bg-[#181614] border border-[#2E2A26] rounded-lg px-3 py-1.5 font-mono text-xs text-[#EAE5DE] focus:outline-none focus:border-[#C5A880] max-w-md truncate"
                      >
                        {parsedClass.methods.map((m, idx) => (
                          <option key={idx} value={idx}>
                            {m.name} {m.descriptor}
                          </option>
                        ))}
                      </select>
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
                        <div className="flex-1 overflow-auto">
                          <table className="w-full text-left border-collapse font-mono text-xs">
                            <thead className="sticky top-0 bg-[#181614] border-b border-[#2A2623] text-[#706961] text-[11px]">
                              <tr>
                                <th className="py-2.5 px-4 font-medium w-20">Offset</th>
                                <th className="py-2.5 px-3 font-medium w-20">Opcode</th>
                                <th className="py-2.5 px-3 font-medium w-36">Mnemonic</th>
                                <th className="py-2.5 px-4 font-medium">Operands &amp; Target</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#201D1A] tabular-nums">
                              {selectedMethod.code.instructions.map((inst, i) => (
                                <tr key={i} className="hover:bg-[#1B1917] transition-colors">
                                  <td className="py-2.5 px-4 text-[#706961]">{inst.offset}</td>
                                  <td className="py-2.5 px-3 text-[#A69E94]">
                                    0x{inst.opcode.toString(16).padStart(2, "0").toUpperCase()}
                                  </td>
                                  <td className="py-2.5 px-3 text-[#C5A880] font-medium">
                                    {inst.mnemonic}
                                  </td>
                                  <td className="py-2.5 px-4 text-[#EAE5DE] break-all">
                                    {inst.details || "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
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

                  <div className="flex-1 overflow-auto bg-[#141210]">
                    {filteredConstantPool.length > 0 ? (
                      <table className="w-full text-left border-collapse font-mono text-xs">
                        <thead className="sticky top-0 bg-[#181614] border-b border-[#2A2623] text-[#706961] text-[11px]">
                          <tr>
                            <th className="py-2.5 px-6 font-medium w-24">Index</th>
                            <th className="py-2.5 px-4 font-medium w-40">Tag</th>
                            <th className="py-2.5 px-6 font-medium">Resolved Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#201D1A] tabular-nums">
                          {filteredConstantPool.map((cp) => (
                            <tr key={cp.index} className="hover:bg-[#1B1917] transition-colors">
                              <td className="py-2.5 px-6 text-[#706961]">#{cp.index}</td>
                              <td className="py-2.5 px-4 text-[#C5A880]">{cp.tagName}</td>
                              <td className="py-2.5 px-6 text-[#EAE5DE] break-all">{cp.details}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
