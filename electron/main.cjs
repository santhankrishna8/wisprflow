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
  net,
} = require("electron");
const path = require("node:path");
const crypto = require("node:crypto");
const { createStore, RETENTION_MS } = require("./store.cjs");
const ai = require("./ai.cjs");
const { isNewer } = require("./version.cjs");
const { pickAsset, downloadInstaller } = require("./updater.cjs");
const fs = require("node:fs");
const { pasteText, warmPaste, stopPasteHelper, activeWindow, lastPaste } = require("./paste.cjs");
const fmt = require("./format.cjs");
const { createLocalWhisper } = require("./localWhisper.cjs");

const isDev = process.env.NODE_ENV === "development";
const DEV_URL = "http://localhost:5173";
const isMac = process.platform === "darwin";

let store;
let local; // on-device whisper engine
let mainWindow = null;
let overlayWindow = null;
let bubbleWindow = null;
let bubbleDrag = null;
let tray = null;
let quitting = false;

// idle | recording | processing | done | error
let state = { status: "idle", message: "" };
let activeAbort = null;
let activeApp = Promise.resolve(null); // the window the user was typing in when dictation started
let updateInfo = null; // { version, url, canInstall, asset } when a newer release exists
let registeredHotkey = null;

/**
 * The app used to be called WisprFlow. Carry settings, history, saved keys and
 * downloaded models over to the new data folder the first time this version runs.
 */
function migrateUserData() {
  try {
    const next = app.getPath("userData");
    const prev = path.join(app.getPath("appData"), "WisprFlow");
    if (path.resolve(prev) === path.resolve(next) || !fs.existsSync(prev)) return;
    if (fs.existsSync(path.join(next, "saytype-data.json")) || fs.existsSync(path.join(next, "wisprflow-data.json"))) return;
    try {
      // Nothing of ours in the new folder yet: move the whole old folder into place.
      if (!fs.existsSync(next) || fs.readdirSync(next).length === 0) {
        fs.rmSync(next, { recursive: true, force: true });
        fs.renameSync(prev, next);
        return;
      }
    } catch {
      /* fall through to copying */
    }
    fs.mkdirSync(next, { recursive: true });
    for (const name of ["wisprflow-data.json", "Local State"]) {
      const from = path.join(prev, name);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(next, name));
    }
    const models = path.join(prev, "models");
    if (fs.existsSync(models) && !fs.existsSync(path.join(next, "models"))) fs.renameSync(models, path.join(next, "models"));
  } catch {
    /* start fresh rather than fail to launch */
  }
}
migrateUserData();

if (!app.requestSingleInstanceLock()) app.quit();

function load(win, page) {
  if (isDev) win.loadURL(`${DEV_URL}/${page}`);
  else win.loadFile(path.join(__dirname, "..", "dist", page));
}

function themeColors() {
  const s = store?.raw();
  const dark = s?.theme === "dark" || (s?.theme !== "light" && nativeTheme.shouldUseDarkColors);
  return dark ? { bg: "#071c1f", fg: "#e9f1f0" } : { bg: "#f7f9f8", fg: "#06525c" };
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
    title: "SayType",
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
  // When launched at login, start quietly in the tray (unless first-run onboarding is pending).
  const startHidden = process.argv.includes("--hidden") && store.raw().onboarded;
  mainWindow.once("ready-to-show", () => {
    if (!startHidden) mainWindow.show();
  });
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

// ---------- Edge handle ----------
// A slim handle rests at the screen edge. One click starts dictation and the
// handle grows into a pill; when dictation ends it shrinks back. The window
// never changes size (so the change can be animated): while it shows only the
// handle, clicks on the empty part of the window pass through to the app below.
const BUBBLE = { width: 52, height: 150 };
const EDGE_MARGIN = 0;
let bubbleHover = false; // the pointer is on the handle itself

function defaultBubblePosition() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - BUBBLE.width - EDGE_MARGIN,
    y: Math.round(workArea.y + workArea.height * 0.5 - BUBBLE.height / 2),
  };
}

/** Keep the pill fully on a screen; optionally snap it to the nearest side edge. */
function clampBubble({ x, y }, snap) {
  const centre = { x: x + BUBBLE.width / 2, y: y + BUBBLE.height / 2 };
  const { workArea: wa } = screen.getDisplayNearestPoint(centre);
  let nx = Math.min(Math.max(x, wa.x), wa.x + wa.width - BUBBLE.width);
  const ny = Math.min(Math.max(y, wa.y), wa.y + wa.height - BUBBLE.height);
  if (snap) {
    nx = centre.x < wa.x + wa.width / 2 ? wa.x + EDGE_MARGIN : wa.x + wa.width - BUBBLE.width - EDGE_MARGIN;
  }
  return { x: Math.round(nx), y: Math.round(ny) };
}

