// Read-only Win32 calls: which window is in front (for app-aware formatting).
// Runs in-process through koffi (a Node-API FFI, so no rebuild for Electron), so it
// can't interfere with pasting, which stays in paste.cjs. If koffi can't load,
// activeWindow() returns null and formatting simply doesn't adapt to the app.

let api; // undefined: not loaded yet, false: unavailable, object: ready

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
    api = {
      koffi,
      GetForegroundWindow: user32.func("HWND __stdcall GetForegroundWindow()"),
      GetWindowThreadProcessId: user32.func("uint32_t __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *pid)"),
      GetWindowTextW: user32.func("int __stdcall GetWindowTextW(HWND hWnd, _Out_ uint16_t *buf, int max)"),
      IsWindow: user32.func("bool __stdcall IsWindow(HWND hWnd)"),
      IsIconic: user32.func("bool __stdcall IsIconic(HWND hWnd)"),
      ShowWindow: user32.func("bool __stdcall ShowWindow(HWND hWnd, int cmd)"),
      BringWindowToTop: user32.func("bool __stdcall BringWindowToTop(HWND hWnd)"),
      SetForegroundWindow: user32.func("bool __stdcall SetForegroundWindow(HWND hWnd)"),
      AttachThreadInput: user32.func("bool __stdcall AttachThreadInput(uint32_t idAttach, uint32_t idAttachTo, bool attach)"),
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
 * Bring `target` to the front (used by the paste smoke test to put Notepad in front). Windows only lets the
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

module.exports = { available, activeWindow, focus, loadError: () => loadError };
