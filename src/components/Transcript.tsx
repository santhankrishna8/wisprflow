import { useEffect, useState } from "react";
import { Check, Cloud, Copy, Pencil, RefreshCw, ShieldCheck, Sparkles, Trash2, Undo2, Wand2 } from "lucide-react";
import { Badge, Button, IconButton, Select, Textarea, cx, useToast } from "./ui";
import { timeLabel } from "../lib/stats";
import { bridge } from "../lib/bridge";
import type { HistoryEntry, LocalModel, Receipt, Suggestion } from "../lib/bridge";

const PROVIDER: Record<string, string> = { openai: "OpenAI", groq: "Groq", anthropic: "Anthropic", custom: "your server", local: "this PC" };

/** Plain-words account of what happened to a dictation, built from the stored receipt. */
function receiptLines(r: Receipt): string[] {
  const lines = [
    r.stt.provider === "local"
      ? `Heard by Whisper (${r.stt.model}) on this PC`
      : `Heard by ${r.stt.model} — ${r.stt.leavesDevice ? `audio sent to ${PROVIDER[r.stt.provider] ?? r.stt.provider}` : "your own server"}`,
  ];
  if (r.snippet) lines.push(`Inserted your “${r.snippet}” snippet`);
  else if (r.cleanup) lines.push(`Polished by ${r.cleanup.model} — ${r.cleanup.leavesDevice ? `text sent to ${PROVIDER[r.cleanup.provider] ?? r.cleanup.provider}` : "your own server"}`);
  else lines.push("No AI polish: text is exactly what was heard");
  lines.push(r.output === "pasted" ? "Pasted at your cursor" : "Copied to the clipboard");
  return lines;
}

