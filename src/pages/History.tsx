import { useMemo, useState } from "react";
import { Download, History as HistoryIcon, Search, Trash2, X } from "lucide-react";
import { Button, Card, EmptyState, Input, useToast } from "../components/ui";
import { TranscriptRow } from "../components/Transcript";
import { dayLabel } from "../lib/stats";
import type { HistoryEntry } from "../lib/bridge";

const RETENTION_LABEL: Record<string, string> = { "3h": "3 hours", "24h": "24 hours", "7d": "7 days", "30d": "30 days" };

export default function History({
  history,
  onDelete,
  onClear,
  retention,
}: {
  history: HistoryEntry[];
  onDelete: (id: string) => void;
  onClear: () => void;
  retention?: string;
}) {
  const [q, setQ] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const toast = useToast();

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? history.filter((h) => h.text.toLowerCase().includes(needle) || h.raw.toLowerCase().includes(needle)) : history;
    const map = new Map<string, HistoryEntry[]>();
    for (const h of filtered) {
      const k = dayLabel(h.createdAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(h);
    }
    return [...map.entries()];
  }, [history, q]);

  const exportAll = () => {
    const body = history.map((h) => `[${new Date(h.createdAt).toLocaleString()}]\n${h.text}\n`).join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vaakya-history-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[920px] px-10 pt-14 pb-12">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">History</h1>
          <p className="mt-1 text-[13px] text-fg-3">
            {retention && RETENTION_LABEL[retention]
              ? `Stored only on this device. Dictations older than ${RETENTION_LABEL[retention]} are deleted automatically.`
              : "Everything you've dictated, stored only on this device."}
          </p>
        </div>
        {history.length > 0 && (
          <div className="flex gap-2">
            <Button size="sm" icon={<Download className="size-3.5" />} onClick={exportAll}>
              Export
            </Button>
            {confirmClear ? (
              <div className="animate-scale-in flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-danger text-white hover:brightness-110"
                  variant="primary"
                  onClick={() => {
                    onClear();
                    setConfirmClear(false);
                    toast("History cleared");
                  }}
                >
                  Delete all
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmClear(true)}>
                Clear
              </Button>
            )}
          </div>
        )}
      </header>

      {history.length > 0 && (
        <div className="relative mb-6">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your dictations…" className="h-10 rounded-xl pl-10" />
          {q && (
            <button onClick={() => setQ("")} className="absolute top-1/2 right-3 -translate-y-1/2 text-fg-3 hover:text-fg" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {history.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HistoryIcon className="size-6" />}
            title="No dictations yet"
            description="When you dictate, each transcript is saved here so you can search, copy, or compare it with the original."
          />
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState icon={<Search className="size-6" />} title="No matches" description={`Nothing matches “${q}”. Try a different word.`} />
        </Card>
      ) : (
        <div className="flex flex-col gap-7">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2.5 flex items-center gap-2 px-1 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">
                {day}
                <span className="font-medium normal-case tracking-normal">· {items.length}</span>
              </h2>
              <Card className="overflow-hidden">
                {items.map((h) => (
                  <TranscriptRow key={h.id} entry={h} onDelete={onDelete} />
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
