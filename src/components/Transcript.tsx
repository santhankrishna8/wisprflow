import { useState } from "react";
import { Check, Copy, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Badge, IconButton, cx, useToast } from "./ui";
import { timeLabel } from "../lib/stats";
import { bridge } from "../lib/bridge";
import type { HistoryEntry } from "../lib/bridge";

export function TranscriptRow({ entry, onDelete, compact }: { entry: HistoryEntry; onDelete?: (id: string) => void; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const toast = useToast();
  const text = showRaw ? entry.raw : entry.text;

  const copy = async () => {
    await bridge.copy(text);
    setCopied(true);
    toast("Copied to clipboard", "success");
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="group relative flex gap-4 px-5 py-4 transition-colors hover:bg-surface-2/60 [&+&]:border-t [&+&]:border-line">
      <div className="w-16 shrink-0 pt-0.5 text-[12px] font-medium text-fg-3 tabular-nums">{timeLabel(entry.createdAt)}</div>
      <div className="min-w-0 flex-1">
        <p
          data-selectable
          className={cx(
            "text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg",
            compact && "line-clamp-2",
            showRaw && "text-fg-2 italic"
          )}
        >
          {text}
        </p>
        {!compact && (
          <div className="mt-2 flex items-center gap-2 text-[11.5px] text-fg-3">
            <span className="tabular-nums">{entry.words} words</span>
            <span className="size-0.5 rounded-full bg-fg-3" />
            <span className="tabular-nums">{(entry.durationMs / 1000).toFixed(1)}s spoken</span>
            {entry.cleaned && !showRaw && (
              <Badge tone="accent">
                <Sparkles className="size-3" /> Polished
              </Badge>
            )}
            {showRaw && <Badge>Original</Badge>}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {entry.cleaned && !compact && (
          <IconButton label={showRaw ? "Show polished" : "Show original"} onClick={() => setShowRaw((s) => !s)}>
            {showRaw ? <Sparkles className="size-4" /> : <Undo2 className="size-4" />}
          </IconButton>
        )}
        <IconButton label="Copy" onClick={copy}>
          {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        </IconButton>
        {onDelete && (
          <IconButton label="Delete" onClick={() => onDelete(entry.id)} className="hover:text-danger">
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>
    </div>
  );
}
