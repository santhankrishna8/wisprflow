#!/usr/bin/env node
// Run with Electron: `electron scripts/smoke-paste.cjs`.
// Proves the app's real paste, end to end, with Electron's real clipboard: pasteText()
// saves the clipboard, writes English + Telugu text, brings the target window back and
// presses Ctrl+V; then Notepad's text is read back. On other systems it only checks that
// the clipboard save/restore runs against the real Electron clipboard.
const { spawn } = require("node:child_process");
const win32 = require("../electron/win32.cjs");
const fs = require("node:fs");
const path = require("node:path");
const { app, clipboard } = require("electron");
const { pasteText, stopPasteHelper, snapshot, lastPaste } = require("../electron/paste.cjs");

// Electron on Windows has no console in CI: also write everything to a log file.
const LOG = path.join(__dirname, "..", "paste-smoke.log");
fs.rmSync(LOG, { force: true });
for (const k of ["log", "error"]) {
  const orig = console[k].bind(console);
  console[k] = (...a) => (fs.appendFileSync(LOG, a.join(" ") + "\n"), orig(...a));
}
const koffi = require("koffi");

const TEXT = "SayType paste test తెలుగు " + Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await app.whenReady();
  console.log("Electron", process.versions.electron, "clipboard API:", Object.keys(clipboard).join(","));
  clipboard.writeText("what the user had copied");
  const saved = snapshot(clipboard); // must not throw on any platform
  if (process.platform !== "win32") return console.log("Not Windows: clipboard save ran without error, paste skipped.", JSON.stringify(saved));
  if (saved?.text !== "what the user had copied") throw new Error("Could not read the clipboard back.");
  if (!win32.available()) throw new Error(`Native input failed to load: ${win32.loadError()?.message}`);
  const user32 = koffi.load("user32.dll");
  const HWND = koffi.pointer("SMOKE_HWND", koffi.opaque());
  const FindWindowW = user32.func("SMOKE_HWND __stdcall FindWindowW(const char16_t *cls, const char16_t *title)");
  const FindWindowExW = user32.func("SMOKE_HWND __stdcall FindWindowExW(SMOKE_HWND parent, SMOKE_HWND after, const char16_t *cls, const char16_t *title)");
  const SendMessageW = user32.func("intptr_t __stdcall SendMessageW(SMOKE_HWND h, uint32_t msg, uintptr_t w, _Out_ uint16_t *l)");
  const SendMessageLen = user32.func("SendMessageW", "intptr_t", [HWND, "uint32_t", "uintptr_t", "intptr_t"]);

  const notepad = spawn("notepad.exe", [], { detached: false });
  try {
    let hwnd = null;
    for (let i = 0; i < 50 && !hwnd; i++) {
      await sleep(200);
      hwnd = FindWindowW("Notepad", null);
    }
    if (!hwnd) throw new Error("Notepad window not found.");
    const edit = FindWindowExW(hwnd, null, "Edit", null) || FindWindowExW(hwnd, null, "RichEditD2DPT", null);
    if (!edit) throw new Error("Notepad's text box not found.");
    const target = { handle: hwnd, hwnd: Number(koffi.address(hwnd)) };
    console.log("Notepad in front:", win32.focus(target), "| front window now:", win32.activeWindow()?.app);

    console.log("Focused again before paste:", win32.focus(target));
    // Take the focus away first, as happens when another window pops up while transcribing.
    const other = spawn("notepad.exe", [], { detached: false });
    await sleep(1500);
    console.log("Front window before paste:", win32.activeWindow()?.title);
    try {
      await pasteText(clipboard, TEXT, { restore: true, target: { ...target, app: "notepad" } });
    } finally {
      other.kill();
    }
    console.log("Paste report:", JSON.stringify(lastPaste()));
    await sleep(800);

    const len = Number(SendMessageLen(edit, 0x000e, 0, 0)); // WM_GETTEXTLENGTH
    const buf = Buffer.alloc((len + 1) * 2);
    SendMessageW(edit, 0x000d, len + 1, buf); // WM_GETTEXT
    const got = buf.toString("utf16le", 0, len * 2);
    console.log(`Notepad contains: ${JSON.stringify(got)}`);
    if (!got.includes(TEXT)) throw new Error("The text did not arrive in Notepad.");
    await sleep(1800);
    if (clipboard.readText() !== "what the user had copied") throw new Error("The previous clipboard text was not restored.");
    console.log("Paste smoke test passed (and the old clipboard came back).");
  } finally {
    stopPasteHelper();
    notepad.kill();
  }
}

main().then(
  () => app.exit(0),
  (err) => {
    console.error(`Paste smoke test FAILED: ${err.stack || err.message}`);
    app.exit(1);
  }
);
