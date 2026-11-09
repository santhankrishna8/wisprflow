// Typed bridge to the Electron main process, with an in-browser mock so the UI
// can be developed and previewed with `npm run dev:web`.

export type SttProvider = "local" | "openai" | "groq" | "custom";
export type LlmProvider = "openai" | "anthropic" | "groq" | "custom";
export type Tone = "natural" | "professional" | "casual" | "verbatim";
export type Theme = "system" | "light" | "dark";
export type Status = "idle" | "recording" | "processing" | "done" | "error";

export interface Settings {
  onboarded: boolean;
  hotkey: string;
  language: string;
  sttProvider: SttProvider;
  localModel: string;
  sttModel: string;
  sttBaseUrl: string;
  cleanupEnabled: boolean;
  llmProvider: LlmProvider;
  llmModel: string;
  llmBaseUrl: string;
  tone: Tone;
  autoPaste: boolean;
  restoreClipboard: boolean;
  soundEffects: boolean;
  launchAtLogin: boolean;
  theme: Theme;
  micDeviceId: string;
  showBubble: boolean;
  hasKey: Record<string, boolean>;
}

export interface HistoryEntry {
  id: string;
  createdAt: string;
  text: string;
  raw: string;
  durationMs: number;
  processingMs: number;
  words: number;
  cleaned: boolean;
}

export interface DictionaryEntry {
  id: string;
  word: string;
  to?: string;
}

export interface DictationState {
  status: Status;
  message: string;
}

export interface LocalModel {
  id: string;
  name: string;
  size: string;
  blurb: string;
  recommended: boolean;
  downloaded: boolean;
  downloading: boolean;
}

export interface LocalProgress {
  id: string;
  received: number;
  total: number;
  done?: boolean;
}

export interface Permissions {
  platform: string;
  microphone: string;
  accessibility: boolean;
}

type Unsub = () => void;

export interface WisprApi {
  platform: string;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  setKey(provider: string, value: string): Promise<Settings>;
  testConnection(kind: "stt" | "llm"): Promise<{ ok: boolean; error?: string; message?: string }>;
  setHotkey(accel: string): Promise<{ ok: boolean; error?: string }>;
  suspendHotkey(suspend: boolean): Promise<void>;
  onSettings(cb: (s: Settings) => void): Unsub;
  getHistory(): Promise<HistoryEntry[]>;
  deleteHistory(id: string): Promise<void>;
  clearHistory(): Promise<void>;
  onHistoryAdded(cb: (e: HistoryEntry) => void): Unsub;
  getDictionary(): Promise<DictionaryEntry[]>;
  setDictionary(list: DictionaryEntry[]): Promise<DictionaryEntry[]>;
  toggleDictation(): Promise<void>;
  cancelDictation(): Promise<void>;
  getState(): Promise<DictationState>;
  onState(cb: (s: DictationState) => void): Unsub;
  onStart(cb: (opts: { micDeviceId: string; sounds: boolean; wav?: boolean }) => void): Unsub;
  onStop(cb: () => void): Unsub;
  onCancel(cb: () => void): Unsub;
  processAudio(p: { audio: ArrayBuffer; mimeType: string; durationMs: number }): Promise<{
    ok: boolean;
    error?: string;
    cancelled?: boolean;
  }>;
  setOverlayInteractive(on: boolean): void;
  recorderError(message: string): void;
  localInfo(): Promise<{ available: boolean; running: boolean; model: string | null }>;
  localModels(): Promise<LocalModel[]>;
  downloadLocalModel(id: string): Promise<{ ok: boolean; error?: string; cancelled?: boolean }>;
  cancelLocalDownload(id: string): Promise<void>;
  deleteLocalModel(id: string): Promise<void>;
  onLocalProgress(cb: (p: LocalProgress) => void): Unsub;
  bubbleDragStart(): void;
  bubbleDragMove(): void;
  bubbleDragEnd(): Promise<{ moved: boolean }>;
  hideBubble(): Promise<void>;
  copy(text: string): Promise<void>;
  getPermissions(): Promise<Permissions>;
  requestMic(): Promise<boolean>;
  openAccessibility(): Promise<void>;
  openExternal(url: string): Promise<void>;
  appInfo(): Promise<{ version: string; platform: string }>;
  onNavigate(cb: (route: string) => void): Unsub;
}

declare global {
  interface Window {
    wispr?: WisprApi;
  }
}

// ---------------- Browser mock ----------------

