import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import { cx } from "../components/ui";
import { bridge } from "../lib/bridge";
import type { DictationState } from "../lib/bridge";
import { chime, startRecording } from "./recorder";
import type { Recording } from "./recorder";

const BARS = 26;

export default function Overlay() {
  const [state, setState] = useState<DictationState>({ status: "idle", message: "" });
  const recRef = useRef<Recording | null>(null);
  const startRef = useRef<Promise<Recording | null> | null>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const soundsRef = useRef(true);
  const barsRef = useRef<HTMLDivElement>(null);
  const demo = new URLSearchParams(location.search).get("demo");

  useEffect(() => {
    if (demo) {
      setState({ status: demo as DictationState["status"], message: demo === "error" ? "Invalid API key. Check Settings → Transcription." : demo === "done" ? "Pasted" : "" });
      return;
    }
    const offs = [
      bridge.onState(setState),
      bridge.onStart(async ({ micDeviceId, sounds, wav }) => {
        soundsRef.current = sounds;
        recRef.current?.cancel();
        recRef.current = null;
        const starting = (async () => {
          try {
            const rec = await startRecording(micDeviceId, wav);
            recRef.current = rec;
            if (sounds) chime("start");
            return rec;
          } catch (err) {
            recRef.current = null;
            const msg = (err as Error)?.name === "NotAllowedError" ? "Microphone access was denied." : "Couldn't access the microphone.";
            if (sounds) chime("error");
            bridge.recorderError(msg);
            return null;
          }
        })();
        startRef.current = starting;
        await starting;
      }),
      bridge.onStop(async () => {
        // A fast second press can arrive while the mic is still opening: wait for it.
        const rec = (await startRef.current) ?? recRef.current;
        startRef.current = null;
        recRef.current = null;
        if (!rec) return;
        if (soundsRef.current) chime("stop");
        const result = await rec.stop();
        const r = await bridge.processAudio(result);
        if (!r.ok && !r.cancelled && soundsRef.current) chime("error");
      }),
      bridge.onCancel(async () => {
        const pending = startRef.current;
        startRef.current = null;
        const rec = (await pending) ?? recRef.current;
        rec?.cancel();
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
      if (timeRef.current) {
        const ms = performance.now() - t0;
        timeRef.current.textContent = `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
      }
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

  return (
    <div className="flex h-screen items-end justify-center pb-3">
      <div
        onMouseEnter={() => bridge.setOverlayInteractive(true)}
        onMouseLeave={() => bridge.setOverlayInteractive(false)}
        className={cx(
          "animate-scale-in flex h-[52px] items-center gap-2 rounded-full bg-[#0d2b2f] pr-2 pl-2 text-[#f7f9f8] shadow-[0_14px_34px_-12px_rgba(6,40,44,0.7),0_0_0_1px_rgba(159,214,207,0.14)_inset] transition-[width] duration-300",
          s === "error" && "max-w-[400px] pr-4"
        )}
      >
        {s === "recording" && (
          <>
            <button
              onClick={() => bridge.cancelDictation()}
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
                    background: "#9fd6cf",
                    transition: "transform 60ms linear",
                  }}
                />
              ))}
            </div>
            <span ref={timeRef} className="w-9 text-center font-mono text-[12px] text-white/60 tabular-nums">
              0:00
            </span>
            <button
              onClick={() => bridge.toggleDictation()}
              aria-label="Finish"
              className="relative flex size-9 items-center justify-center rounded-full bg-[#f7f9f8] transition hover:bg-white"
            >
              <span className="size-3 rounded-[3px] bg-[#06525c]" />
            </button>
          </>
        )}

        {s === "processing" && (
          <div className="flex items-center gap-3 pr-3 pl-1">
            <span className="relative flex size-9 items-center justify-center">
              <span className="absolute inset-0 animate-spin rounded-full border-2 border-white/10 border-t-[#9fd6cf]" style={{ animationDuration: "0.9s" }} />
              <span className="size-2 rounded-full bg-[#9fd6cf]" />
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
            <button
              onClick={() => bridge.cancelDictation()}
              aria-label="Cancel"
              className="flex size-7 items-center justify-center rounded-full bg-white/[0.08] text-white/70 transition hover:bg-white/15 hover:text-white"
            >
              <X className="size-3.5" strokeWidth={2.5} />
            </button>
          </div>
        )}

        {s === "done" && (
          <div className="flex items-center gap-2.5 pr-3.5 pl-1">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#9fd6cf]/15 text-[#9fd6cf]">
              <Check className="size-[18px]" strokeWidth={3} />
            </span>
            <span className="text-[13px] font-medium text-white/90">{state.message || "Done"}</span>
          </div>
        )}

        {s === "error" && (
          <div className="flex min-w-0 items-center gap-2.5 pl-1">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#ff8f8a]/15 text-[#ff8f8a]">
              <CircleAlert className="size-[18px]" />
            </span>
            <span className="line-clamp-2 text-[12.5px] leading-snug font-medium text-white/85">{state.message || "Something went wrong."}</span>
          </div>
        )}
      </div>
    </div>
  );
}
