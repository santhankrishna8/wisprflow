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
  // Lets us ask which app is in front, to format text for it (see activeWindow).
  proc.stdin.write(
    "try { Add-Type -Namespace VK -Name Win -MemberDefinition '[DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int pid); [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);' } catch {}\n"
  );
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

async function pasteViaHelper() {
  await ask("$w.SendKeys('^v'); 'wf-ok'", "wf-ok", 4000);
}

function capture(cmd, args, timeout = 1500) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? "" : String(stdout).trim()));
  });
}

/**
 * The app the user is typing in: { app, title }, or null when it can't be read.
 * Never throws and never blocks dictation: formatting just falls back to "other".
 */
async function activeWindow() {
  try {
    if (process.platform === "win32") {
      const b64 = await ask(
        "try { $h=[VK.Win]::GetForegroundWindow(); $p=0; [void][VK.Win]::GetWindowThreadProcessId($h,[ref]$p); $s=New-Object System.Text.StringBuilder 512; [void][VK.Win]::GetWindowText($h,$s,512); 'wf-app:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Process -Id $p).ProcessName + [char]9 + $s.ToString())) } catch { 'wf-app:' }",
        "wf-app:",
        5000
      );
      const [app, title = ""] = Buffer.from(b64, "base64").toString("utf8").split("\t");
      return app ? { app, title } : null;
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

async function simulatePaste() {
  if (process.platform === "darwin") {
    await run("osascript", ["-e", 'tell application "System Events" to keystroke "v" using command down']);
    return;
  }
  if (process.platform === "win32") {
    try {
      await pasteViaHelper();
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

async function pasteText(clipboard, text, { restore = true } = {}) {
  const previous = restore ? snapshot(clipboard) : null;
  clipboard.writeText(text);
  await new Promise((r) => setTimeout(r, 60));
  await simulatePaste();
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
