import { useCallback, useEffect, useState } from "react";
import { bridge } from "./bridge";
import type { DictationState, HistoryEntry, Settings } from "./bridge";

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    bridge.getSettings().then(setSettings);
    return bridge.onSettings(setSettings);
  }, []);
  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setSettings(await bridge.setSettings(patch));
  }, []);
  const refresh = useCallback(() => bridge.getSettings().then(setSettings), []);
  return { settings, update, refresh };
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    bridge.getHistory().then((h) => setHistory([...h]));
    const offAdded = bridge.onHistoryAdded((e) => setHistory((h) => [e, ...h.filter((x) => x.id !== e.id)]));
    const offReplaced = bridge.onHistoryReplaced((list) => setHistory([...list]));
    return () => {
      offAdded();
      offReplaced();
    };
  }, []);
  const remove = useCallback(async (id: string) => {
    setHistory((h) => h.filter((x) => x.id !== id));
    await bridge.deleteHistory(id);
  }, []);
  const clear = useCallback(async () => {
    setHistory([]);
    await bridge.clearHistory();
  }, []);
  return { history, remove, clear };
}

export function useDictationState() {
  const [state, setState] = useState<DictationState>({ status: "idle", message: "" });
  useEffect(() => {
    bridge.getState().then(setState);
    return bridge.onState(setState);
  }, []);
  return state;
}

export function useResolvedTheme(theme: Settings["theme"] | undefined) {
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const fn = () => setSystemDark(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  const dark = theme === "dark" || (theme !== "light" && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return dark;
}
