import React, { useState } from "react";
import { X, ShieldAlert, FileCode } from "lucide-react";
import { AuditLogItem } from "../types";

interface AuditModalProps {
  isOpen: boolean;
  logs: AuditLogItem[];
  formatSize: (bytes: number) => string;
  onClose: () => void;
}

export const AuditModal: React.FC<AuditModalProps> = ({
  isOpen,
  logs,
  formatSize,
  onClose,
}) => {
  const [filter, setFilter] = useState<"all" | "flagged">("all");

  if (!isOpen) return null;

  const flaggedCount = logs.filter((l) => l.flagged).length;
  const visibleLogs = filter === "flagged" ? logs.filter((l) => l.flagged) : logs;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
    >
      <div className="bg-[#181614] border border-[#2A2623] rounded-xl w-full max-w-3xl max-h-[82vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2A2623] flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 id="audit-modal-title" className="font-display text-lg font-normal text-[#EAE5DE]">
              Telemetry &amp; Audit Log
            </h2>
            <p className="text-xs text-[#A69E94] mt-0.5 tabular-nums">
              {logs.length} recorded events · {flaggedCount} flagged
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Segmented filter */}
            <div className="flex items-center p-0.5 bg-[#121110] border border-[#2A2623] rounded-lg">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  filter === "all"
                    ? "bg-[#24211E] text-[#EAE5DE]"
                    : "text-[#A69E94] hover:text-[#EAE5DE]"
                }`}
              >
                All Events
              </button>
              <button
                type="button"
                onClick={() => setFilter("flagged")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  filter === "flagged"
                    ? "bg-[#24211E] text-[#EAE5DE]"
                    : "text-[#A69E94] hover:text-[#EAE5DE]"
                }`}
              >
                Flagged
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close audit log"
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[#A69E94] hover:text-[#EAE5DE] hover:bg-[#24211E] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#24211E]">
          {visibleLogs.length === 0 ? (
            <div className="py-16 px-6 text-center text-sm text-[#706961]">
              No matching telemetry events recorded.
            </div>
          ) : (
            visibleLogs.map((log) => (
              <div
                key={log.id}
                className={`px-6 py-3.5 flex items-start justify-between gap-4 ${
                  log.flagged ? "bg-[#261818]/60" : ""
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    {log.flagged ? (
                      <ShieldAlert className="w-4 h-4 text-[#C76E6E]" />
                    ) : (
                      <FileCode className="w-4 h-4 text-[#706961]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span
                        className={`font-mono font-medium truncate ${
                          log.flagged ? "text-[#E6A3A3]" : "text-[#EAE5DE]"
                        }`}
                      >
                        {log.fileName}
                      </span>
                      <span className="text-[#706961]" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          log.flagged ? "text-[#C76E6E]" : "text-[#7EA287]"
                        }`}
                      >
                        {log.flagged ? "Blocked" : "Cleared"}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-[#A69E94] mt-1 truncate">
                      {log.className} · <span className="tabular-nums">{formatSize(log.fileSize)}</span> ·{" "}
                      <span className="tabular-nums">{log.ipPlaceholder}</span>
                    </p>
                    {log.reason && (
                      <p
                        className={`text-xs mt-1.5 ${
                          log.flagged ? "text-[#D99B9B]" : "text-[#706961]"
                        }`}
                      >
                        {log.reason}
                      </p>
                    )}
                  </div>
                </div>
                <span className="font-mono text-xs text-[#706961] tabular-nums shrink-0">
                  {log.timestamp}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#2A2623] bg-[#141210] flex items-center justify-between shrink-0">
          <span className="text-xs text-[#706961]">Global Firestore telemetry stream</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#24211E] hover:bg-[#2E2A26] text-xs font-medium text-[#EAE5DE] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
