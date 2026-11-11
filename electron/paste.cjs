// Put text on the clipboard and simulate the paste shortcut in the focused app.
const { execFile, spawn } = require("node:child_process");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 4000 }, (err) => (err ? reject(err) : resolve()));
  });
}

// Starting PowerShell costs ~300-700 ms, so on Windows we keep one helper alive
// (started while you speak) and just send it a line per paste. It exits when idle.
let ps = null; // { proc, waiting: Array<{prefix, resolve, reject}>, idle: Timeout }
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
      // Each request waits for a line with its own prefix, so replies can't be mixed up.
      const i2 = h.waiting.findIndex((w) => line.startsWith(w.prefix));
      if (i2 >= 0) h.waiting.splice(i2, 1)[0].resolve(line);
    }
  });
  proc.on("error", fail);
  proc.on("exit", () => fail(new Error("paste helper exited")));
  proc.stdin.on("error", () => {});
  proc.stdin.write("$w = New-Object -ComObject WScript.Shell\n");
  // Win32 helpers: which window is in front, bring a window back to the front, and press
  // Ctrl+V with SendInput-style key events (waits for the shortcut's own keys to be released).
  // Written as one line so it can be sent through stdin; if it can't compile the paste
  // falls back to SendKeys and app detection is skipped.
  const csharp = [
    "using System; using System.Runtime.InteropServices; using System.Text;",
    "namespace ST { public class Win {",
    '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);',
    '[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
    '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
    '[DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);',
    '[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);',
    '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);',
    '[DllImport("user32.dll")] public static extern bool AttachThreadInput(int a, int b, bool f);',
    '[DllImport("kernel32.dll")] public static extern int GetCurrentThreadId();',
    '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int k);',
    '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, int flags, int extra);',
    "public static void Focus(long handle) { IntPtr h = new IntPtr(handle); if (!IsWindow(h)) return; IntPtr f = GetForegroundWindow(); if (f == h) return; int pid; int ft = GetWindowThreadProcessId(f, out pid); int me = GetCurrentThreadId(); if (IsIconic(h)) ShowWindow(h, 9); AttachThreadInput(me, ft, true); SetForegroundWindow(h); AttachThreadInput(me, ft, false); }",
    "public static void Paste() { for (int i = 0; i < 30; i++) { if (GetAsyncKeyState(0x10) >= 0 && GetAsyncKeyState(0x11) >= 0 && GetAsyncKeyState(0x12) >= 0 && GetAsyncKeyState(0x5B) >= 0 && GetAsyncKeyState(0x5C) >= 0) break; System.Threading.Thread.Sleep(20); } keybd_event(0x11, 0, 0, 0); keybd_event(0x56, 0, 0, 0); keybd_event(0x56, 0, 2, 0); keybd_event(0x11, 0, 2, 0); }",
    "} }",
  ].join(" ");
  proc.stdin.write(`try { Add-Type -TypeDefinition '${csharp}' } catch {}\n`);
  ps = h;
  return h;
}

/** Send one line to the helper and wait for the reply line that starts with `prefix`. */
function ask(command, prefix, timeoutMs) {
  const h = psHelper();
  clearTimeout(h.idle);
  h.idle = setTimeout(() => h.proc.kill(), PS_IDLE_MS);
  h.idle.unref?.();
  return new Promise((resolve, reject) => {
    const waiter = {
      prefix,
      resolve: (line) => (clearTimeout(timer), resolve(line.slice(prefix.length))),
      reject: (e) => (clearTimeout(timer), reject(e)),
    };
    const timer = setTimeout(() => {
      const i = h.waiting.indexOf(waiter);
      if (i >= 0) h.waiting.splice(i, 1);
      reject(new Error("helper timed out"));
    }, timeoutMs);
    h.waiting.push(waiter);
    h.proc.stdin.write(command + "\n");
  });
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

/** @param {{hwnd?: number}|null} target  the window to bring back to the front first */
async function pasteViaHelper(target) {
  const focus = target?.hwnd ? `try { [ST.Win]::Focus(${Number(target.hwnd)}) ; Start-Sleep -Milliseconds 120 } catch {}; ` : "";
  await ask(`${focus}try { [ST.Win]::Paste() } catch { $w.SendKeys('^v') }; 'wf-ok'`, "wf-ok", 6000);
}

function capture(cmd, args, timeout = 1500) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? "" : String(stdout).trim()));
  });
}

