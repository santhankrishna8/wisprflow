const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  clipboard,
  screen,
  Tray,
  Menu,
  nativeImage,
  nativeTheme,
  safeStorage,
  shell,
  systemPreferences,
  Notification,
} = require("electron");
const path = require("node:path");
const crypto = require("node:crypto");
const { createStore } = require("./store.cjs");
const ai = require("./ai.cjs");
const { pasteText } = require("./paste.cjs");

const isDev = process.env.NODE_ENV === "development";
const DEV_URL = "http://localhost:5173";
const isMac = process.platform === "darwin";

let store;
let mainWindow = null;
let overlayWindow = null;
let tray = null;
let quitting = false;

// idle | recording | processing | done | error
let state = { status: "idle", message: "" };
let activeAbort = null;
let registeredHotkey = null;

if (!app.requestSingleInstanceLock()) app.quit();

function load(win, page) {
  if (isDev) win.loadURL(`${DEV_URL}/${page}`);
  else win.loadFile(path.join(__dirname, "..", "dist", page));
}

function themeColors() {
  const s = store?.raw();
  const dark = s?.theme === "dark" || (s?.theme !== "light" && nativeTheme.shouldUseDarkColors);
  return dark ? { bg: "#0b0b0f", fg: "#e7e7ea" } : { bg: "#fbfbfa", fg: "#1c1c22" };
}

function createMainWindow() {
  const c = themeColors();
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false,
    backgroundColor: c.bg,
    title: "WisprFlow",
    titleBarStyle: "hidden",
    ...(isMac
      ? { trafficLightPosition: { x: 18, y: 18 } }
      : { titleBarOverlay: { color: "#00000000", symbolColor: c.fg, height: 48 } }),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  load(mainWindow, "index.html");
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

const OVERLAY = { width: 420, height: 150 };

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    ...OVERLAY,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  load(overlayWindow, "overlay.html");
}

function positionOverlay() {
  const point = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(point);
  overlayWindow.setBounds({
    x: Math.round(workArea.x + (workArea.width - OVERLAY.width) / 2),
    y: Math.round(workArea.y + workArea.height - OVERLAY.height - 24),
    ...OVERLAY,
  });
}

