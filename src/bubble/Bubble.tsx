import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { Check } from "lucide-react";
import { cx } from "../components/ui";
import { bridge } from "../lib/bridge";
import type { BubbleLayout, DictationState } from "../lib/bridge";

// Line widths (px) that stack into the oval voice mark.
const LINES = [8, 12, 15, 17, 18, 18, 18, 17, 15, 12, 8];

// How long the open pill waits, untouched, before shrinking back to the handle.
const TUCK_AFTER_MS = 4000;
const TUCK_AFTER_DONE_MS = 900;

const MORPH = "cubic-bezier(0.3, 1.35, 0.5, 1)"; // a soft overshoot as the pill settles

/**
 * Always-on-top dictation control at the screen edge.
 *
 * It rests as a slim handle. One click starts listening and the handle grows
 * into a pill; click the pill to finish. When the dictation is done the pill
 * shrinks back into the handle. Drag either one to move it (it snaps to the
 * nearest side). It is a single element that changes size, so the change is
 * one continuous motion.
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
  const interactive = useRef(false);
  const raf = useRef(0);

  useEffect(() => {
    if (demo) return;
    bridge.getState().then(setState);
    bridge.getBubbleLayout().then(setLayout);
    const offs = [bridge.onState(setState), bridge.onBubbleLayout(setLayout)];
    return () => offs.forEach((f) => f());
  }, [demo]);

  // While only the handle shows, the rest of the window lets clicks through.
  // Tell the main process when the pointer is on the handle so it can take them.
  const setInteractive = (on: boolean) => {
    if (interactive.current === on) return;
    interactive.current = on;
    bridge.setBubbleInteractive(on);
  };
  const onEnter = () => {
    setHover(true);
    setInteractive(true);
  };
  const onLeave = () => {
    setHover(false);
    if (!pressed.current) setInteractive(false);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pressed.current = true;
    bridge.bubbleDragStart();
  };
  const onPointerMove = () => {
    setInteractive(true);
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
    const { moved } = await bridge.bubbleDragEnd(); // a press without movement starts or stops dictation
    setDragging(false);
    if (!window.saytype && !moved) {
      // Browser preview: mimic the main process.
      if (layout.collapsed) bridge.setBubbleCollapsed(false);
      bridge.toggleDictation();
    }
  };

  // Shrink back to the handle when nothing is happening.
  const used = useRef(false); // a dictation ran while the pill was open
  useEffect(() => {
    if (demo || layout.collapsed) {
      used.current = false;
      return;
    }
    if (state.status !== "idle") {
      used.current = true;
      return;
    }
    if ((hover && !used.current) || dragging) return;
    const t = setTimeout(() => bridge.setBubbleCollapsed(true), used.current ? TUCK_AFTER_DONE_MS : TUCK_AFTER_MS);
    return () => clearTimeout(t);
  }, [demo, layout.collapsed, state.status, hover, dragging]);

  const s = state.status;
  const recording = s === "recording";
  const processing = s === "processing";
  const open = !layout.collapsed;
  const right = layout.side === "right";

  // Size and placement of the one element, as handle or as pill.
  const box: CSSProperties = open
    ? { width: 34, height: 104, [right ? "right" : "left"]: 9 }
    : { width: hover ? 8 : 6, height: hover ? 56 : 46, [right ? "right" : "left"]: 4 };

  return (
    <main className="relative h-screen w-screen">
      <button
        aria-label={recording ? "Stop dictation" : processing ? "Cancel transcription" : "Start dictation"}
        title={open ? undefined : "Click to dictate, drag to move"}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          ...box,
          top: "50%",
          transform: `translateY(-50%) scale(${dragging ? 1.05 : 1})`,
          transition: `width 420ms ${MORPH}, height 420ms ${MORPH}, left 420ms ${MORPH}, right 420ms ${MORPH}, background-color 260ms ease, box-shadow 260ms ease, transform 160ms ease`,
          animation: !open && recording ? "handle-glow 1.4s ease-in-out infinite" : undefined,
        }}
        className={cx(
          "absolute flex touch-none items-center justify-center overflow-hidden rounded-full",
          dragging && "cursor-grabbing",
          open
            ? cx(
                "bg-[#0d2b2f]",
                s === "error"
                  ? "shadow-[0_8px_20px_-8px_rgba(0,0,0,0.7),0_0_0_1.5px_rgba(255,143,138,0.75)_inset]"
                  : recording
                    ? "shadow-[0_8px_22px_-8px_rgba(0,0,0,0.75),0_0_0_1.5px_rgba(159,214,207,0.85)_inset]"
                    : "shadow-[0_8px_20px_-8px_rgba(0,0,0,0.7),0_0_0_1px_rgba(159,214,207,0.25)_inset]"
              )
            : recording
              ? "bg-[#9fd6cf]"
              : cx(
                  "shadow-[0_0_0_1px_rgba(255,255,255,0.42)_inset,0_1px_5px_rgba(0,0,0,0.45)]",
                  hover ? "bg-[#2b2e31]" : "bg-[#1b1d1f]/90"
                )
        )}
      >
        {/* The pill's face. It fades and scales in a beat after the shape starts growing. */}
        <span
          aria-hidden={!open}
          className="flex items-center justify-center"
          style={{
            opacity: open ? 1 : 0,
            transform: open ? "scale(1)" : "scale(0.4)",
            transition: open ? `opacity 220ms ease 120ms, transform 380ms ${MORPH} 100ms` : "opacity 90ms ease, transform 120ms ease",
          }}
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
                    background: recording ? "#9fd6cf" : "rgba(247,249,248,0.85)",
                    animation: recording ? `pill-line ${0.7 + (i % 4) * 0.14}s ease-in-out ${i * 0.07}s infinite` : undefined,
                  }}
                />
              ))}
            </span>
          )}
        </span>
      </button>
    </main>
  );
}
