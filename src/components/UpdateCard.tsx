import { Download, Loader2, RefreshCw } from "lucide-react";
import { bridge } from "../lib/bridge";
import type { UpdateInfo, UpdateProgress } from "../lib/bridge";
import { Button } from "./ui";

const mb = (n = 0) => `${(n / 1048576).toFixed(0)} MB`;

/** "Update available" with a one-click install that downloads and restarts inside the app. */
export function UpdateCard({ update, progress, install }: { update: UpdateInfo; progress: UpdateProgress | null; install: () => void }) {
  const busy = progress?.phase === "downloading" || progress?.phase === "installing";
  const pct = progress?.total ? Math.min(100, Math.round(((progress.received || 0) / progress.total) * 100)) : 0;
  return (
    <div role="status" className="w-full rounded-xl border border-accent/30 bg-accent-soft px-3.5 py-3 text-left">
      <div className="text-[12px] font-semibold text-accent-text">Update available — v{update.version}</div>
      {progress?.phase === "downloading" && (
        <>
          <div role="progressbar" aria-label="Downloading the update" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1.5 text-[11px] text-fg-3 tabular-nums">
            Downloading… {mb(progress.received)}
            {progress.total ? ` of ${mb(progress.total)}` : ""}
          </div>
        </>
      )}
      {progress?.phase === "installing" && (
        <div className="mt-2 flex items-center gap-2 text-[11.5px] text-fg-2">
          <Loader2 className="size-3.5 animate-spin" /> Installing — SayType will restart…
        </div>
      )}
      {progress?.phase === "error" && (
        <div className="mt-1.5 text-[11.5px] text-danger">
          {progress.error || "The update failed."}{" "}
          <button className="font-medium underline" onClick={() => bridge.openExternal(update.url)}>
            Download it manually
          </button>
        </div>
      )}
      {!busy && (
        <Button size="sm" variant="primary" className="mt-2.5 w-full" icon={<Download className="size-3.5" />} onClick={install}>
          {progress?.phase === "error" ? "Try again" : update.canInstall ? "Install and restart" : "Get the update"}
        </Button>
      )}
    </div>
  );
}

export function CheckUpdatesButton({ checking, onClick }: { checking: boolean; onClick: () => void }) {
  return (
    <Button size="sm" loading={checking} icon={<RefreshCw className="size-3.5" />} onClick={onClick}>
      Check now
    </Button>
  );
}
