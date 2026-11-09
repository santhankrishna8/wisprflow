import { useCallback, useEffect, useState } from "react";
import { Check, Cpu, Download, Trash2, X } from "lucide-react";
import { Badge, Button, IconButton, cx, useToast } from "./ui";
import { wispr } from "../lib/wispr";
import type { LocalModel, LocalProgress } from "../lib/wispr";

export function useLocalModels() {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [progress, setProgress] = useState<Record<string, LocalProgress>>({});
  const [available, setAvailable] = useState(true);
  const refresh = useCallback(async () => setModels(await wispr.localModels()), []);
  useEffect(() => {
    refresh();
    wispr.localInfo().then((i) => setAvailable(i.available));
    return wispr.onLocalProgress((p) => setProgress((x) => ({ ...x, [p.id]: p })));
  }, [refresh]);
  return { models, progress, setProgress, refresh, available };
}

function mb(bytes: number) {
  return `${Math.round(bytes / 1e6)} MB`;
}

/** Pick, download and manage on-device Whisper models. */
export function LocalModelPicker({
  value,
  onChange,
  state,
}: {
  value: string;
  onChange: (id: string) => void;
  state: ReturnType<typeof useLocalModels>;
}) {
  const { models, progress, setProgress, refresh, available } = state;
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const toast = useToast();

  const download = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    onChange(id);
    const r = await wispr.downloadLocalModel(id);
    setBusy((b) => ({ ...b, [id]: false }));
    setProgress((p) => {
      const { [id]: _, ...rest } = p;
      return rest;
    });
    await refresh();
    if (r.ok) toast("Model ready — you can dictate offline now", "success");
    else if (!r.cancelled) toast(r.error || "Download failed", "error");
  };

  if (!available) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-[13px] text-fg-2">
        The on-device engine isn't included in this build. Reinstall WisprFlow from the latest installer to use it.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {models.map((m) => {
        const selected = value === m.id;
        const p = progress[m.id];
        const downloading = busy[m.id] || m.downloading;
        const pct = p ? Math.min(100, Math.round((p.received / p.total) * 100)) : 0;
        return (
          <div
            key={m.id}
            role="radio"
            aria-checked={selected}
            tabIndex={0}
            onClick={() => (m.downloaded ? onChange(m.id) : !downloading && download(m.id))}
            onKeyDown={(e) => e.key === "Enter" && (m.downloaded ? onChange(m.id) : !downloading && download(m.id))}
            className={cx(
              "relative overflow-hidden rounded-xl border px-4 py-3 transition-all",
              selected ? "border-accent bg-accent-soft/60 ring-4 ring-accent/10" : "border-line-strong bg-surface",
              !selected && "cursor-pointer hover:border-fg-3/40"
            )}
          >
            {downloading && (
              <span className="absolute inset-y-0 left-0 bg-accent/10 transition-[width] duration-200" style={{ width: `${pct}%` }} />
            )}
            <div className="relative flex items-center gap-3">
              <span
                className={cx(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-accent bg-accent text-white" : "border-line-strong"
                )}
              >
                {selected && <Check className="size-2.5" strokeWidth={3.5} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold">{m.name}</span>
                  <span className="text-[12px] text-fg-3 tabular-nums">{m.size}</span>
                  {m.recommended && <Badge tone="accent">Recommended</Badge>}
                </div>
                <div className="mt-0.5 text-[12px] text-fg-3">
                  {downloading && p ? `Downloading… ${mb(p.received)} of ${mb(p.total)} (${pct}%)` : m.blurb}
                </div>
              </div>
              {downloading ? (
                <IconButton
                  label="Cancel download"
                  onClick={(e) => {
                    e.stopPropagation();
                    wispr.cancelLocalDownload(m.id);
                  }}
                >
                  <X className="size-4" />
                </IconButton>
              ) : m.downloaded ? (
                <div className="flex items-center gap-1">
                  <span className="flex items-center gap-1 text-[12px] font-medium text-success">
                    <Check className="size-3.5" /> Downloaded
                  </span>
                  <IconButton
                    label="Delete model"
                    className="hover:text-danger"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await wispr.deleteLocalModel(m.id);
                      await refresh();
                      toast(`${m.name} model removed`);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              ) : (
                <Button
                  size="sm"
                  icon={<Download className="size-3.5" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    download(m.id);
                  }}
                >
                  Download
                </Button>
              )}
            </div>
          </div>
        );
      })}
      <p className="mt-1 flex items-start gap-2 px-1 text-[12px] leading-relaxed text-fg-3">
        <Cpu className="mt-0.5 size-3.5 shrink-0" />
        Runs on your CPU only while you dictate, then shuts down after 10 idle minutes. Audio never leaves this computer.
      </p>
    </div>
  );
}
