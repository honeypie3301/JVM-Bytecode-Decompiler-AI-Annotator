import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CPInfo, Instruction } from "../classParser";

const CODE_LINE_HEIGHT = 22;
const CODE_OVERSCAN = 30;

function useVirtualWindow(totalCount: number, rowHeight: number, overscan: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (el.clientHeight > 0) {
        setViewportHeight(el.clientHeight);
      }
    };
    updateHeight();

    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [totalCount]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(top);
    });
  }, []);

  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(totalCount, Math.floor(scrollTop / rowHeight) + visibleCount + overscan);

  return {
    containerRef,
    handleScroll,
    startIndex,
    endIndex,
    totalHeight: totalCount * rowHeight,
    offsetY: startIndex * rowHeight,
  };
}

export const VirtualCodeViewer: React.FC<{ lines: string[] }> = memo(({ lines }) => {
  const { containerRef, handleScroll, startIndex, endIndex, totalHeight, offsetY } =
    useVirtualWindow(lines.length, CODE_LINE_HEIGHT, CODE_OVERSCAN);

  const gutterDigits = useMemo(() => Math.max(2, String(lines.length).length), [lines.length]);
  const maxCols = useMemo(() => {
    let max = 60;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > max) max = lines[i].length;
    }
    return max;
  }, [lines]);

  const visibleSlice = useMemo(() => lines.slice(startIndex, endIndex), [lines, startIndex, endIndex]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-auto py-3 px-3 font-mono text-[13px] text-[#EAE5DE] select-text contain-strict"
      style={{ contain: "strict" }}
    >
      <div
        className="relative"
        style={{
          height: `${totalHeight}px`,
          minWidth: `calc(${maxCols + gutterDigits + 6}ch)`,
        }}
      >
        <div
          className="absolute left-0 right-0 top-0"
          style={{ transform: `translate3d(0, ${offsetY}px, 0)` }}
        >
          {visibleSlice.map((line, idx) => {
            const lineNum = startIndex + idx + 1;
            return (
              <div
                key={lineNum}
                className="flex items-start hover:bg-[#1A1815] h-[22px] leading-[22px]"
              >
                <span
                  className="shrink-0 pr-4 text-right select-none text-[#57514B] text-xs leading-[22px] tabular-nums"
                  style={{ width: `${gutterDigits + 2}ch` }}
                >
                  {lineNum}
                </span>
                <span className="whitespace-pre pr-6 leading-[22px]">{line || " "}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

VirtualCodeViewer.displayName = "VirtualCodeViewer";

const BYTECODE_ROW_HEIGHT = 24;
const BYTECODE_OVERSCAN = 25;

export const VirtualBytecodeViewer: React.FC<{ instructions: Instruction[] }> = memo(
  ({ instructions }) => {
    const { containerRef, handleScroll, startIndex, endIndex, totalHeight, offsetY } =
      useVirtualWindow(instructions.length, BYTECODE_ROW_HEIGHT, BYTECODE_OVERSCAN);

    const visibleSlice = useMemo(
      () => instructions.slice(startIndex, endIndex),
      [instructions, startIndex, endIndex]
    );

    return (
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto py-3 px-4 font-mono text-[13px] select-text"
        style={{ contain: "strict" }}
      >
        <div className="relative min-w-max" style={{ height: `${totalHeight}px` }}>
          <div
            className="absolute left-0 right-0 top-0"
            style={{ transform: `translate3d(0, ${offsetY}px, 0)` }}
          >
            {visibleSlice.map((inst, idx) => (
              <div
                key={startIndex + idx}
                className="flex items-center hover:bg-[#181614] rounded px-2 h-[24px] leading-[24px]"
              >
                <span className="w-16 shrink-0 text-[#57514B] text-xs tabular-nums select-none">
                  {inst.offset.toString().padStart(4, "0")}:
                </span>
                <span className="w-40 shrink-0 text-[#C5A880] font-medium truncate">
                  {inst.mnemonic}
                </span>
                <span className="text-[#C4BCB3] whitespace-pre pr-4">
                  {inst.details || (inst.operands.length > 0 ? inst.operands.join(", ") : "")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

VirtualBytecodeViewer.displayName = "VirtualBytecodeViewer";

const CP_ROW_HEIGHT = 38;
const CP_OVERSCAN = 20;

export const VirtualConstantPoolViewer: React.FC<{ entries: CPInfo[] }> = memo(({ entries }) => {
  const { containerRef, handleScroll, startIndex, endIndex, totalHeight, offsetY } =
    useVirtualWindow(entries.length, CP_ROW_HEIGHT, CP_OVERSCAN);

  const visibleSlice = useMemo(() => entries.slice(startIndex, endIndex), [entries, startIndex, endIndex]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-auto"
      style={{ contain: "strict" }}
    >
      <div className="sticky top-0 z-10 bg-[#141210] border-b border-[#24211E] flex items-center text-xs text-[#706961] font-medium h-9 px-6">
        <span className="w-20 shrink-0">Index</span>
        <span className="w-44 shrink-0">Tag</span>
        <span className="flex-1 min-w-0">Value / Reference</span>
      </div>
      <div className="relative min-w-full" style={{ height: `${totalHeight}px` }}>
        <div
          className="absolute left-0 right-0 top-0 divide-y divide-[#1E1B18]"
          style={{ transform: `translate3d(0, ${offsetY}px, 0)` }}
        >
          {visibleSlice.map((cp) => (
            <div
              key={cp.index}
              className="flex items-center px-6 h-[38px] hover:bg-[#161412] font-mono text-xs"
            >
              <span className="w-20 shrink-0 text-[#706961] tabular-nums">#{cp.index}</span>
              <span className="w-44 shrink-0 text-[#C5A880] truncate">{cp.tagName}</span>
              <span className="flex-1 min-w-0 text-[#C4BCB3] truncate" title={cp.details}>
                {cp.details}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

VirtualConstantPoolViewer.displayName = "VirtualConstantPoolViewer";
