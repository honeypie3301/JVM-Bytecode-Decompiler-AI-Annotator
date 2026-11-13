import React from "react";
import { Lock } from "lucide-react";
import { AuditLogItem } from "../types";

interface ThreatModalProps {
  threat: AuditLogItem | null;
  onDismiss: () => void;
}

export const ThreatModal: React.FC<ThreatModalProps> = ({ threat, onDismiss }) => {
  if (!threat) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="threat-modal-title"
    >
      <div className="bg-[#181414] border border-[#5A3232] rounded-xl w-full max-w-lg p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#2A1B1B] border border-[#5A3232] flex items-center justify-center text-[#C76E6E] shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-[#C76E6E]">Protected Artifact Detected</p>
            <h2 id="threat-modal-title" className="font-display text-lg font-normal text-[#EAE5DE]">
              Decompilation Restricted
            </h2>
          </div>
        </div>

        <p className="text-sm text-[#A69E94] leading-relaxed">
          The file <span className="font-mono text-[#EAE5DE]">{threat.fileName}</span> matches the protected
          package signature <span className="font-mono text-[#D99B9B]">net.mcreator.thebackwoods</span>. Source
          reconstruction for this mod is disabled and this attempt has been logged.
        </p>

        <div className="mt-5 pt-4 border-t border-[#2E2323] flex items-center justify-between text-xs font-mono text-[#706961] tabular-nums">
          <span>Status: Blocked</span>
          <span>Event {threat.id}</span>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2 rounded-lg bg-[#2A1B1B] hover:bg-[#382323] border border-[#5A3232] text-xs font-medium text-[#EAE5DE] transition-colors cursor-pointer"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
};
