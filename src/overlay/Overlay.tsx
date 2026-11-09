import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import { cx } from "../components/ui";
import { wispr } from "../lib/wispr";
import type { DictationState } from "../lib/wispr";
import { chime, startRecording } from "./recorder";
import type { Recording } from "./recorder";

const BARS = 26;

export default function Overlay() {
  const [state, setState] = useState<DictationState>({ status: "idle", message: "" });
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<Recording | null>(null);
  const soundsRef = useRef(true);
  const barsRef = useRef<HTMLDivElement>(null);
  const demo = new URLSearchParams(location.search).get("demo");

  useEffect(() => {
    if (demo) {
      setState({ status: demo as DictationState["status"], message: demo === "error" ? "Invalid API key. Check Settings → Transcription." : demo === "done" ? "Pasted" : "" });
      return;
    }
    const offs = [
      wispr.onState(setState),
      wispr.onStart(async ({ micDeviceId, sounds, wav }) => {
        soundsRef.current = sounds;
        recRef.current?.cancel();
        try {
          recRef.current = await startRecording(micDeviceId, wav);
          if (sounds) chime("start");
        } catch (err) {
          recRef.current = null;
          const msg = (err as Error)?.name === "NotAllowedError" ? "Microphone access was denied." : "Couldn't access the microphone.";
          if (sounds) chime("error");
          wispr.recorderError(msg);
        }
      }),
      wispr.onStop(async () => {
        const rec = recRef.current;
        recRef.current = null;
        if (!rec) return;
        if (soundsRef.current) chime("stop");
        const result = await rec.stop();
        const r = await wispr.processAudio(result);
        if (!r.ok && !r.cancelled && soundsRef.current) chime("error");
      }),
      wispr.onCancel(() => {
        recRef.current?.cancel();
        recRef.current = null;
      }),
    ];
    return () => offs.forEach((f) => f());
  }, [demo]);

  // Timer + waveform animation while recording.
  useEffect(() => {
    if (state.status !== "recording") return;
    const t0 = performance.now();
    const levels = new Float32Array(BARS);
    const smooth = new Float32Array(BARS);
    let raf = 0;
    const tick = () => {
      setElapsed(performance.now() - t0);
      if (recRef.current) recRef.current.levels(levels);
      else if (demo) for (let i = 0; i < BARS; i++) levels[i] = 0.25 + 0.6 * Math.abs(Math.sin(performance.now() / 260 + i * 0.55));
      const bars = barsRef.current?.children;
      if (bars) {
        for (let i = 0; i < BARS; i++) {
          // Mirror levels outward from the centre for a pleasing shape.
          const src = levels[Math.abs(i - BARS / 2) | 0] ?? 0;
          smooth[i] += (src - smooth[i]) * 0.35;
          const centre = 1 - Math.abs(i - (BARS - 1) / 2) / (BARS / 2);
          const h = 0.14 + Math.min(1, smooth[i] * (0.55 + centre * 0.6));
          (bars[i] as HTMLElement).style.transform = `scaleY(${h.toFixed(3)})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.status, demo]);

  const s = state.status;
  if (s === "idle") return null;

  const mm = Math.floor(elapsed / 60000);
  const ss = Math.floor((elapsed % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  return (
    <div className="flex h-screen items-end justify-center pb-3">
      <div
        onMouseEnter={() => wispr.setOverlayInteractive(true)}
        onMouseLeave={() => wispr.setOverlayInteractive(false)}
        className={cx(
          "animate-scale-in flex h-[52px] items-center gap-2 rounded-full bg-[#121217]/[0.94] pr-2 pl-2 text-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.09)_inset] backdrop-blur-xl transition-[width] duration-300",
          s === "error" && "max-w-[400px] pr-4"
        )}
      >
        {s === "recording" && (
          <>
            <button
              onClick={() => wispr.cancelDictation()}
              aria-label="Cancel"
              className="flex size-9 items-center justify-center rounded-full bg-white/[0.08] text-white/70 transition hover:bg-white/15 hover:text-white"
            >
              <X className="size-4" strokeWidth={2.5} />
            </button>
            <div ref={barsRef} className="mx-1.5 flex h-7 items-center gap-[3px]">
              {Array.from({ length: BARS }).map((_, i) => (
                <span
                  key={i}
                  className="h-full w-[3px] origin-center rounded-full"
                  style={{
                    transform: "scaleY(0.14)",
                    background: `linear-gradient(180deg, #b6a6ff, ${i < BARS / 2 ? "#8b72ff" : "#ff7aa3"})`,
                    transition: "transform 60ms linear",
                  }}
                />
              ))}
            </div>
            <span className="w-9 text-center font-mono text-[12px] text-white/60 tabular-nums">
              {mm}:{ss}
            </span>
            <button
              onClick={() => wispr.toggleDictation()}
              aria-label="Finish"
              className="relative flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#6d4dff] via-[#a24bff] to-[#ff5c8a] shadow-[0_4px_16px_-2px_rgba(162,75,255,0.7)] transition hover:brightness-110"
            >
              <span className="size-3 rounded-[3px] bg-white" />
            </button>
          </>
        )}

        {s === "processing" && (
          <div className="flex items-center gap-3 pr-3 pl-1">
            <span className="relative flex size-9 items-center justify-center">
              <span className="absolute inset-0 animate-spin rounded-full border-2 border-white/10 border-t-[#a996ff]" style={{ animationDuration: "0.9s" }} />
              <span className="size-2 rounded-full bg-gradient-to-br from-[#8b72ff] to-[#ff6b98]" />
            </span>
            <span
              className="text-[13px] font-medium"
              style={{
                background: "linear-gradient(90deg, rgba(255,255,255,0.45), #fff 45%, rgba(255,255,255,0.45) 60%)",
                backgroundSize: "200% 100%",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                animation: "shimmer 1.8s linear infinite",
              }}
            >
              Transcribing…
            </span>
          </div>
        )}

        {s === "done" && (
          <div className="flex items-center gap-2.5 pr-3.5 pl-1">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#3dd68c]/15 text-[#3dd68c]">
              <Check className="size-[18px]" strokeWidth={3} />
            </span>
            <span className="text-[13px] font-medium text-white/90">{state.message || "Done"}</span>
          </div>
        )}

        {s === "error" && (
          <div className="flex min-w-0 items-center gap-2.5 pl-1">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#ff6369]/15 text-[#ff6369]">
              <CircleAlert className="size-[18px]" />
            </span>
            <span className="line-clamp-2 text-[12.5px] leading-snug font-medium text-white/85">{state.message || "Something went wrong."}</span>
          </div>
        )}
      </div>
    </div>
  );
}
