const test = require("node:test");
const assert = require("node:assert");
const { snapshot, restoreSnapshot } = require("../electron/paste.cjs");

// Electron 45's clipboard: nothing but these. Anything else must not be called.
const clip = (text) => ({
  text,
  readText() {
    return this.text;
  },
  writeText(t) {
    this.text = t;
  },
});

test("saving the clipboard uses only readText and never throws", () => {
  assert.deepStrictEqual(snapshot(clip("old")), { text: "old" });
  assert.strictEqual(snapshot(clip("")), null, "nothing to restore when there was no text");
  assert.strictEqual(snapshot({}), null, "a clipboard without readText must not stop the paste");
  assert.strictEqual(snapshot({ readText() { throw new Error("busy"); } }), null);
});

test("the old text is restored only if the clipboard still holds the dictation", () => {
  const c = clip("old");
  const previous = snapshot(c);
  c.writeText("dictated");
  restoreSnapshot(c, previous, "dictated");
  assert.strictEqual(c.text, "old");
  c.writeText("something the user copied since");
  restoreSnapshot(c, previous, "dictated");
  assert.strictEqual(c.text, "something the user copied since");
  restoreSnapshot(c, null, "dictated"); // no previous text: leave it alone
  assert.doesNotThrow(() => restoreSnapshot({}, previous, "x"));
});