/** Where the pill (or its tucked-away tab) belongs right now. */
function bubbleLayout() {
  const s = store.raw();
  const saved = s.bubblePosition && Number.isFinite(s.bubblePosition.x) && Number.isFinite(s.bubblePosition.y) ? s.bubblePosition : defaultBubblePosition();
  const pos = clampBubble(saved, false);
  const { workArea: wa } = screen.getDisplayNearestPoint({ x: pos.x + BUBBLE.width / 2, y: pos.y + BUBBLE.height / 2 });
  const side = pos.x + BUBBLE.width / 2 < wa.x + wa.width / 2 ? "left" : "right";
  return { bounds: { ...pos, ...BUBBLE }, side, collapsed: Boolean(s.bubbleCollapsed) };
}

function applyBubbleLayout() {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) return;
  const layout = bubbleLayout();
  bubbleWindow.setBounds(layout.bounds);
  // Click-through needs forwarded mouse moves to notice the pointer reaching the handle; Linux has none.
  if (process.platform !== "linux") bubbleWindow.setIgnoreMouseEvents(layout.collapsed && !bubbleHover, { forward: true });
  bubbleWindow.webContents.send("bubble:layout", { side: layout.side, collapsed: layout.collapsed });
}

function createBubbleWindow() {
  const { bounds } = bubbleLayout();
  bubbleWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false, // clicking it must never steal focus from the app you're typing in
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: "#00000000",
    ...(isMac ? { type: "panel" } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  bubbleWindow.setAlwaysOnTop(true, "screen-saver");
  bubbleWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  load(bubbleWindow, "bubble.html");
  bubbleWindow.once("ready-to-show", () => {
    if (store.raw().showBubble && store.raw().onboarded) {
      applyBubbleLayout(); // Windows can ignore the size given at creation: set it again once shown
      bubbleWindow.showInactive();
      bubbleWindow.setAlwaysOnTop(true, "screen-saver");
      applyBubbleLayout();
    }
  });
  bubbleWindow.on("closed", () => (bubbleWindow = null));
}

function setBubbleVisible(visible) {
  if (visible) {
    if (!bubbleWindow || bubbleWindow.isDestroyed()) {
      createBubbleWindow();
      return;
    }
    applyBubbleLayout(); // also pulls it back if its saved spot is no longer on a screen
    bubbleWindow.showInactive();
    bubbleWindow.setAlwaysOnTop(true, "screen-saver");
  } else {
    bubbleWindow?.hide();
  }
}

function setBubbleCollapsed(collapsed) {
  store.setSettings({ bubbleCollapsed: Boolean(collapsed) });
  applyBubbleLayout();
  broadcast("settings:changed", store.getSettings());
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
  for (const w of [mainWindow, overlayWindow, bubbleWindow]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function setState(status, message = "") {
  state = { status, message };
  // Esc cancels both recording and transcription.
  registerEscape(status === "recording" || status === "processing");
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
  warmPaste();
  const s = store.raw();
  // Note which window is in front now, while the user is still in it: the text goes back
  // there, and (unless turned off in Settings) its app and title shape the formatting.
  activeApp = activeWindow();
  overlayWindow.webContents.send("dictation:start", {
    micDeviceId: s.micDeviceId,
    sounds: s.soundEffects,
    wav: s.sttProvider === "local", // whisper.cpp wants 16 kHz WAV
  });
  // Load the local model while the user is still speaking.
  if (s.sttProvider === "local") local.ensureServer(s.localModel).catch(() => {});
}

function stopDictation() {
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
  else if (state.status === "processing") cancelDictation();
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
    const language = fmt.normalizeLanguage(settings.language);
    const win = await Promise.race([activeApp, new Promise((r) => setTimeout(() => r(null), 800))]);
    const context = { ...fmt.resolveContext(settings, win), role: settings.role, about: settings.aboutYou, language };
    const terms = [
      ...dictionary.map((d) => d.to || d.word).filter(Boolean),
      ...(context.kind === "code" || settings.role === "developer" ? fmt.DEV_VOCAB : []),
    ];
    const promptFor = (l) => fmt.sttPrompt({ language: l, terms });
    let raw;
    if (settings.sttProvider === "local") {
      const r = await local.transcribe({
        wav: Buffer.from(audio),
        modelId: settings.localModel,
        language,
        allowed: fmt.LANGUAGE_CODES,
        promptFor,
        signal: abort.signal,
      });
      raw = r.text;
      if (r.language !== "auto") context.language = r.language;
    } else {
      raw = await ai.transcribe({
        audio: Buffer.from(audio),
        mimeType,
        settings: { ...settings, language },
        apiKey: store.getKey(settings.sttProvider),
        prompt: promptFor(language),
        signal: abort.signal,
      });
    }
    raw = ai.applyDictionary(raw, dictionary);
    if (!raw) throw new Error("No speech detected.");

    const verbatim = settings.tone === "verbatim";
    // Offline formatting first, so it applies even with no AI key.
    let text = !verbatim && settings.smartFormat !== false ? ai.applyDictionary(fmt.formatOffline(raw, context), dictionary) : raw;
    const formatted = text;
    let cleanupError = null;
    // Skip the AI polish quietly when its provider has no key yet (e.g. fully local setups).
    const cleanupReady = settings.llmProvider === "custom" ? Boolean(settings.llmBaseUrl) : Boolean(store.getKey(settings.llmProvider));
    if (settings.cleanupEnabled && !verbatim && cleanupReady) {
      try {
        text = ai.applyDictionary(
          await ai.cleanup({
            text: formatted,
            settings,
            apiKey: store.getKey(settings.llmProvider),
            dictionary,
            context,
            signal: abort.signal,
          }),
          dictionary
        );
      } catch (err) {
        if (abort.signal.aborted) throw err;
        cleanupError = err.message;
        text = formatted;
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
      context: context.kind,
    });
    broadcast("history:added", entry);
    pruneHistory();

    // Paste first, then report what really happened (the overlay used to say "Pasted" before pasting).
    let message = settings.autoPaste ? "Pasted" : "Copied";
    if (settings.autoPaste) {
      try {
        await pasteText(clipboard, text, { restore: settings.restoreClipboard, target: win });
      } catch (err) {
        await clipboard.writeText(text);
        message = /blocked/.test(err.message) ? "Windows blocked the paste — press Ctrl+V" : "Couldn't paste — press Ctrl+V";
        notify("Copied to clipboard", err.message);
      }
    } else {
      await clipboard.writeText(text);
    }
    if (cleanupError && message === "Pasted") message = "Pasted without AI polish";
    setState("done", message);
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

/** Delete history older than the user's retention setting and tell the UI. */
function pruneHistory() {
  const removed = store.pruneHistory(RETENTION_MS[store.raw().historyRetention] || 0);
  if (removed) broadcast("history:replaced", store.getHistory());
}

const RELEASES_API = "https://api.github.com/repos/santhankrishna8/wisprflow/releases/latest";
const RELEASES_PAGE = "https://github.com/santhankrishna8/wisprflow/releases/latest";
const INSTALLER_NAME = "SayType-Setup.exe";
let updateJob = null; // AbortController while the installer downloads

/** What the interface may see of the update (never the download details). */
function publicUpdate() {
  return updateInfo ? { version: updateInfo.version, url: updateInfo.url, canInstall: updateInfo.canInstall } : null;
}

/**
 * Ask GitHub for the latest release. Sends nothing about you. The daily background check
 * can be turned off in Settings; "Check now" always works.
 * @returns {Promise<{ok: boolean, update: object|null, error?: string}>}
 */
async function checkForUpdate({ manual = false } = {}) {
  if (!manual && !store.raw().checkUpdates) return { ok: true, update: publicUpdate() };
  try {
    const res = await net.fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, update: publicUpdate(), error: `GitHub answered ${res.status}.` };
    const j = await res.json();
    const version = String(j.tag_name || "").replace(/^v/, "");
    if (isNewer(version, app.getVersion())) {
      if (updateInfo?.version !== version) {
        const asset = pickAsset(j, INSTALLER_NAME);
        updateInfo = {
          version,
          url: String(j.html_url || RELEASES_PAGE),
          canInstall: process.platform === "win32" && app.isPackaged && Boolean(asset),
          asset,
        };
        broadcast("update:available", publicUpdate());
        updateTray();
      }
    } else if (updateInfo) {
      updateInfo = null;
      broadcast("update:available", null);
      updateTray();
    }
    return { ok: true, update: publicUpdate() };
  } catch (err) {
    return { ok: false, update: publicUpdate(), error: err.name === "TimeoutError" ? "Timed out reaching GitHub." : "Couldn't reach GitHub." };
  }
}

function updateProgress(p) {
  broadcast("update:progress", p);
}

/**
 * Download the new installer inside the app, check it, run it quietly and restart.
 * Where that isn't possible (not Windows, a dev build) the release page opens instead.
 */
async function installUpdate() {
  if (!updateInfo) return { ok: false, error: "No update to install." };
  if (!updateInfo.canInstall) {
    shell.openExternal(updateInfo.url);
    return { ok: true, openedPage: true };
  }
  if (updateJob) return { ok: false, error: "Already downloading." };
  const { asset, version } = updateInfo;
  const dir = path.join(app.getPath("temp"), "saytype-update");
  const file = path.join(dir, `SayType-Setup-${version}.exe`);
  const abort = new AbortController();
  updateJob = abort;
  try {
    fs.mkdirSync(dir, { recursive: true });
    updateProgress({ phase: "downloading", received: 0, total: asset.size });
    await downloadInstaller({
      asset,
      file,
      fetchImpl: (url, opts) => net.fetch(url, opts),
      signal: abort.signal,
      onProgress: (p) => updateProgress({ phase: "downloading", ...p }),
    });

    updateProgress({ phase: "installing" });
    // Let go of everything the installer needs to replace, then hand over and quit.
    quitting = true;
    store?.flush();
    await local?.stop();
    stopPasteHelper();
    globalShortcut.unregisterAll();
    // /S installs quietly over the current version; --force-run starts the new one afterwards.
    require("node:child_process").spawn(file, ["/S", "--updated", "--force-run"], { detached: true, stdio: "ignore", windowsHide: false }).unref();
    setTimeout(() => app.quit(), 500);
    return { ok: true };
  } catch (err) {
    const message = abort.signal.aborted ? "Cancelled." : err.message;
    updateProgress({ phase: "error", error: message });
    return { ok: false, error: message };
  } finally {
    updateJob = null;
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
  tray.setToolTip(recording ? "SayType — listening…" : "SayType");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: recording ? "Stop dictation" : "Start dictation", accelerator: registeredHotkey || undefined, click: toggleDictation },
      { type: "separator" },
      ...(updateInfo
        ? [{ label: updateInfo.canInstall ? `Install update — v${updateInfo.version}` : `Update available — v${updateInfo.version}`, click: () => (showMain("home"), installUpdate()) }]
        : []),
      { label: "Open SayType", click: showMain },
      {
        label: "Show edge handle",
        type: "checkbox",
        checked: Boolean(store.raw().showBubble),
        click: (item) => {
          // Turning it on from here opens the pill so it's easy to spot; it tucks away again by itself.
          store.setSettings({ showBubble: item.checked, ...(item.checked ? { bubbleCollapsed: false } : {}) });
          setBubbleVisible(item.checked && store.raw().onboarded);
          broadcast("settings:changed", store.getSettings());
          updateTray();
        },
      },
      {
        label: "Language",
        submenu: [["auto", "Detect (English + Indian languages)"], ...fmt.LANGUAGE_CODES.map((c) => [c, fmt.LANGUAGES[c].name])].map(([code, label]) => ({
          label,
          type: "radio",
          checked: fmt.normalizeLanguage(store.raw().language) === code,
          click: () => {
            store.setSettings({ language: code });
            broadcast("settings:changed", store.getSettings());
            updateTray();
          },
        })),
      },
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
  if (kind === "stt" && s.sttProvider === "local") {
    try {
      const t0 = Date.now();
      await local.ensureServer(s.localModel);
      return { ok: true, message: `Engine ready in ${((Date.now() - t0) / 1000).toFixed(1)}s` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  const provider = kind === "stt" ? s.sttProvider : s.llmProvider;
  const key = store.getKey(provider);
  const bases = ai.LLM_ENDPOINTS;
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

function loginItem(open) {
  return { openAtLogin: open, args: ["--hidden"] };
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
        app.setLoginItemSettings(loginItem(Boolean(patch.launchAtLogin)));
      } catch {
        /* unsupported */
      }
    }
    if (("localModel" in patch && patch.localModel !== prev.localModel) || (patch.sttProvider && patch.sttProvider !== "local")) {
      local.stop();
    }
    if ("historyRetention" in patch) pruneHistory();
    if (patch.checkUpdates) checkForUpdate();
    if ("showBubble" in patch || "onboarded" in patch) {
      // Switching it on in Settings brings back the full pill, not the tucked-away tab.
      if (patch.showBubble && !prev.showBubble) store.setSettings({ bubbleCollapsed: false });
      setBubbleVisible(store.raw().showBubble && store.raw().onboarded);
      updateTray();
    } else if ("bubbleCollapsed" in patch) {
      applyBubbleLayout();
    }
    if ("language" in patch) updateTray();
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
    const current = store.getSettings();
    broadcast("settings:changed", current);
    return current;
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
  // Drag is tracked in the main process with the real cursor position, which
  // stays correct across displays and DPI scales.
  ipcMain.on("bubble:dragStart", () => {
    if (!bubbleWindow) return;
    const [wx, wy] = bubbleWindow.getPosition();
    const c = screen.getCursorScreenPoint();
    bubbleDrag = { dx: c.x - wx, dy: c.y - wy, startX: c.x, startY: c.y, moved: false };
  });
  ipcMain.on("bubble:dragMove", () => {
    if (!bubbleWindow || !bubbleDrag) return;
    const c = screen.getCursorScreenPoint();
    if (!bubbleDrag.moved && Math.hypot(c.x - bubbleDrag.startX, c.y - bubbleDrag.startY) < 4) return;
    bubbleDrag.moved = true;
    bubbleWindow.setBounds({ ...clampBubble({ x: c.x - bubbleDrag.dx, y: c.y - bubbleDrag.dy }, false), ...BUBBLE });
  });
  ipcMain.handle("bubble:dragEnd", () => {
    const drag = bubbleDrag;
    bubbleDrag = null;
    if (!bubbleWindow || !drag) return { moved: false };
    if (!drag.moved) {
      // One click on the handle both opens the pill and starts listening.
      if (store.raw().bubbleCollapsed && state.status !== "recording" && state.status !== "processing") setBubbleCollapsed(false);
      toggleDictation();
      return { moved: false };
    }
    const [x, y] = bubbleWindow.getPosition();
    store.setSettings({ bubblePosition: clampBubble({ x, y }, true) });
    applyBubbleLayout();
    return { moved: true };
  });
  ipcMain.handle("bubble:setCollapsed", (_e, collapsed) => setBubbleCollapsed(collapsed));
  ipcMain.on("bubble:interactive", (_e, on) => {
    bubbleHover = Boolean(on);
    applyBubbleLayout();
  });
  ipcMain.handle("bubble:getLayout", () => {
    const { side, collapsed } = bubbleLayout();
    return { side, collapsed };
  });

  ipcMain.on("overlay:interactive", (_e, interactive) => {
    overlayWindow?.setIgnoreMouseEvents(!interactive, { forward: true });
  });
  ipcMain.on("dictation:recorderError", (_e, message) => {
    registerEscape(false);
    setState("error", message);
    hideOverlaySoon(3200);
  });

  ipcMain.handle("local:info", () => ({ available: local.engineAvailable(), running: local.isRunning(), model: local.runningModel() }));
  ipcMain.handle("local:list", () => local.listModels());
  ipcMain.handle("local:download", async (e, id) => {
    try {
      return await local.downloadModel(id, (p) => {
        if (!e.sender.isDestroyed()) e.sender.send("local:progress", p);
      });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle("local:cancel", (_e, id) => local.cancelDownload(id));
  ipcMain.handle("local:delete", (_e, id) => local.deleteModel(id));

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
  ipcMain.handle("paste:last", () => lastPaste());
  ipcMain.handle("update:get", publicUpdate);
  ipcMain.handle("update:check", () => checkForUpdate({ manual: true }));
  ipcMain.handle("update:install", installUpdate);
  ipcMain.handle("app:info", () => ({ version: app.getVersion(), platform: process.platform }));
}

app.whenReady().then(() => {
  store = createStore(app, safeStorage);
  local = createLocalWhisper({
    binDir: app.isPackaged
      ? path.join(process.resourcesPath, "whisper")
      : path.join(__dirname, "..", "vendor", "whisper", `${process.platform}-${process.arch}`),
    modelsDir: path.join(app.getPath("userData"), "models"),
    fetchImpl: (url, opts) => net.fetch(url, opts),
  });
  store.setSettings({ bubbleCollapsed: true }); // the pill always starts tucked into the edge
  nativeTheme.themeSource = store.raw().theme || "system";
  if (store.raw().launchAtLogin) {
    try {
      app.setLoginItemSettings(loginItem(true)); // refresh entries created before --hidden existed
    } catch {
      /* unsupported */
    }
  }
  if (isMac) app.dock?.setIcon?.(path.join(__dirname, "assets", "icon.png"));
  registerIpc();
  createMainWindow();
  createOverlayWindow();
  createBubbleWindow();
  pruneHistory();
  setInterval(pruneHistory, 5 * 60_000).unref?.();
  setTimeout(checkForUpdate, 15_000).unref?.();
  setInterval(checkForUpdate, 24 * 3600_000).unref?.();
  screen.on("display-metrics-changed", () => applyBubbleLayout());
  screen.on("display-removed", () => {
    applyBubbleLayout();
  });
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
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopPasteHelper();
  local?.stop();
});
app.on("window-all-closed", () => {
  /* keep running in the tray */
});
