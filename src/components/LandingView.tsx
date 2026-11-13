import React from "react";
import { Upload, ArrowUpRight } from "lucide-react";
import { SAMPLES, SampleClass } from "../samples";

interface LandingViewProps {
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onTriggerUpload: () => void;
  onLoadSample: (sample: SampleClass) => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onTriggerUpload,
  onLoadSample,
}) => {
  return (
    <div className="flex-1 flex flex-col justify-center w-full max-w-3xl mx-auto px-6 py-12">
      {/* Editorial Intro */}
      <div className="mb-8">
        <p className="text-xs font-medium text-[#A69E94] tracking-wide mb-3">
          JVM Bytecode Decompiler · AI Source Reconstruction
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-normal tracking-tight text-[#EAE5DE] leading-[1.18] text-balance max-w-2xl">
          Inspect compiled bytecode with quiet clarity.
        </h1>
        <p className="mt-3 text-[15px] text-[#A69E94] leading-relaxed max-w-xl">
          Parse compiled Java classes locally in the browser to examine constant pools and opcodes, then reconstruct readable source code with compiler notes.
        </p>
      </div>

      {/* Primary Dropzone Surface */}
      <div
        role="button"
        tabIndex={0}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onTriggerUpload}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTriggerUpload();
          }
        }}
        className={`rounded-xl border transition-colors duration-150 cursor-pointer p-10 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A880]/60 ${
          isDragging
            ? "bg-[#1F1C1A] border-[#C5A880]"
            : "bg-[#181614] border-[#2A2623] hover:border-[#3D3732] hover:bg-[#1B1917]"
        }`}
      >
        <div className="border border-dashed border-[#35302B] rounded-lg py-10 px-6 flex flex-col items-center">
          <div className="w-11 h-11 rounded-lg bg-[#201D1A] border border-[#2E2A26] flex items-center justify-center mb-4 text-[#C5A880]">
            <Upload className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium text-[#EAE5DE]">
            Drop compiled <span className="font-mono text-[#C5A880]">.class</span> files here, or click to browse
          </p>
          <p className="mt-2 text-xs text-[#706961]">
            Client-side binary parser · Batch file queue · Standard Java &amp; Forge/NeoForge mods
          </p>
        </div>
      </div>

      {/* Sample Binaries Section */}
      <div className="mt-10 pt-8 border-t border-[#2A2623]">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-medium text-[#EAE5DE]">Sample class files</h2>
          <span className="text-xs text-[#706961]">Load a pre-compiled binary immediately</span>
        </div>

        <div className="divide-y divide-[#25221F] border-y border-[#25221F]">
          {SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => onLoadSample(sample)}
              className="w-full py-3.5 px-2 flex items-center justify-between gap-4 text-left hover:bg-[#181614] transition-colors duration-150 cursor-pointer group"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="font-mono font-medium text-[#EAE5DE] group-hover:text-[#C5A880] transition-colors">
                    {sample.name}
                  </span>
                  <span className="text-[#706961]" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono text-xs text-[#706961] truncate">{sample.className}</span>
                </div>
                <p className="text-xs text-[#A69E94] mt-1 truncate">{sample.description}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#A69E94] group-hover:text-[#C5A880] shrink-0 whitespace-nowrap transition-colors">
                Load sample
                <ArrowUpRight className="w-3.5 h-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