function createMock(): WisprApi {
  const listeners: Record<string, Set<(p: any) => void>> = {};
  const emit = (ch: string, p?: any) => listeners[ch]?.forEach((f) => f(p));
  const on = (ch: string) => (cb: (p: any) => void) => {
    (listeners[ch] ||= new Set()).add(cb);
    return () => listeners[ch].delete(cb);
  };
  const params = new URLSearchParams(location.search);
  const now = Date.now();
  const sample = [
    "Hey team, quick update: the launch is moving to Thursday so we have time to finish the onboarding polish. I'll send the revised checklist by end of day.",
    "Remind me to book the flights for the offsite, and check whether Priya can join the design review on Monday.",
    "The new caching layer cut p95 latency from 420 milliseconds to about 180. Next step is rolling it out to the EU region.",
    "Thanks so much for the intro! I'd love to grab coffee next week — does Tuesday or Wednesday afternoon work for you?",
    "- Draft the Q3 roadmap\n- Review the hiring plan\n- Follow up with legal on the vendor contract",
    "Can we move standup to 9:30 starting next week? A few folks are in a different time zone now.",
  ];
  let history: HistoryEntry[] = params.has("empty")
    ? []
    : sample.map((text, i) => ({
        id: String(i),
        createdAt: new Date(now - i * 1000 * 60 * 60 * (i < 2 ? 1.3 : 9)).toISOString(),
        text,
        raw: "um so " + text.toLowerCase(),
        durationMs: 6000 + i * 2500,
        processingMs: 900,
        words: text.split(/\s+/).length,
        cleaned: true,
      }));
  let dictionary: DictionaryEntry[] = [
    { id: "a", word: "WisprFlow" },
    { id: "b", word: "kubernetes", to: "Kubernetes" },
    { id: "c", word: "Priya" },
  ];
  let settings: Settings = {
    onboarded: !params.has("onboarding"),
    hotkey: "CommandOrControl+Shift+Space",
    language: "auto",
    sttProvider: (params.get("stt") as SttProvider) || "openai",
    localModel: "base",
    sttModel: "whisper-1",
    sttBaseUrl: "",
    cleanupEnabled: true,
    llmProvider: "openai",
    llmModel: "gpt-4o-mini",
    llmBaseUrl: "",
    tone: "natural",
    autoPaste: true,
    restoreClipboard: true,
    soundEffects: true,
    launchAtLogin: false,
    theme: (params.get("theme") as Theme) || "system",
    micDeviceId: "default",
    showBubble: true,
    hasKey: { openai: true },
  };
  let state: DictationState = { status: "idle", message: "" };
  const localModels = [
    { id: "tiny", name: "Tiny", size: "75 MB", blurb: "Fastest. Fine for short, clear notes.", recommended: false },
    { id: "base", name: "Base", size: "142 MB", blurb: "Quick and accurate enough for most dictation.", recommended: true },
    { id: "small", name: "Small", size: "466 MB", blurb: "Noticeably more accurate. Great on modern CPUs.", recommended: false },
    { id: "turbo-q5", name: "Large v3 Turbo", size: "574 MB", blurb: "Near-best accuracy. Slower without a strong CPU.", recommended: false },
  ];
  const downloaded = new Set<string>(params.has("nomodels") ? [] : ["base"]);
  const setState = (s: Status, message = "") => {
    state = { status: s, message };
    emit("state", state);
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    platform: /Mac/.test(navigator.platform) ? "darwin" : "linux",
    getSettings: async () => settings,
    setSettings: async (patch) => {
      settings = { ...settings, ...patch };
      emit("settings", settings);
      return settings;
    },
    setKey: async (provider, value) => {
      settings = { ...settings, hasKey: { ...settings.hasKey, [provider]: Boolean(value) } };
      emit("settings", settings);
      return settings;
    },
    testConnection: async () => {
      await wait(700);
      return { ok: true };
    },
    setHotkey: async (hotkey) => {
      settings = { ...settings, hotkey };
      emit("settings", settings);
      return { ok: true };
    },
    suspendHotkey: async () => {},
    onSettings: on("settings"),
    getHistory: async () => history,
    deleteHistory: async (id) => {
      history = history.filter((h) => h.id !== id);
    },
    clearHistory: async () => {
      history = [];
    },
    onHistoryAdded: on("history"),
    getDictionary: async () => dictionary,
    setDictionary: async (list) => (dictionary = list),
    toggleDictation: async () => {
      if (state.status === "recording") {
        clearTimeout(timer);
        setState("processing");
        await wait(1100);
        const text = "This is a demo transcription from the browser preview.";
        const entry: HistoryEntry = {
          id: String(Date.now()),
          createdAt: new Date().toISOString(),
          text,
          raw: text,
          durationMs: 3200,
          processingMs: 1100,
          words: text.split(" ").length,
          cleaned: true,
        };
        history = [entry, ...history];
        emit("history", entry);
        setState("done", "Pasted");
        await wait(900);
        setState("idle");
      } else if (state.status === "idle") {
        setState("recording");
        timer = setTimeout(() => state.status === "recording" && setState("idle"), 15000);
      }
    },
    cancelDictation: async () => setState("idle"),
    getState: async () => state,
    onState: on("state"),
    onStart: on("start"),
    onStop: on("stop"),
    onCancel: on("cancel"),
    processAudio: async () => ({ ok: true }),
    setOverlayInteractive: () => {},
    recorderError: () => {},
    localInfo: async () => ({ available: true, running: false, model: null }),
    localModels: async () =>
      localModels.map((m) => ({ ...m, downloaded: downloaded.has(m.id), downloading: false })),
    downloadLocalModel: async (id) => {
      for (let i = 1; i <= 20; i++) {
        await wait(80);
        emit("localProgress", { id, received: i * 5e6, total: 1e8, done: i === 20 });
      }
      downloaded.add(id);
      return { ok: true };
    },
    cancelLocalDownload: async () => {},
    deleteLocalModel: async (id) => void downloaded.delete(id),
    onLocalProgress: on("localProgress"),
    bubbleDragStart: () => {},
    bubbleDragMove: () => {},
    bubbleDragEnd: async () => {
      await (async () => {})();
      return { moved: false };
    },
    hideBubble: async () => {},
    copy: async (t) => {
      try {
        await navigator.clipboard.writeText(t);
      } catch {
        /* ignore */
      }
    },
    getPermissions: async () => ({ platform: "darwin", microphone: "granted", accessibility: false }),
    requestMic: async () => true,
    openAccessibility: async () => {},
    openExternal: async (url) => void window.open(url, "_blank"),
    appInfo: async () => ({ version: "0.1.0", platform: "browser" }),
    onNavigate: on("navigate"),
  };
}

export const wispr: WisprApi = window.wispr ?? createMock();
export const isMac = wispr.platform === "darwin";
