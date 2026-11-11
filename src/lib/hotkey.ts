import { isMac } from "./bridge";

const CODE_MAP: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

/** Convert a keyboard event into an Electron accelerator string, or null if incomplete. */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) mods.push("CommandOrControl");
  if (isMac && e.ctrlKey) mods.push("Control");
  if (!isMac && e.metaKey) mods.push("Super");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  let key: string | null = null;
  const c = e.code;
  if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
  else if (/^Digit\d$/.test(c)) key = c.slice(5);
  else if (/^F\d{1,2}$/.test(c)) key = c;
  else if (/^Numpad\d$/.test(c)) key = "num" + c.slice(6);
  else if (CODE_MAP[c]) key = CODE_MAP[c];
  if (!key) return null;
  const isFn = /^F\d{1,2}$/.test(key);
  if (!mods.length && !isFn) return null;
  return [...mods, key].join("+");
}

const MAC_SYMBOLS: Record<string, string> = {
  CommandOrControl: "⌘",
  Command: "⌘",
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Super: "⌘",
  Enter: "↩",
  Backspace: "⌫",
  Tab: "⇥",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
};
const PC_NAMES: Record<string, string> = {
  CommandOrControl: "Ctrl",
  Control: "Ctrl",
  Super: "Win",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
};

/** Split an accelerator into display keys for <Kbd/> chips. */
export function acceleratorKeys(accel: string): string[] {
  return accel.split("+").map((k) => (isMac ? MAC_SYMBOLS[k] : PC_NAMES[k]) ?? k);
}