function broadcast(channel, payload) {
  for (const w of [mainWindow, overlayWindow]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function setState(status, message = "") {
  state = { status, message };
  broadcast("dictation:state", state);
  updateTray();
}

function registerEscape(on) {
  if (on) {
    if (!globalShortcut.isRegistered("Escape")) globalShortcut.register("Escape", cancelDictation);
  } else if (globalShortcut.isRegistered("Escape")) {
    globalShortcut.unregister("Escape");
  }
}

function startDictation() {
  if (!overlayWindow) return;
  positionOverlay();
  overlayWindow.showInactive();
  setState("recording");
  registerEscape(true);
  overlayWindow.webContents.send("dictation:start", {
    micDeviceId: store.raw().micDeviceId,
    sounds: store.raw().soundEffects,
  });
}

function stopDictation() {
  registerEscape(false);
  overlayWindow?.webContents.send("dictation:stop");
}

function cancelDictation() {
  registerEscape(false);
  activeAbort?.abort();
  activeAbort = null;
  overlayWindow?.webContents.send("dictation:cancel");
  setState("idle");
  setTimeout(() => overlayWindow?.hide(), 220);
}

function toggleDictation() {
  if (state.status === "recording") stopDictation();
  else if (state.status === "processing") return;
  else startDictation();
}

function hideOverlaySoon(ms) {
  setTimeout(() => {
    if (state.status !== "recording" && state.status !== "processing") {
      overlayWindow?.hide();
      if (state.status !== "idle") setState("idle");
    }
  }, ms);
}

async function processAudio(_e, { audio, mimeType, durationMs }) {
  const settings = store.raw();
  const dictionary = store.getDictionary();
  setState("processing");
  const abort = new AbortController();
  activeAbort = abort;
  const t0 = Date.now();
  try {
    if (!audio || audio.byteLength < 1200 || durationMs < 350) {
      setState("idle");
      overlayWindow?.hide();
      return { ok: false, error: "Too short — hold on a little longer." };
    }
    let raw = await ai.transcribe({
      audio: Buffer.from(audio),
      mimeType,
      settings,
      apiKey: store.getKey(settings.sttProvider),
      dictionary,
      signal: abort.signal,
    });
    raw = ai.applyDictionary(raw, dictionary);
    if (!raw) throw new Error("No speech detected.");

    let text = raw;
    let cleanupError = null;
    if (settings.cleanupEnabled && settings.tone !== "verbatim") {
      try {
        text = ai.applyDictionary(
          await ai.cleanup({
            text: raw,
            settings,
            apiKey: store.getKey(settings.llmProvider),
            dictionary,
            signal: abort.signal,
          }),
          dictionary
        );
      } catch (err) {
        if (abort.signal.aborted) throw err;
        cleanupError = err.message;
        text = raw;
      }
    }
    if (abort.signal.aborted) return { ok: false, cancelled: true };

    const entry = store.addHistory({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      text,
      raw,
      durationMs,
      processingMs: Date.now() - t0,
      words: text.split(/\s+/).filter(Boolean).length,
      cleaned: text !== raw,
    });
    broadcast("history:added", entry);

    setState("done", cleanupError ? "Pasted raw text — cleanup failed" : settings.autoPaste ? "Pasted" : "Copied");
    if (settings.autoPaste) {
      try {
        await pasteText(clipboard, text, { restore: settings.restoreClipboard });
      } catch (err) {
        clipboard.writeText(text);
        notify("Copied to clipboard", err.message);
      }
    } else {
      clipboard.writeText(text);
    }
    hideOverlaySoon(cleanupError ? 2200 : 900);
    return { ok: true, entry, cleanupError };
  } catch (err) {
    if (abort.signal.aborted) return { ok: false, cancelled: true };
    setState("error", err.message);
    hideOverlaySoon(3200);
    return { ok: false, error: err.message };
  } finally {
    if (activeAbort === abort) activeAbort = null;
  }
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
}

function registerHotkey(accelerator) {
  if (registeredHotkey) {
    try {
      globalShortcut.unregister(registeredHotkey);
    } catch {
      /* ignore */
    }
  }
  let ok = false;
  try {
    ok = globalShortcut.register(accelerator, toggleDictation);
  } catch {
    ok = false;
  }
  if (ok) {
    registeredHotkey = accelerator;
    return { ok: true };
  }
  // Restore previous binding on failure.
  if (registeredHotkey && registeredHotkey !== accelerator) {
    try {
      globalShortcut.register(registeredHotkey, toggleDictation);
    } catch {
      /* ignore */
    }
  }
  return { ok: false, error: `“${accelerator}” is unavailable — another app may be using it.` };
}

function trayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, "assets", isMac ? "trayTemplate.png" : "tray.png"));
  if (isMac) img.setTemplateImage(true);
  return img;
}

function updateTray() {
  if (!tray) return;
  const recording = state.status === "recording";
  tray.setToolTip(recording ? "WisprFlow — listening…" : "WisprFlow");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: recording ? "Stop dictation" : "Start dictation", accelerator: registeredHotkey || undefined, click: toggleDictation },
      { type: "separator" },
      { label: "Open WisprFlow", click: showMain },
      { label: "Settings…", click: () => showMain("settings") },
      { type: "separator" },
      { label: "Quit", role: "quit" },
    ])
  );
}

function showMain(route) {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (typeof route === "string") mainWindow.webContents.send("navigate", route);
}

async function testConnection(_e, kind) {
  const s = store.raw();
  const provider = kind === "stt" ? s.sttProvider : s.llmProvider;
  const key = store.getKey(provider);
  const bases = {
    openai: "https://api.openai.com/v1",
    groq: "https://api.groq.com/openai/v1",
    anthropic: "https://api.anthropic.com/v1",
  };
  const base = provider === "custom" ? String(kind === "stt" ? s.sttBaseUrl : s.llmBaseUrl).replace(/\/+$/, "") : bases[provider];
  if (!base) return { ok: false, error: "Enter a base URL first." };
  if (!key && provider !== "custom") return { ok: false, error: "Enter an API key first." };
  try {
    const headers =
      provider === "anthropic"
        ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
        : key
          ? { Authorization: `Bearer ${key}` }
          : {};
    const res = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(8000) });
    if (res.ok) return { ok: true };
    return { ok: false, error: res.status === 401 ? "Invalid API key." : `Server responded ${res.status}.` };
  } catch (err) {
    return { ok: false, error: err.name === "TimeoutError" ? "Timed out." : err.message };
  }
}

