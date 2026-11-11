import { useEffect, useState } from "react";
import { BookA, History as HistoryIcon, Home as HomeIcon, Settings as SettingsIcon } from "lucide-react";
import { Hotkey, Logo, ToastProvider, cx } from "./components/ui";
import { useDictationState, useHistory, useResolvedTheme, useSettings } from "./lib/useApp";
import { isMac, bridge } from "./lib/bridge";
import Home from "./pages/Home";
import History from "./pages/History";
import Dictionary from "./pages/Dictionary";
import SettingsPage from "./pages/Settings";
import Onboarding from "./pages/Onboarding";

export type Route = "home" | "history" | "dictionary" | "settings";

const NAV: Array<{ id: Route; label: string; icon: typeof HomeIcon }> = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "history", label: "History", icon: HistoryIcon },
  { id: "dictionary", label: "Dictionary", icon: BookA },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export default function App() {
  const { settings, update, refresh } = useSettings();
  const { history, remove, clear } = useHistory();
  const state = useDictationState();
  const initial = (new URLSearchParams(location.search).get("route") as Route) || "home";
  const [route, setRoute] = useState<Route>(initial);
  useResolvedTheme(settings?.theme);

  useEffect(() => bridge.onNavigate((r) => setRoute(r as Route)), []);
  const [newRelease, setNewRelease] = useState<{ version: string; url: string } | null>(null);
  useEffect(() => {
    bridge.getUpdate().then(setNewRelease);
    return bridge.onUpdate(setNewRelease);
  }, []);

  if (!settings) return <div className="h-full bg-bg" />;

  if (!settings.onboarded) {
    return (
      <ToastProvider>
        <Onboarding settings={settings} update={update} refresh={refresh} state={state} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="flex h-full">
        {/* Sidebar */}
        <aside className="drag flex w-[232px] shrink-0 flex-col border-r border-line bg-sidebar">
          <div className={cx("flex items-center gap-2.5 px-5", isMac ? "pt-12 pb-5" : "pt-5 pb-5")}>
            <Logo size={26} />
            <span className="text-[15px] font-semibold tracking-tight">Vaakya</span>
          </div>
          <nav className="no-drag flex flex-col gap-0.5 px-3">
            {NAV.map(({ id, label, icon: Icon }) => {
              const active = route === id;
              return (
                <button
                  key={id}
                  onClick={() => setRoute(id)}
                  className={cx(
                    "group flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-medium transition-colors",
                    active ? "bg-surface text-fg shadow-sm ring-1 ring-line" : "text-fg-2 hover:bg-surface-3/60 hover:text-fg"
                  )}
                >
                  <Icon className={cx("size-[17px]", active ? "text-accent" : "text-fg-3 group-hover:text-fg-2")} strokeWidth={2} />
                  {label}
                  {id === "history" && history.length > 0 && (
                    <span className="ml-auto text-[11.5px] font-medium text-fg-3 tabular-nums">{history.length}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="no-drag mt-auto flex flex-col gap-2 p-3">
            {newRelease && (
              <button
                onClick={() => bridge.openExternal(newRelease.url)}
                className="w-full rounded-xl border border-accent/30 bg-accent-soft/60 px-3.5 py-2.5 text-left text-[12px] font-medium text-accent-text hover:bg-accent-soft"
              >
                Update available — v{newRelease.version}
                <span className="mt-0.5 block text-[11px] font-normal text-fg-3">Download the new installer</span>
              </button>
            )}
            <StatusCard status={state.status} hotkey={settings.hotkey} />
          </div>
        </aside>

        {/* Content */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="drag absolute inset-x-0 top-0 z-10 h-12" />
          <div key={route} className="scroll animate-fade-up flex-1">
            {route === "home" && <Home settings={settings} history={history} state={state} onNavigate={setRoute} />}
            {route === "history" && <History history={history} onDelete={remove} onClear={clear} retention={settings.historyRetention} />}
            {route === "dictionary" && <Dictionary />}
            {route === "settings" && <SettingsPage settings={settings} update={update} refresh={refresh} />}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}

function StatusCard({ status, hotkey }: { status: string; hotkey: string }) {
  const recording = status === "recording";
  const processing = status === "processing";
  return (
    <button
      onClick={() => bridge.toggleDictation()}
      className={cx(
        "w-full rounded-2xl border p-3.5 text-left transition-all",
        recording
          ? "border-transparent bg-panel text-white shadow-lg"
          : "border-line bg-surface shadow-sm hover:shadow-md"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex size-2">
          {recording && <span className="absolute inset-0 animate-ping rounded-full bg-[#9fd6cf]" />}
          <span
            className={cx(
              "relative size-2 rounded-full",
              recording ? "bg-[#9fd6cf]" : processing ? "animate-pulse bg-accent" : "bg-success"
            )}
          />
        </span>
        <span className={cx("text-[12px] font-semibold", recording ? "text-white" : "text-fg")}>
          {recording ? "Listening…" : processing ? "Transcribing…" : "Ready to dictate"}
        </span>
      </div>
      <div className={cx("mt-2.5 text-[11.5px]", recording ? "text-white/60" : "text-fg-3")}>
        {recording ? "Press again to finish" : "Press from any app to start"}
      </div>
      <div className="mt-2">
        <Hotkey accel={hotkey} size="sm" tone={recording ? "inverse" : "default"} />
      </div>
    </button>
  );
}
