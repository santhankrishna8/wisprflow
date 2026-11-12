// Put text on the clipboard and simulate the paste shortcut in the focused app.
//
// Windows: first choice is a direct SendInput Ctrl+V (win32.cjs), after making sure the
// window you were typing in is in front. If that can't be used, a PowerShell SendKeys
// helper does it. Every attempt is recorded (lastPaste) so failures can be diagnosed.
const { execFile, spawn } = require("node:child_process");
const win32 = require("./win32.cjs");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 4000 }, (err) => (err ? reject(err) : resolve()));
  });
}

// Starting PowerShell costs ~300-700 ms, so on Windows we keep one helper alive
// (started while you speak) and just send it a line per paste. It exits when idle.
let ps = null; // { proc, waiting: Array<{resolve, reject}>, idle: Timeout }
const PS_IDLE_MS = 3 * 60_000;

function psHelper() {
  if (ps && ps.proc.exitCode === null && !ps.proc.killed) return ps;
  const proc = spawn("powershell", ["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", "-"], {
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });
  const h = { proc, waiting: [], idle: null, buf: "" };
  const fail = (err) => {
    for (const w of h.waiting.splice(0)) w.reject(err);
    if (ps === h) ps = null;
  };
  proc.stdout.on("data", (d) => {
    h.buf += d;
    let i;
    while ((i = h.buf.indexOf("\n")) >= 0) {
      const line = h.buf.slice(0, i).trim();
      h.buf = h.buf.slice(i + 1);
      if (line === "wf-ok") h.waiting.shift()?.resolve();
    }
  });
  proc.on("error", fail);
  proc.on("exit", () => fail(new Error("paste helper exited")));
  proc.stdin.on("error", () => {});
  proc.stdin.write("$w = New-Object -ComObject WScript.Shell\n");
  ps = h;
  return h;
}

/** Pre-start the Windows paste helper so the first paste isn't slow. */
function warmPaste() {
  if (process.platform !== "win32") return;
  try {
    psHelper();
  } catch {
    /* fall back to one-shot at paste time */
  }
}

async function keyViaHelper(key) {
  const h = psHelper();
  clearTimeout(h.idle);
  h.idle = setTimeout(() => h.proc.kill(), PS_IDLE_MS);
  h.idle.unref?.();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("paste helper timed out")), 4000);
    h.waiting.push({ resolve: () => (clearTimeout(timer), resolve()), reject: (e) => (clearTimeout(timer), reject(e)) });
    h.proc.stdin.write(`$w.SendKeys('^${key}'); 'wf-ok'\n`);
  });
}

let last = null; // what happened on the most recent paste, for Settings -> About
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @param {{handle?: unknown, hwnd?: number, app?: string, own?: boolean}|null} [target] the window dictation started in */
async function simulatePaste(target) {
  last = { at: new Date().toISOString(), platform: process.platform, method: "", target: target?.app || "", front: "", refocused: false, error: "" };
  if (process.platform === "win32" && win32.available()) {
    try {
      const front = win32.activeWindow();
      last.front = front?.own ? "SayType" : front?.app || "(none)";
      // If something else (or SayType itself) is in front, go back to where you were typing.
      if (target?.handle && !target.own && (!front || front.hwnd !== target.hwnd)) {
        last.refocused = win32.focus(target);
        await sleep(120);
        last.front += ` -> ${win32.activeWindow()?.app || "(none)"}`;
      }
      await win32.pressPaste();
      last.method = "SendInput";
      return;
    } catch (err) {
      last.error = `SendInput: ${err.message}`;
      if (/blocked/.test(err.message)) throw err;
    }
  }
  last.method = process.platform === "win32" ? "PowerShell" : "system";
  try {
    await legacyPaste();
  } catch (err) {
    last.error = `${last.error ? last.error + "; " : ""}${last.method}: ${err.message}`;
    throw err;
  }
}

