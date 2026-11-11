import type { HistoryEntry } from "./bridge";

const TYPING_WPM = 40;

export function computeStats(history: HistoryEntry[]) {
  const words = history.reduce((n, h) => n + (h.words || 0), 0);
  const speakingMs = history.reduce((n, h) => n + (h.durationMs || 0), 0);
  const typingMinutes = words / TYPING_WPM;
  const savedMinutes = Math.max(0, typingMinutes - speakingMs / 60000);
  const wpm = speakingMs > 0 ? Math.round(words / (speakingMs / 60000)) : 0;

  // Consecutive days (ending today or yesterday) with at least one dictation.
  const days = new Set(history.map((h) => new Date(h.createdAt).toDateString()));
  let streak = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) {
    streak++;
    d.setDate(d.getDate() - 1);
  }

  // Words per day for the last 14 days (oldest first).
  const spark: number[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const key = day.toDateString();
    spark.push(history.filter((h) => new Date(h.createdAt).toDateString() === key).reduce((n, h) => n + h.words, 0));
  }

  return { words, savedMinutes, wpm, sessions: history.length, streak, spark };
}

export function formatDuration(minutes: number) {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatNumber(n: number) {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
