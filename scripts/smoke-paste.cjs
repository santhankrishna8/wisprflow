#!/usr/bin/env node
// Windows only: proves the paste path really types into another app.
// Opens Notepad, puts text (English + Telugu) on the clipboard, takes the focus away,
// then uses electron/win32.cjs exactly as the app does: bring Notepad back, press Ctrl+V,
// and read Notepad's text to check it arrived.
const { spawn, execFileSync } = require("node:child_process");
const win32 = require("../electron/win32.cjs");
const koffi = require("koffi");

const TEXT = "SayType paste test తెలుగు " + Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (process.platform !== "win32") return console.log("Not Windows: skipped.");
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

    execFileSync("powershell", ["-NoProfile", "-Command", `Set-Clipboard -Value '${TEXT}'`]);
    console.log("Focused again before paste:", win32.focus(target));
    await win32.pressPaste();
    await sleep(800);

    const len = Number(SendMessageLen(edit, 0x000e, 0, 0)); // WM_GETTEXTLENGTH
    const buf = Buffer.alloc((len + 1) * 2);
    SendMessageW(edit, 0x000d, len + 1, buf); // WM_GETTEXT
    const got = buf.toString("utf16le", 0, len * 2);
    console.log(`Notepad contains: ${JSON.stringify(got)}`);
    if (!got.includes(TEXT)) throw new Error("The text did not arrive in Notepad.");
    console.log("Paste smoke test passed.");
  } finally {
    notepad.kill();
  }
}

main().catch((err) => {
  console.error(`Paste smoke test FAILED: ${err.message}`);
  process.exit(1);
});
