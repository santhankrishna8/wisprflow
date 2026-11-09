// Put text on the clipboard and simulate the paste shortcut in the focused app.
const { execFile } = require("node:child_process");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 4000 }, (err) => (err ? reject(err) : resolve()));
  });
}

async function simulatePaste() {
  if (process.platform === "darwin") {
    await run("osascript", ["-e", 'tell application "System Events" to keystroke "v" using command down']);
    return;
  }
  if (process.platform === "win32") {
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
    `Couldn't simulate paste (install ${wayland ? "wtype or ydotool" : "xdotool"}). Text is on your clipboard. ${lastErr ? "" : ""}`.trim()
  );
}

async function pasteText(clipboard, text, { restore = true } = {}) {
  const previous = restore ? clipboard.readText() : null;
  clipboard.writeText(text);
  await new Promise((r) => setTimeout(r, 60));
  await simulatePaste();
  if (restore && previous != null) {
    setTimeout(() => {
      // Only restore if nothing else changed the clipboard meanwhile.
      if (clipboard.readText() === text) clipboard.writeText(previous);
    }, 900);
  }
}

module.exports = { pasteText };
