import { useMemo } from "react";
import { ArrowRight, Clock, Flame, Gauge, Mic, Square, Type } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, Hotkey, SectionTitle, cx, EmptyState } from "../components/ui";
import { TranscriptRow } from "../components/Transcript";
import { computeStats, formatDuration, formatNumber } from "../lib/stats";
import { wispr } from "../lib/wispr";
import type { DictationState, HistoryEntry, Settings } from "../lib/wispr";
import type { Route } from "../App";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Home({
  settings,
  history,
  state,
  onNavigate,
}: {
  settings: Settings;
  history: HistoryEntry[];
  state: DictationState;
  onNavigate: (r: Route) => void;
}) {
  const stats = useMemo(() => computeStats(history), [history]);
  const recent = history.slice(0, 4);
  const needsKey = !settings.hasKey?.[settings.sttProvider] && settings.sttProvider !== "custom";

  return (
    <div className="mx-auto max-w-[920px] px-10 pt-14 pb-12">
      <header className="mb-7">
        <p className="text-[12.5px] font-medium text-fg-3">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">{greeting()}</h1>
      </header>

      {needsKey && (
        <button
          onClick={() => onNavigate("settings")}
          className="mb-5 flex w-full items-center justify-between rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-left text-[13px]"
        >
          <span>
            <span className="font-semibold text-fg">Add an API key to start dictating.</span>{" "}
            <span className="text-fg-2">Transcription needs a provider key.</span>
          </span>
          <ArrowRight className="size-4 text-fg-2" />
        </button>
      )}

      <Hero state={state} hotkey={settings.hotkey} />

      {/* Stats */}
      <div className="mt-5 grid grid-cols-4 gap-3">
        <Stat icon={<Type className="size-4" />} label="Words dictated" value={formatNumber(stats.words)}>
          <Sparkline data={stats.spark} />
        </Stat>
        <Stat icon={<Clock className="size-4" />} label="Time saved" value={formatDuration(stats.savedMinutes)} hint="vs. typing at 40 wpm" />
        <Stat icon={<Gauge className="size-4" />} label="Speaking pace" value={stats.wpm ? `${stats.wpm}` : "—"} unit={stats.wpm ? "wpm" : ""} hint={stats.wpm > 40 ? `${(stats.wpm / 40).toFixed(1)}× faster than typing` : "Words per minute"} />
        <Stat icon={<Flame className="size-4" />} label="Day streak" value={`${stats.streak}`} unit={stats.streak === 1 ? "day" : "days"} hint={`${stats.sessions} sessions total`} />
      </div>

      {/* Recent */}
      <div className="mt-9">
        <SectionTitle
          title="Recent"
          description="Your latest dictations. Hover to copy."
          action={
            history.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => onNavigate("history")}>
                View all <ArrowRight className="size-3.5" />
              </Button>
            )
          }
        />
        <Card className="overflow-hidden">
          {recent.length ? (
            recent.map((h) => <TranscriptRow key={h.id} entry={h} compact />)
          ) : (
            <EmptyState
              icon={<Mic className="size-6" />}
              title="Nothing here yet"
              description="Put your cursor in any text field, press your shortcut, and start talking. Your words land right where you're typing."
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function Hero({ state, hotkey }: { state: DictationState; hotkey: string }) {
  const recording = state.status === "recording";
  const processing = state.status === "processing";
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-[#121218] p-8 text-white shadow-lg ring-1 ring-black/5 dark:ring-white/10">
      {/* Mesh glow */}
      <div className="pointer-events-none absolute -top-24 -right-16 size-[340px] rounded-full bg-[#6d4dff] opacity-45 blur-[90px]" />
      <div className="pointer-events-none absolute -bottom-32 right-40 size-[280px] rounded-full bg-[#ff5c8a] opacity-30 blur-[90px]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          maskImage: "linear-gradient(90deg, transparent, black 60%)",
        }}
      />
      <div className="relative flex items-center justify-between gap-8">
        <div className="max-w-[440px]">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-medium text-white/80 ring-1 ring-inset ring-white/10">
            <span className="size-1.5 rounded-full bg-[#3dd68c]" />
            Works in every app
          </div>
          <h2 className="text-[24px] leading-tight font-semibold tracking-[-0.02em]">
            Speak naturally.
            <br />
            <span className="text-white/55">We'll handle the typing.</span>
          </h2>
          <div className="mt-6 flex items-center gap-3 text-[13px] text-white/60">
            <Hotkey accel={hotkey} tone="inverse" />
            <span>to start and stop · <span className="text-white/80">Esc</span> to cancel</span>
          </div>
        </div>

        <button
          onClick={() => wispr.toggleDictation()}
          disabled={processing}
          aria-label={recording ? "Stop dictation" : "Start dictation"}
          className="group relative mr-4 flex size-[104px] shrink-0 items-center justify-center"
        >
          {recording && (
            <>
              <span className="absolute inset-0 rounded-full bg-[#ff5c8a]/40" style={{ animation: "pulse-ring 1.6s ease-out infinite" }} />
              <span className="absolute inset-0 rounded-full bg-[#ff5c8a]/30" style={{ animation: "pulse-ring 1.6s ease-out 0.8s infinite" }} />
            </>
          )}
          <span className="absolute inset-0 rounded-full bg-white/[0.06] ring-1 ring-white/15 transition group-hover:bg-white/[0.1]" />
          <span
            className={cx(
              "relative flex size-[72px] items-center justify-center rounded-full shadow-[0_10px_40px_-8px_rgba(139,114,255,0.8)] transition-transform duration-200 group-hover:scale-105 group-active:scale-95",
              recording ? "bg-[#ff5c8a] shadow-[0_10px_40px_-8px_rgba(255,92,138,0.9)]" : "brand-gradient"
            )}
          >
            {processing ? (
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-4 w-1 rounded-full bg-white" style={{ animation: `bar 0.9s ease-in-out ${i * 0.15}s infinite` }} />
                ))}
              </span>
            ) : recording ? (
              <Square className="size-6 fill-white text-white" />
            ) : (
              <Mic className="size-7 text-white" strokeWidth={2.2} />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  unit,
  hint,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="flex items-center gap-2 text-[12px] font-medium text-fg-3">
        <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft text-accent-text">{icon}</span>
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-[24px] font-semibold tracking-[-0.02em] tabular-nums">{value}</span>
        {unit && <span className="text-[12.5px] font-medium text-fg-3">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 truncate text-[11.5px] text-fg-3">{hint}</div>}
      {children}
    </Card>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  return (
    <div className="mt-2 flex h-6 items-end gap-[3px]" aria-label="Words per day, last 14 days">
      {data.map((v, i) => (
        <span
          key={i}
          title={`${v} words`}
          className={cx("flex-1 rounded-[2px]", v ? "bg-accent" : "bg-surface-3")}
          style={{ height: `${Math.max(12, (v / max) * 100)}%`, opacity: v ? 0.35 + 0.65 * (v / max) : 1 }}
        />
      ))}
    </div>
  );
}