export function TranscriptRow({ entry, onDelete, compact }: { entry: HistoryEntry; onDelete?: (id: string) => void; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [rerun, setRerun] = useState(false);
  const [running, setRunning] = useState(false);
  const [models, setModels] = useState<LocalModel[]>([]);
  const [model, setModel] = useState("");
  const toast = useToast();
  const isEdit = entry.kind === "edit";
  const text = showRaw ? entry.raw : entry.text;

  useEffect(() => {
    if (!rerun) return;
    bridge.localModels().then((list) => {
      const have = list.filter((m) => m.downloaded);
      setModels(have);
      setModel((cur) => cur || have[0]?.id || "");
    });
  }, [rerun]);

  const copy = async (t = text) => {
    await bridge.copy(t);
    setCopied(true);
    toast("Copied to clipboard", "success");
    setTimeout(() => setCopied(false), 1400);
  };

  const saveEdit = async () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === entry.text) return;
    const r = await bridge.editHistory(entry.id, next);
    setSuggestions(r.suggestions);
    toast("Saved your correction", "success");
  };

  const learn = async (s: Suggestion) => {
    const list = await bridge.getDictionary();
    if (!list.some((d) => d.word.toLowerCase() === s.word.toLowerCase())) {
      await bridge.setDictionary([{ id: crypto.randomUUID(), word: s.word, to: s.to }, ...list]);
    }
    setSuggestions((cur) => cur.filter((x) => x.word !== s.word));
    toast(`Will write “${s.to}” from now on`, "success");
  };

  const runAgain = async () => {
    setRunning(true);
    const r = await bridge.reprocessHistory(entry.id, model ? { localModel: model } : undefined);
    setRunning(false);
    if (r.ok) setRerun(false);
    else toast(r.error || "Couldn't re-run this recording", "error");
  };

  const meta = (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-fg-3">
      <span className="tabular-nums">{entry.words} words</span>
      <span className="size-0.5 rounded-full bg-fg-3" />
      <span className="tabular-nums">{(entry.durationMs / 1000).toFixed(1)}s {isEdit ? "instruction" : "spoken"}</span>
      {isEdit && !showRaw && (
        <Badge tone="accent">
          <Wand2 className="size-3" /> Voice edit
        </Badge>
      )}
      {entry.cleaned && !isEdit && !showRaw && (
        <Badge tone="accent">
          <Sparkles className="size-3" /> Polished
        </Badge>
      )}
      {entry.edited && !showRaw && <Badge>Corrected</Badge>}
      {entry.recovered && <Badge tone="success">Recovered</Badge>}
      {showRaw && <Badge>{isEdit ? "Before the edit" : "Original"}</Badge>}
      {entry.receipt && (
        <button
          onClick={() => setShowReceipt((s) => !s)}
          className={cx(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium transition-colors hover:bg-surface-3",
            entry.receipt.leavesDevice ? "text-warning" : "text-success"
          )}
          aria-expanded={showReceipt}
        >
          {entry.receipt.leavesDevice ? <Cloud className="size-3" /> : <ShieldCheck className="size-3" />}
          {entry.receipt.leavesDevice ? "Used the cloud" : "Stayed on this PC"}
        </button>
      )}
    </div>
  );

  return (
    <div className="group relative flex gap-4 px-5 py-4 transition-colors hover:bg-surface-2/60 [&+&]:border-t [&+&]:border-line">
      <div className="w-16 shrink-0 pt-0.5 text-[12px] font-medium text-fg-3 tabular-nums">{timeLabel(entry.createdAt)}</div>
      <div className="min-w-0 flex-1">
        {isEdit && entry.instruction && !compact && (
          <p className="mb-1 text-[12px] text-fg-3">
            You said: <span className="text-fg-2 italic">“{entry.instruction}”</span>
          </p>
        )}
        {editing ? (
          <div className="flex flex-col gap-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(10, Math.max(3, draft.split("\n").length + 1))} autoFocus />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={saveEdit} disabled={!draft.trim()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p
            data-selectable
            className={cx("text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg", compact && "line-clamp-2", showRaw && "text-fg-2 italic")}
          >
            {text}
          </p>
        )}
        {!compact && !editing && meta}

        {!compact && showReceipt && entry.receipt && (
          <ul className="animate-scale-in mt-2 flex flex-col gap-1 rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-[12px] text-fg-2">
            {receiptLines(entry.receipt).map((l) => (
              <li key={l} className="flex items-center gap-2">
                <Check className="size-3 shrink-0 text-success" /> {l}
              </li>
            ))}
          </ul>
        )}

        {!compact && suggestions.length > 0 && (
          <div className="animate-scale-in mt-2 flex flex-col gap-1.5">
            {suggestions.map((s) => (
              <div key={s.word} className="flex items-center gap-2 rounded-lg border border-accent/25 bg-accent-soft/50 px-3 py-2 text-[12.5px]">
                <span className="min-w-0 flex-1">
                  Always write <span className="font-semibold">{s.to}</span> instead of <span className="line-through">{s.word}</span>?
                </span>
                <Button size="sm" variant="primary" onClick={() => learn(s)}>
                  Remember
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSuggestions((cur) => cur.filter((x) => x.word !== s.word))}>
                  No
                </Button>
              </div>
            ))}
          </div>
        )}

        {!compact && rerun && !entry.alt && (
          <div className="animate-scale-in mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-[12.5px]">
            <span className="text-fg-2">Run the saved recording again{models.length > 0 ? " on" : ""}</span>
            {models.length > 0 && (
              <Select value={model} onChange={(e) => setModel(e.target.value)} className="h-8 w-auto text-[12.5px]">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.size})
                  </option>
                ))}
              </Select>
            )}
            <Button size="sm" variant="primary" onClick={runAgain} disabled={running}>
              {running ? "Working…" : "Run"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRerun(false)} disabled={running}>
              Cancel
            </Button>
          </div>
        )}

        {!compact && entry.alt && (
          <div className="animate-scale-in mt-3 rounded-xl border border-line bg-surface-2/50 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Current</div>
                <p data-selectable className="text-[13px] leading-relaxed whitespace-pre-wrap text-fg">{entry.text}</p>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold tracking-wide text-accent uppercase">
                  Re-run · {entry.alt.model} · {(entry.alt.processingMs / 1000).toFixed(1)}s
                </div>
                <p data-selectable className="text-[13px] leading-relaxed whitespace-pre-wrap text-fg">{entry.alt.text}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => bridge.useAlternative(entry.id)}>
                Use this version
              </Button>
              <Button size="sm" variant="ghost" onClick={() => bridge.dropAlternative(entry.id)}>
                Keep current
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {entry.cleaned && !compact && (
          <IconButton label={showRaw ? (isEdit ? "Show edited" : "Show polished") : isEdit ? "Show before the edit" : "Show original"} onClick={() => setShowRaw((s) => !s)}>
            {showRaw ? <Sparkles className="size-4" /> : <Undo2 className="size-4" />}
          </IconButton>
        )}
        {!compact && !editing && (
          <IconButton
            label="Correct this text"
            onClick={() => {
              setDraft(entry.text);
              setShowRaw(false);
              setEditing(true);
            }}
          >
            <Pencil className="size-4" />
          </IconButton>
        )}
        {!compact && entry.hasAudio && !entry.alt && (
          <IconButton label="Run the recording again" onClick={() => setRerun((r) => !r)}>
            <RefreshCw className="size-4" />
          </IconButton>
        )}
        <IconButton label="Copy" onClick={() => copy()}>
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
