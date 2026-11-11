// Tiny JSON-backed persistence for settings, history and dictionary.
// API keys are encrypted with Electron's safeStorage (OS keychain) when available.
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SETTINGS = {
  onboarded: false,
  hotkey: "CommandOrControl+Shift+Space",
  language: "auto", // auto | en | hi | te | ta | kn
  sttProvider: "local", // local | openai | groq | custom
  localModel: "base", // on-device whisper model id
  sttModel: "whisper-1",
  sttBaseUrl: "",
  cleanupEnabled: true,
  llmProvider: "openai", // openai | anthropic | groq | custom
  llmModel: "gpt-4o-mini",
  llmBaseUrl: "",
  tone: "natural", // natural | professional | casual | verbatim
  smartFormat: true, // offline formatting: spoken commands, fillers, developer terms
  formatMode: "auto", // auto (from the active app) | message | email | notes | code | prompt | other
  useAppContext: true, // look at the active app's name and window title to pick a format
  role: "general", // general | developer | student | writer | business | support | healthcare
  aboutYou: "", // free text that helps the AI spell your names and terms
  autoPaste: true,
  restoreClipboard: true,
  soundEffects: true,
  launchAtLogin: false,
  theme: "system", // system | light | dark
  micDeviceId: "default",
  historyRetention: "30d", // forever | 3h | 24h | 7d | 30d
  checkUpdates: true, // ask GitHub for new releases (no data sent)
  showBubble: true, // always-on-top floating dictation pill
  bubbleCollapsed: false, // tucked into the screen edge as a slim tab
  bubblePosition: null, // { x, y } in screen coordinates
  keys: {}, // provider -> encrypted key (base64)
};

function createStore(app, safeStorage) {
  const dir = app.getPath("userData");
  const file = path.join(dir, "vaakya-data.json");
  let data = { settings: { ...DEFAULT_SETTINGS }, history: [], dictionary: [] };

  try {
    // Installs from before the rename kept their data under the old file name.
    const legacy = path.join(dir, "wisprflow-data.json");
    const raw = JSON.parse(fs.readFileSync(!fs.existsSync(file) && fs.existsSync(legacy) ? legacy : file, "utf8"));
    data = {
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      history: Array.isArray(raw.history) ? raw.history : [],
      dictionary: Array.isArray(raw.dictionary) ? raw.dictionary : [],
    };
  } catch (err) {
    if (err.code !== "ENOENT") {
      // Unreadable or corrupt: keep a copy so the next save can't destroy the user's data.
      try {
        fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
      } catch {
        /* nothing to back up */
      }
    }
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
      return { ...rest, hasKey, keysEncrypted: canEncrypt() };
    },
    setSettings(patch) {
      const { keys, hasKey, keysEncrypted, ...rest } = patch || {};
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
    /** Remove entries older than maxAgeMs. Returns how many were removed. */
    pruneHistory(maxAgeMs, now = Date.now()) {
      if (!maxAgeMs) return 0;
      const before = data.history.length;
      data.history = data.history.filter((h) => now - Date.parse(h.createdAt) < maxAgeMs);
      const removed = before - data.history.length;
      if (removed) save();
      return removed;
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

const RETENTION_MS = {
  forever: 0,
  "3h": 3 * 3600_000,
  "24h": 24 * 3600_000,
  "7d": 7 * 86400_000,
  "30d": 30 * 86400_000,
};

module.exports = { createStore, DEFAULT_SETTINGS, RETENTION_MS };
