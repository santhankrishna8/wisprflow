import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Check, X } from "lucide-react";
import { cx } from "../components/ui";
import { wispr } from "../lib/wispr";
import type { DictationState } from "../lib/wispr";

const BAR_HEIGHTS = [0.45, 0.75, 1, 0.7, 0.4];

/**
 * Always-on-top floating button. Click to start/stop dictation, drag to move
 * (it snaps to the nearest screen edge), hover to reveal a hide button.
 */
export default function Bubble() {
  const demo = new URLSearchParams(location.search).get("demo") as DictationState["status"] | null;
  const [state, setState] = useState<DictationState>({ status: demo || "idle", message: "" });
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(!!new URLSearchParams(location.search).get("hover"));
  const pressed = useRef(false);
  const raf = useRef(0);

  useEffect(() => {
    if (demo) return;
    wispr.getState().then(setState);
    return wispr.onState(setState);
  }, [demo]);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pressed.current = true;
    wispr.bubbleDragStart();
  };
  const onPointerMove = () => {
    if (!pressed.current || raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setDragging(true);
      wispr.bubbleDragMove();
    });
  };
  const onPointerUp = async () => {
    if (!pressed.current) return;
    pressed.current = false;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    const { moved } = await wispr.bubbleDragEnd();
    setDragging(false);
    if (!window.wispr && !moved) wispr.toggleDictation(); // browser preview
  };

  const s = state.status;
  const recording = s === "recording";
  const processing = s === "processing";

  return (
    <div
      className="relative flex h-screen w-screen items-center justify-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {recording && (
        <>
          <span className="absolute size-11 rounded-full bg-[#ff5c8a]/45" style={{ animation: "bubble-ring 1.6s ease-out infinite" }} />
          <span className="absolute size-11 rounded-full bg-[#ff5c8a]/30" style={{ animation: "bubble-ring 1.6s ease-out 0.8s infinite" }} />
        </>
      )}

      <button
        aria-label={recording ? "Stop dictation" : "Start dictation"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cx(
          "relative flex size-11 touch-none items-center justify-center rounded-full transition-[transform,background,box-shadow] duration-200",
          dragging ? "scale-110 cursor-grabbing" : "hover:scale-[1.06] active:scale-95",
          recording
            ? "bg-gradient-to-br from-[#ff5c8a] to-[#ff3d6e] shadow-[0_4px_14px_-3px_rgba(255,92,138,0.8)]"
            : s === "error"
              ? "bg-[#2a1618] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,99,105,0.5)_inset]"
              : "bg-[#141419]/95 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.12)_inset]"
        )}
      >
        {/* Gradient rim on hover/idle */}
        {!recording && s !== "error" && (
          <span
            className={cx("pointer-events-none absolute inset-0 rounded-full transition-opacity", hover ? "opacity-100" : "opacity-0")}
            style={{
              padding: 1.5,
              background: "linear-gradient(135deg,#6d4dff,#a24bff,#ff5c8a)",
              WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
            }}
          />
        )}

        {processing ? (
          <span className="relative flex size-6 items-center justify-center">
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-white/15 border-t-[#a996ff]" style={{ animationDuration: "0.8s" }} />
            <span className="size-1.5 rounded-full bg-gradient-to-br from-[#8b72ff] to-[#ff6b98]" />
          </span>
        ) : s === "done" ? (
          <Check className="size-5 text-[#3dd68c]" strokeWidth={3} />
        ) : s === "error" ? (
          <span className="text-[17px] leading-none font-bold text-[#ff6369]">!</span>
        ) : (
          <span className="flex h-5 items-center gap-[2.5px]">
            {BAR_HEIGHTS.map((h, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full"
                style={{
                  height: `${h * 100}%`,
                  background: recording ? "#fff" : hover ? "linear-gradient(180deg,#b6a6ff,#ff7aa3)" : "rgba(255,255,255,0.85)",
                  animation: recording ? `bar ${0.6 + (i % 3) * 0.15}s ease-in-out ${i * 0.08}s infinite` : undefined,
                }}
              />
            ))}
          </span>
        )}
      </button>

      {/* Hide button, revealed on hover while idle */}
      {hover && s === "idle" && !dragging && (
        <button
          aria-label="Hide floating button"
          title="Hide (re-enable in Settings or the tray menu)"
          onClick={() => wispr.hideBubble()}
          className="animate-scale-in absolute top-[7px] right-[7px] flex size-[18px] items-center justify-center rounded-full bg-[#2a2a33] text-white/70 shadow ring-1 ring-white/15 hover:bg-[#3a3a45] hover:text-white"
        >
          <X className="size-2.5" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}
