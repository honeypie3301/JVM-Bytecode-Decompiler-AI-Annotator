import React from "react";
import { X, ArrowUpRight } from "lucide-react";
import { SAMPLES, SampleClass } from "../samples";

interface SamplesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadSample: (sample: SampleClass) => void;
}

export const SamplesModal: React.FC<SamplesModalProps> = ({
  isOpen,
  onClose,
  onLoadSample,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="samples-modal-title"
    >
      <div className="bg-[#181614] border border-[#2A2623] rounded-xl w-full max-w-xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-[#2A2623] flex items-center justify-between">
          <div>
            <h2 id="samples-modal-title" className="font-display text-lg font-normal text-[#EAE5DE]">
              Sample Class Library
            </h2>
            <p className="text-xs text-[#A69E94] mt-0.5">
              Pre-compiled JVM binaries ready for inspection and AI annotation
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sample library"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#A69E94] hover:text-[#EAE5DE] hover:bg-[#24211E] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="divide-y divide-[#25221F]">
          {SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => {
                onLoadSample(sample);
                onClose();
              }}
              className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-[#1F1C1A] transition-colors cursor-pointer group"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono font-medium text-[#EAE5DE] group-hover:text-[#C5A880] transition-colors">
                    {sample.name}
                  </span>
                  <span className="text-[#706961]" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono text-xs text-[#706961] truncate">{sample.className}</span>
                </div>
                <p className="text-xs text-[#A69E94] mt-1">{sample.description}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#C5A880] shrink-0 whitespace-nowrap">
                Load
                <ArrowUpRight className="w-3.5 h-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