/**
 * The app the user is typing in: { app, title, hwnd, own }, or null when it can't be read.
 * `own` is true when the front window belongs to SayType itself.
 * Never throws and never blocks dictation: formatting just falls back to "other".
 */
async function activeWindow() {
  try {
    if (process.platform === "win32") {
      const b64 = await ask(
        "try { $h=[ST.Win]::GetForegroundWindow(); $p=0; [void][ST.Win]::GetWindowThreadProcessId($h,[ref]$p); $s=New-Object System.Text.StringBuilder 512; [void][ST.Win]::GetWindowText($h,$s,512); 'wf-app:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Process -Id $p).ProcessName + [char]9 + $s.ToString() + [char]9 + $h.ToInt64() + [char]9 + $p)) } catch { 'wf-app:' }",
        "wf-app:",
        5000
      );
      const [app, title = "", hwnd = "0", pid = "0"] = Buffer.from(b64, "base64").toString("utf8").split("\t");
      return app ? { app, title, hwnd: Number(hwnd) || 0, own: Number(pid) === process.pid } : null;
    }
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

async function simulatePaste(target) {
  if (process.platform === "darwin") {
    await run("osascript", ["-e", 'tell application "System Events" to keystroke "v" using command down']);
    return;
  }
  if (process.platform === "win32") {
    try {
      await pasteViaHelper(target);
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
      "(New-Object -ComObject WScript.Shell).SendKeys('^v')",
    ]);
    return;
  }
  // Linux: try Wayland and X11 tools in order.
  const wayland = Boolean(process.env.WAYLAND_DISPLAY);
  const attempts = wayland
    ? [["wtype", ["-M", "ctrl", "v", "-m", "ctrl"]], ["ydotool", ["key", "29:1", "47:1", "47:0", "29:0"]], ["xdotool", ["key", "--clearmodifiers", "ctrl+v"]]]
    : [["xdotool", ["key", "--clearmodifiers", "ctrl+v"]], ["ydotool", ["key", "29:1", "47:1", "47:0", "29:0"]]];
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
    `Couldn't simulate paste (install ${wayland ? "wtype or ydotool" : "xdotool"}). Text is on your clipboard.`
  );
}

/** Keep every common format (text, rich text, image) so restoring doesn't flatten what you had copied. */
function snapshot(clipboard) {
  const data = { text: clipboard.readText(), html: clipboard.readHTML(), rtf: clipboard.readRTF() };
  const image = clipboard.readImage();
  if (!image.isEmpty()) data.image = image;
  return data;
}

/**
 * @param {{restore?: boolean, target?: {hwnd?: number, own?: boolean}|null}} [opts]
 *   target: the window the user was typing in. If something else took the focus while
 *   the text was being transcribed, it is brought back before pasting.
 */
async function pasteText(clipboard, text, { restore = true, target = null } = {}) {
  const previous = restore ? snapshot(clipboard) : null;
  clipboard.writeText(text);
  await new Promise((r) => setTimeout(r, 60));
  await simulatePaste(target && !target.own ? target : null);
  if (restore && previous) {
    setTimeout(() => {
      // Only restore if nothing else changed the clipboard meanwhile.
      if (clipboard.readText() === text) clipboard.write(previous);
    }, 900);
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

module.exports = { pasteText, warmPaste, stopPasteHelper, activeWindow };
