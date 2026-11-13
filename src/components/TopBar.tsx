import React, { useState } from "react";
import { Upload } from "lucide-react";
import appIcon from "../assets/images/jadai_emblem_icon_1794568067146.jpg";

interface TopBarProps {
  onOpenSecretAudit: () => void;
  onTriggerUpload: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenSecretAudit,
  onTriggerUpload,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <header className="h-14 border-b border-[#2A2623] bg-[#141210]/95 backdrop-blur-sm sticky top-0 z-40 shrink-0">
      <div className="h-full max-w-[1600px] mx-auto px-6 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={onOpenSecretAudit}
          className="inline-flex items-center gap-3 font-display text-xl font-medium tracking-tight text-[#EAE5DE] hover:text-[#C5A880] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A880]/60 rounded"
        >
          {!imgFailed ? (
            <img
              src={appIcon}
              alt="JadAI"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-8 h-8 rounded-lg object-cover border border-[#2E2A26]"
            />
          ) : (
            <span className="w-8 h-8 rounded-lg bg-[#1F1C1A] border border-[#2E2A26] inline-flex items-center justify-center font-mono text-xs text-[#C5A880]">
              J
            </span>
          )}
          <span>JadAI</span>
        </button>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onTriggerUpload}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C5A880] hover:bg-[#D2B894] text-[#11100F] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A880]/70"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Open .class</span>
          </button>
        </div>
      </div>
    </header>
  );
};
