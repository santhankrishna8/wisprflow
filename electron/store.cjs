// Tiny JSON-backed persistence for settings, history and dictionary.
// API keys are encrypted with Electron's safeStorage (OS keychain) when available.
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SETTINGS = {
  onboarded: false,
  hotkey: "CommandOrControl+Shift+Space",
  language: "auto",
  sttProvider: "openai", // openai | groq | custom
  sttModel: "whisper-1",
  sttBaseUrl: "",
  cleanupEnabled: true,
  llmProvider: "openai", // openai | anthropic | groq | custom
  llmModel: "gpt-4o-mini",
  llmBaseUrl: "",
  tone: "natural", // natural | professional | casual | verbatim
  autoPaste: true,
  restoreClipboard: true,
  soundEffects: true,
  launchAtLogin: false,
  theme: "system", // system | light | dark
  micDeviceId: "default",
  showBubble: true, // always-on-top floating dictation button
  bubblePosition: null, // { x, y } in screen coordinates
  keys: {}, // provider -> encrypted key (base64)
};

function createStore(app, safeStorage) {
  const dir = app.getPath("userData");
  const file = path.join(dir, "wisprflow-data.json");
  let data = { settings: { ...DEFAULT_SETTINGS }, history: [], dictionary: [] };

  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    data = {
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      history: Array.isArray(raw.history) ? raw.history : [],
      dictionary: Array.isArray(raw.dictionary) ? raw.dictionary : [],
    };
  } catch {
    /* first run */
  }

  let timer = null;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, file);
    }, 150);
  }

  const canEncrypt = () => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  };

  return {
    getSettings() {
      // Never hand raw keys to the renderer: only whether one is set.
      const { keys, ...rest } = data.settings;
      const hasKey = {};
      for (const k of Object.keys(keys || {})) hasKey[k] = Boolean(keys[k]);
      return { ...rest, hasKey };
    },
    setSettings(patch) {
      const { keys, hasKey, ...rest } = patch || {};
      data.settings = { ...data.settings, ...rest };
      save();
      return this.getSettings();
    },
    setKey(provider, value) {
      const keys = { ...(data.settings.keys || {}) };
      if (!value) delete keys[provider];
      else if (canEncrypt()) keys[provider] = "enc:" + safeStorage.encryptString(value).toString("base64");
      else keys[provider] = "raw:" + Buffer.from(value).toString("base64");
      data.settings.keys = keys;
      save();
      return this.getSettings();
    },
    getKey(provider) {
      const v = (data.settings.keys || {})[provider];
      if (!v) return "";
      const buf = Buffer.from(v.slice(4), "base64");
      try {
        return v.startsWith("enc:") ? safeStorage.decryptString(buf) : buf.toString("utf8");
      } catch {
        return "";
      }
    },
    raw: () => data.settings,

    getHistory: () => data.history,
    addHistory(entry) {
      data.history.unshift(entry);
      if (data.history.length > 2000) data.history.length = 2000;
      save();
      return entry;
    },
    deleteHistory(id) {
      data.history = data.history.filter((h) => h.id !== id);
      save();
    },
    clearHistory() {
      data.history = [];
      save();
    },

    getDictionary: () => data.dictionary,
    setDictionary(list) {
      data.dictionary = Array.isArray(list) ? list : [];
      save();
      return data.dictionary;
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
      }
    },
  };
}

module.exports = { createStore, DEFAULT_SETTINGS };