function permissions() {
  return {
    platform: process.platform,
    microphone: isMac ? systemPreferences.getMediaAccessStatus("microphone") : "granted",
    accessibility: isMac ? systemPreferences.isTrustedAccessibilityClient(false) : true,
  };
}

function registerIpc() {
  ipcMain.handle("settings:get", () => store.getSettings());
  ipcMain.handle("settings:set", (_e, patch) => {
    const prev = store.raw();
    const next = store.setSettings(patch);
    if ("launchAtLogin" in patch && patch.launchAtLogin !== prev.launchAtLogin) {
      try {
        app.setLoginItemSettings({ openAtLogin: Boolean(patch.launchAtLogin) });
      } catch {
        /* unsupported */
      }
    }
    if ("theme" in patch) {
      nativeTheme.themeSource = patch.theme;
      if (!isMac && mainWindow) {
        try {
          mainWindow.setTitleBarOverlay({ color: "#00000000", symbolColor: themeColors().fg, height: 48 });
        } catch {
          /* ignore */
        }
      }
    }
    broadcast("settings:changed", next);
    return next;
  });
  ipcMain.handle("settings:setKey", (_e, provider, value) => store.setKey(provider, String(value || "").trim()));
  ipcMain.handle("settings:test", testConnection);
  ipcMain.handle("hotkey:set", (_e, accel) => {
    const r = registerHotkey(accel);
    if (r.ok) {
      store.setSettings({ hotkey: accel });
      updateTray();
      broadcast("settings:changed", store.getSettings());
    }
    return r;
  });
  ipcMain.handle("hotkey:suspend", (_e, suspend) => {
    // Temporarily release the hotkey while the user records a new one.
    if (suspend && registeredHotkey) globalShortcut.unregister(registeredHotkey);
    else if (!suspend && registeredHotkey) registerHotkey(registeredHotkey);
  });

  ipcMain.handle("history:get", () => store.getHistory());
  ipcMain.handle("history:delete", (_e, id) => store.deleteHistory(id));
  ipcMain.handle("history:clear", () => store.clearHistory());
  ipcMain.handle("dictionary:get", () => store.getDictionary());
  ipcMain.handle("dictionary:set", (_e, list) => store.setDictionary(list));

  ipcMain.handle("dictation:toggle", () => toggleDictation());
  ipcMain.handle("dictation:cancel", () => cancelDictation());
  ipcMain.handle("dictation:getState", () => state);
  ipcMain.handle("dictation:process", processAudio);
  ipcMain.on("overlay:interactive", (_e, interactive) => {
    overlayWindow?.setIgnoreMouseEvents(!interactive, { forward: true });
  });
  ipcMain.on("dictation:recorderError", (_e, message) => {
    registerEscape(false);
    setState("error", message);
    hideOverlaySoon(3200);
  });

  ipcMain.handle("clipboard:write", (_e, text) => clipboard.writeText(String(text)));
  ipcMain.handle("permissions:get", permissions);
  ipcMain.handle("permissions:requestMic", async () => (isMac ? systemPreferences.askForMediaAccess("microphone") : true));
  ipcMain.handle("permissions:openAccessibility", () => {
    if (isMac) {
      systemPreferences.isTrustedAccessibilityClient(true);
      shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
    }
  });
  ipcMain.handle("app:openExternal", (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
  ipcMain.handle("app:info", () => ({ version: app.getVersion(), platform: process.platform }));
}

app.whenReady().then(() => {
  store = createStore(app, safeStorage);
  nativeTheme.themeSource = store.raw().theme || "system";
  if (isMac) app.dock?.setIcon?.(path.join(__dirname, "assets", "icon.png"));
  registerIpc();
  createMainWindow();
  createOverlayWindow();
  const r = registerHotkey(store.raw().hotkey);
  if (!r.ok) notify("Hotkey unavailable", r.error + " Choose another in Settings.");
  try {
    tray = new Tray(trayIcon());
    tray.on("click", () => (isMac ? tray.popUpContextMenu() : showMain()));
    updateTray();
  } catch {
    tray = null;
  }
});

app.on("second-instance", () => showMain());
app.on("activate", () => showMain());
app.on("before-quit", () => {
  quitting = true;
  store?.flush();
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  /* keep running in the tray */
});
