// Direct Win32 calls for pasting and for knowing which window you're typing in.
//
// This replaces the PowerShell helper, which was slow to start, could be blocked by
// antivirus or policy, and failed silently. Everything here runs in-process through
// koffi (a Node-API FFI, so it needs no rebuild for Electron). If koffi can't load,
// available() is false and paste.cjs falls back to PowerShell.

let api; // undefined: not loaded yet, false: unavailable, object: ready

const KEYEVENTF_KEYUP = 0x2;
const INPUT_KEYBOARD = 1;
const VK = { SHIFT: 0x10, CONTROL: 0x11, MENU: 0x12, LWIN: 0x5b, RWIN: 0x5c, V: 0x56 };
const SCAN = { CONTROL: 0x1d, V: 0x2f };
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const SW_RESTORE = 9;

function load() {
  if (api !== undefined) return api;
  api = false;
  if (process.platform !== "win32") return api;
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    const kernel32 = koffi.load("kernel32.dll");
    const HANDLE = koffi.pointer("HANDLE", koffi.opaque());
    const HWND = koffi.alias("HWND", HANDLE);
    const MOUSEINPUT = koffi.struct("ST_MOUSEINPUT", { dx: "long", dy: "long", mouseData: "uint32_t", dwFlags: "uint32_t", time: "uint32_t", dwExtraInfo: "uintptr_t" });
    const KEYBDINPUT = koffi.struct("ST_KEYBDINPUT", { wVk: "uint16_t", wScan: "uint16_t", dwFlags: "uint32_t", time: "uint32_t", dwExtraInfo: "uintptr_t" });
    const HARDWAREINPUT = koffi.struct("ST_HARDWAREINPUT", { uMsg: "uint32_t", wParamL: "uint16_t", wParamH: "uint16_t" });
    const INPUT = koffi.struct("ST_INPUT", { type: "uint32_t", u: koffi.union({ mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }) });
    api = {
      koffi,
      INPUT,
      GetForegroundWindow: user32.func("HWND __stdcall GetForegroundWindow()"),
      GetWindowThreadProcessId: user32.func("uint32_t __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *pid)"),
      GetWindowTextW: user32.func("int __stdcall GetWindowTextW(HWND hWnd, _Out_ uint16_t *buf, int max)"),
      IsWindow: user32.func("bool __stdcall IsWindow(HWND hWnd)"),
      IsIconic: user32.func("bool __stdcall IsIconic(HWND hWnd)"),
      ShowWindow: user32.func("bool __stdcall ShowWindow(HWND hWnd, int cmd)"),
      BringWindowToTop: user32.func("bool __stdcall BringWindowToTop(HWND hWnd)"),
      SetForegroundWindow: user32.func("bool __stdcall SetForegroundWindow(HWND hWnd)"),
      AttachThreadInput: user32.func("bool __stdcall AttachThreadInput(uint32_t idAttach, uint32_t idAttachTo, bool attach)"),
      GetAsyncKeyState: user32.func("int16_t __stdcall GetAsyncKeyState(int key)"),
      SendInput: user32.func("uint32_t __stdcall SendInput(uint32_t count, ST_INPUT *inputs, int size)"),
      GetCurrentThreadId: kernel32.func("uint32_t __stdcall GetCurrentThreadId()"),
      OpenProcess: kernel32.func("HANDLE __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)"),
      QueryFullProcessImageNameW: kernel32.func("bool __stdcall QueryFullProcessImageNameW(HANDLE h, uint32_t flags, _Out_ uint16_t *buf, _Inout_ uint32_t *size)"),
      CloseHandle: kernel32.func("bool __stdcall CloseHandle(HANDLE h)"),
    };
  } catch (err) {
    api = false;
    loadError = err;
  }
  return api;
}
let loadError = null;

const available = () => Boolean(load());
const address = (hwnd) => (hwnd ? Number(api.koffi.address(hwnd)) : 0);

function processName(pid) {
  const h = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (!h) return "";
  try {
    const buf = Buffer.alloc(1040);
    const size = [520];
    if (!api.QueryFullProcessImageNameW(h, 0, buf, size)) return "";
    const full = buf.toString("utf16le", 0, size[0] * 2);
    return full.split("\\").pop().replace(/\.exe$/i, "");
  } finally {
    api.CloseHandle(h);
  }
}

/** The window in front: { app, title, hwnd, handle, own } or null. `own` is a SayType window. */
function activeWindow() {
  if (!load()) return null;
  const handle = api.GetForegroundWindow();
  if (!handle) return null;
  const pid = [0];
  api.GetWindowThreadProcessId(handle, pid);
  const buf = Buffer.alloc(1024);
  const n = api.GetWindowTextW(handle, buf, 512);
  return {
    app: processName(pid[0]),
    title: buf.toString("utf16le", 0, Math.max(0, n) * 2),
    hwnd: address(handle),
    handle,
    own: pid[0] === process.pid,
  };
}

/**
 * Bring `target` back to the front if something else took over. Windows only lets the
 * foreground app hand over focus, so we briefly attach to its input queue to do so.
 * @returns {boolean} whether `target` is now in front
 */
function focus(target) {
  if (!load() || !target?.handle || !api.IsWindow(target.handle)) return false;
  const fg = api.GetForegroundWindow();
  if (address(fg) === target.hwnd) return true;
  const me = api.GetCurrentThreadId();
  const fgThread = fg ? api.GetWindowThreadProcessId(fg, [0]) : 0;
  const attached = fgThread && fgThread !== me ? api.AttachThreadInput(me, fgThread, true) : false;
  try {
    if (api.IsIconic(target.handle)) api.ShowWindow(target.handle, SW_RESTORE);
    api.BringWindowToTop(target.handle);
    api.SetForegroundWindow(target.handle);
  } finally {
    if (attached) api.AttachThreadInput(me, fgThread, false);
  }
  return address(api.GetForegroundWindow()) === target.hwnd;
}

const isDown = (vk) => (api.GetAsyncKeyState(vk) & 0x8000) !== 0;
const modifiersDown = () => [VK.SHIFT, VK.CONTROL, VK.MENU, VK.LWIN, VK.RWIN].some(isDown);

/** Wait (up to `ms`) for the user to let go of Shift/Ctrl/Alt/Win, e.g. from the dictation shortcut. */
async function waitForModifiers(ms = 700) {
  if (!load()) return;
  const end = Date.now() + ms;
  while (modifiersDown() && Date.now() < end) await new Promise((r) => setTimeout(r, 15));
}

function key(vk, scan, up) {
  return { type: INPUT_KEYBOARD, u: { ki: { wVk: vk, wScan: scan, dwFlags: up ? KEYEVENTF_KEYUP : 0, time: 0, dwExtraInfo: 0 } } };
}

/** Press Ctrl+V in the window in front. The four key events go in as one uninterruptible batch. */
async function pressPaste() {
  if (!load()) throw new Error("Native input unavailable.");
  await waitForModifiers();
  const events = [key(VK.CONTROL, SCAN.CONTROL, false), key(VK.V, SCAN.V, false), key(VK.V, SCAN.V, true), key(VK.CONTROL, SCAN.CONTROL, true)];
  const sent = api.SendInput(events.length, events, api.koffi.sizeof(api.INPUT));
  if (sent !== events.length) {
    // Windows blocks input into apps running as administrator from a normal app (UIPI).
    throw new Error("Windows blocked the paste. If that app runs as administrator, run SayType as administrator too.");
  }
}

module.exports = { available, activeWindow, focus, waitForModifiers, pressPaste, loadError: () => loadError };
