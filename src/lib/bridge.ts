// Typed bridge to the Electron main process, with an in-browser mock so the UI
// can be developed and previewed with `npm run dev:web`.

export type SttProvider = "local" | "openai" | "groq" | "custom";
export type LlmProvider = "openai" | "anthropic" | "groq" | "custom";
export type Tone = "natural" | "professional" | "casual" | "verbatim";
/** What the text is being written for. "auto" picks from the app you're dictating into. */
export type FormatMode = "auto" | "message" | "email" | "notes" | "code" | "prompt" | "other";
export type Role = "general" | "developer" | "student" | "writer" | "business" | "support" | "healthcare";
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
  smartFormat: boolean;
  formatMode: FormatMode;
  useAppContext: boolean;
  role: Role;
  aboutYou: string;
  autoPaste: boolean;
  restoreClipboard: boolean;
  soundEffects: boolean;
  launchAtLogin: boolean;
  theme: Theme;
  micDeviceId: string;
  historyRetention: "forever" | "3h" | "24h" | "7d" | "30d";
  checkUpdates: boolean;
  showBubble: boolean;
  bubbleCollapsed: boolean;
  hasKey: Record<string, boolean>;
  keysEncrypted?: boolean;
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
  /** The kind of app it was formatted for. */
  context?: string;
}

export interface BubbleLayout {
  side: "left" | "right";
  collapsed: boolean;
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
  /** Only reliable for English. */
  english?: boolean;
  /** Suggested for Hindi, Telugu, Tamil and Kannada. */
  indic?: boolean;
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

export interface BridgeApi {
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
  onHistoryReplaced(cb: (list: HistoryEntry[]) => void): Unsub;
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
  setBubbleCollapsed(collapsed: boolean): Promise<void>;
  getBubbleLayout(): Promise<BubbleLayout>;
  onBubbleLayout(cb: (l: BubbleLayout) => void): Unsub;
  copy(text: string): Promise<void>;
  getPermissions(): Promise<Permissions>;
  requestMic(): Promise<boolean>;
  openAccessibility(): Promise<void>;
  openExternal(url: string): Promise<void>;
  appInfo(): Promise<{ version: string; platform: string }>;
  onNavigate(cb: (route: string) => void): Unsub;
  getUpdate(): Promise<{ version: string; url: string } | null>;
  onUpdate(cb: (u: { version: string; url: string }) => void): Unsub;
}

declare global {
  interface Window {
    vaakya?: BridgeApi;
  }
}

// ---------------- Browser mock ----------------

function createMock(): BridgeApi {
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
    { id: "a", word: "Adithya" },
    { id: "b", word: "kubernetes", to: "Kubernetes" },
    { id: "c", word: "Priya" },
  ];
  let settings: Settings = {
    onboarded: !params.has("onboarding"),
    hotkey: "CommandOrControl+Shift+Space",
    language: "auto",
    sttProvider: (params.get("stt") as SttProvider) || "local",
    localModel: "base",
    sttModel: "whisper-1",
    sttBaseUrl: "",
    cleanupEnabled: true,
    llmProvider: "openai",
    llmModel: "gpt-4o-mini",
    llmBaseUrl: "",
    tone: "natural",
    smartFormat: true,
    formatMode: "auto",
    useAppContext: true,
    role: "general",
    aboutYou: "",
    autoPaste: true,
    restoreClipboard: true,
    soundEffects: true,
    launchAtLogin: false,
    theme: (params.get("theme") as Theme) || "system",
    micDeviceId: "default",
    historyRetention: "30d",
    checkUpdates: true,
    showBubble: true,
    bubbleCollapsed: false,
    hasKey: { openai: true },
  };
  let state: DictationState = { status: "idle", message: "" };
  const localModels = [
    { id: "tiny", name: "Tiny", size: "75 MB", blurb: "Fastest. Short, clear English notes only.", recommended: false, english: true },
    { id: "base", name: "Base", size: "142 MB", blurb: "Quick and accurate enough for everyday English.", recommended: true, english: true },
    { id: "small", name: "Small", size: "466 MB", blurb: "More accurate English, usable Hindi. Great on modern CPUs.", recommended: false },
    { id: "turbo-q5", name: "Large v3 Turbo", size: "574 MB", blurb: "Best balance for Hindi, Telugu, Tamil and Kannada.", recommended: false, indic: true },
    { id: "large-q5", name: "Large v3", size: "1.08 GB", blurb: "Most accurate for Indian languages, but slow without a fast CPU.", recommended: false },
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
    onHistoryReplaced: on("historyReplaced"),
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
    setBubbleCollapsed: async (collapsed) => emit("bubbleLayout", { side: "right", collapsed }),
    getBubbleLayout: async () => ({ side: "right", collapsed: false }),
    onBubbleLayout: on("bubbleLayout"),
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
    appInfo: async () => ({ version: "0.2.0", platform: "browser" }),
    onNavigate: on("navigate"),
    getUpdate: async () => null,
    onUpdate: on("update"),
  };
}

export const bridge: BridgeApi = window.vaakya ?? createMock();
export const isMac = bridge.platform === "darwin";