/** Send Ctrl/Cmd + key ("v" paste, "c" copy) with the platform's own tools. */
async function legacyPaste(key = "v") {
  if (process.platform === "darwin") {
    await run("osascript", ["-e", `tell application "System Events" to keystroke "${key}" using command down`]);
    return;
  }
  if (process.platform === "win32") {
    try {
      await keyViaHelper(key);
      return;
    } catch {
      try {
        ps?.proc.kill();
      } catch {
        /* ignore */
      }
      ps = null;
    }
    await run("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(New-Object -ComObject WScript.Shell).SendKeys('^${key}')`,
    ]);
    return;
  }
  // Linux: try Wayland and X11 tools in order.
  const wayland = Boolean(process.env.WAYLAND_DISPLAY);
  const code = key === "c" ? "46" : "47"; // evdev key codes for ydotool
  const attempts = wayland
    ? [["wtype", ["-M", "ctrl", key, "-m", "ctrl"]], ["ydotool", ["key", "29:1", `${code}:1`, `${code}:0`, "29:0"]], ["xdotool", ["key", "--clearmodifiers", `ctrl+${key}`]]]
    : [["xdotool", ["key", "--clearmodifiers", `ctrl+${key}`]], ["ydotool", ["key", "29:1", `${code}:1`, `${code}:0`, "29:0"]]];
  let lastErr;
  for (const [cmd, args] of attempts) {
    try {
      await run(cmd, args);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Couldn't simulate ${key === "c" ? "copy" : "paste"} (install ${wayland ? "wtype or ydotool" : "xdotool"}).${key === "c" ? "" : " Text is on your clipboard."}`
  );
}

// Electron 45's clipboard is asynchronous and text-only: readText() and writeText()
// return promises (readHTML, readRTF and readImage are gone). Everything here awaits
// them, and also works with a synchronous clipboard.

/**
 * Remember the text you had copied, so it can be put back after pasting.
 * Never throws: failing to save the old clipboard is no reason not to paste.
 */
async function snapshot(clipboard) {
  try {
    const text = await clipboard.readText();
    return typeof text === "string" && text ? { text } : null;
  } catch {
    return null;
  }
}

/** Put the remembered text back, unless the clipboard changed again in the meantime. */
async function restoreSnapshot(clipboard, previous, pasted) {
  try {
    if (previous && (await clipboard.readText()) === pasted) await clipboard.writeText(previous.text);
  } catch {
    /* leave the dictated text on the clipboard */
  }
}

/**
 * @param {{restore?: boolean, target?: object|null}} [opts]  target: the window dictation started in
 */
async function pasteText(clipboard, text, { restore = true, target = null } = {}) {
  const previous = restore ? await snapshot(clipboard) : null;
  await clipboard.writeText(text); // must have landed before Ctrl+V is pressed
  await sleep(60);
  await simulatePaste(target);
  if (restore && previous) {
    // Some apps read the clipboard a moment after Ctrl+V.
    setTimeout(() => restoreSnapshot(clipboard, previous, text), 1500).unref?.();
  }
}

async function simulateCopy() {
  if (process.platform === "win32" && win32.available()) {
    try {
      await win32.pressCopy();
      return;
    } catch (err) {
      if (/blocked/.test(err.message)) throw err;
    }
  }
  await legacyPaste("c");
}

/**
 * Read the text currently selected in the focused app by pressing Copy, then put the
 * user's clipboard back as it was (text only, like the rest of paste.cjs).
 * Returns "" when nothing was selected.
 */
async function copySelection(clipboard) {
  const previous = await snapshot(clipboard);
  const probe = `saytype-selection-probe-${Date.now()}`;
  await clipboard.writeText(probe);
  try {
    await sleep(40);
    await simulateCopy();
    let text = probe;
    for (let i = 0; i < 12 && text === probe; i++) {
      await sleep(50);
      text = await clipboard.readText();
    }
    return text === probe ? "" : text;
  } finally {
    try {
      await clipboard.writeText(previous ? previous.text : "");
    } catch {
      /* leave the clipboard as it is */
    }
  }
}

/** Stop the helper (app quit). */
function stopPasteHelper() {
  try {
    ps?.proc.kill();
  } catch {
    /* ignore */
  }
  ps = null;
}

function capture(cmd, args, timeout = 1500) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout) => resolve(err ? "" : String(stdout).trim()));
  });
}

/**
 * The app the user is typing in, { app, title }, used only to choose a format.
 * Never throws, never blocks dictation, and is independent of pasting.
 */
async function activeWindow() {
  try {
    if (process.platform === "win32") return win32.activeWindow();
    if (process.platform === "darwin") {
      const out = await capture("osascript", [
        "-e",
        'tell application "System Events"\nset p to first application process whose frontmost is true\nset n to name of p\nset t to ""\ntry\nset t to name of front window of p\nend try\nreturn n & tab & t\nend tell',
      ]);
      const [app, title = ""] = out.split("\t");
      return app ? { app, title } : null;
    }
    const title = await capture("xdotool", ["getactivewindow", "getwindowname"]);
    const app = await capture("xdotool", ["getactivewindow", "getwindowclassname"]);
    return app || title ? { app, title } : null;
  } catch {
    return null;
  }
}

module.exports = { pasteText, copySelection, warmPaste, stopPasteHelper, activeWindow, simulatePaste, lastPaste: () => last, snapshot, restoreSnapshot };
