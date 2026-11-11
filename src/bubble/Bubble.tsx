import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "../components/ui";
import { bridge } from "../lib/bridge";
import type { BubbleLayout, DictationState } from "../lib/bridge";

// Line widths (px) that stack into the oval voice mark.
const LINES = [8, 12, 15, 17, 18, 18, 18, 17, 15, 12, 8];

/**
 * Always-on-top pill at the screen edge. Click to start or stop dictation, drag
 * to move it (it snaps to the nearest side). Its close button never removes it:
 * the pill tucks into the edge as a slim tab, and clicking the tab brings it back.
 */
export default function Bubble() {
  const params = new URLSearchParams(location.search);
  const demo = params.get("demo") as DictationState["status"] | null;
  const [state, setState] = useState<DictationState>({ status: demo || "idle", message: "" });
  const [layout, setLayout] = useState<BubbleLayout>({
    side: (params.get("side") as BubbleLayout["side"]) || "right",
    collapsed: params.has("collapsed"),
  });
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(params.has("hover"));
  const pressed = useRef(false);
  const raf = useRef(0);

  useEffect(() => {
    if (demo) return;
    bridge.getState().then(setState);
    bridge.getBubbleLayout().then(setLayout);
    const offs = [bridge.onState(setState), bridge.onBubbleLayout(setLayout)];
    return () => offs.forEach((f) => f());
  }, [demo]);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pressed.current = true;
    bridge.bubbleDragStart();
  };
  const onPointerMove = () => {
    if (!pressed.current || raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setDragging(true);
      bridge.bubbleDragMove();
    });
  };
  const onPointerUp = async () => {
    if (!pressed.current) return;
    pressed.current = false;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    const { moved } = await bridge.bubbleDragEnd();
    setDragging(false);
    if (!window.saytype && !moved) bridge.toggleDictation(); // browser preview
  };

  const s = state.status;
  const recording = s === "recording";
  const processing = s === "processing";
  const right = layout.side === "right";

  if (layout.collapsed) {
    return (
      <button
        aria-label="Show the SayType pill"
        title="Show the SayType pill"
        onClick={() => bridge.setBubbleCollapsed(false)}
        className={cx("group flex h-screen w-screen items-center", right ? "justify-end" : "justify-start")}
      >
        <span
          className={cx(
            "h-16 w-[7px] transition-[width,background] duration-150 group-hover:w-[11px]",
            right ? "rounded-l-full" : "rounded-r-full",
            recording ? "bg-[#9fd6cf]" : "bg-[#0d2b2f] shadow-[0_0_0_1px_rgba(159,214,207,0.45)_inset]",
            recording && "animate-pulse"
          )}
        />
      </button>
    );
  }

  const Tuck = right ? ChevronRight : ChevronLeft;
  return (
    <div
      className="relative flex h-screen w-screen flex-col items-center justify-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Tuck the pill into the edge. Revealed on hover while idle. */}
      <button
        aria-label="Tuck into the screen edge"
        title="Tuck into the edge (click the tab to bring it back)"
        onClick={() => bridge.setBubbleCollapsed(true)}
        tabIndex={hover ? 0 : -1}
        className={cx(
          "absolute top-0.5 flex size-5 items-center justify-center rounded-full bg-[#0d2b2f] text-[#f7f9f8]/75 shadow ring-1 ring-[#9fd6cf]/30 transition-opacity hover:text-white",
          hover && s === "idle" && !dragging ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <Tuck className="size-3" strokeWidth={3} />
      </button>

      <button
        aria-label={recording ? "Stop dictation" : "Start dictation"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cx(
          "relative flex h-[104px] w-[34px] touch-none items-center justify-center rounded-full bg-[#0d2b2f] transition-[transform,box-shadow] duration-200",
          dragging ? "scale-105 cursor-grabbing" : "hover:scale-[1.04] active:scale-95",
          s === "error"
            ? "shadow-[0_6px_16px_-6px_rgba(6,40,44,0.8),0_0_0_1.5px_rgba(255,143,138,0.7)_inset]"
            : recording
              ? "shadow-[0_6px_18px_-6px_rgba(6,40,44,0.9),0_0_0_1.5px_rgba(159,214,207,0.8)_inset]"
              : "shadow-[0_6px_16px_-6px_rgba(6,40,44,0.8),0_0_0_1px_rgba(159,214,207,0.22)_inset]"
        )}
      >
        {processing ? (
          <span className="size-5 animate-spin rounded-full border-2 border-white/15 border-t-[#9fd6cf]" style={{ animationDuration: "0.8s" }} />
        ) : s === "done" ? (
          <Check className="size-5 text-[#9fd6cf]" strokeWidth={3} />
        ) : s === "error" ? (
          <span className="text-[17px] leading-none font-bold text-[#ff8f8a]">!</span>
        ) : (
          <span className="flex flex-col items-center gap-[3px]">
            {LINES.map((w, i) => (
              <span
                key={i}
                className="h-[2px] rounded-full"
                style={{
                  width: w,
                  background: recording ? "#9fd6cf" : hover ? "#f7f9f8" : "rgba(247,249,248,0.8)",
                  animation: recording ? `pill-line ${0.7 + (i % 4) * 0.14}s ease-in-out ${i * 0.07}s infinite` : undefined,
                }}
              />
            ))}
          </span>
        )}
      </button>
    </div>
  );
}
