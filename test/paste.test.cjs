const test = require("node:test");
const assert = require("node:assert");
const { snapshot, restoreSnapshot, pasteText } = require("../electron/paste.cjs");

// Electron 45's clipboard: asynchronous, text only. Anything else must not be called.
const clip = (text) => ({
  text,
  writes: [],
  async readText() {
    return this.text;
  },
  async writeText(t) {
    await new Promise((r) => setTimeout(r, 20)); // lands a moment later, like the real one
    this.text = t;
    this.writes.push(t);
  },
});

test("saving the clipboard awaits readText and never throws", async () => {
  assert.deepStrictEqual(await snapshot(clip("old")), { text: "old" });
  assert.strictEqual(await snapshot(clip("")), null, "nothing to restore when there was no text");
  assert.strictEqual(await snapshot({}), null, "a clipboard without readText must not stop the paste");
  assert.strictEqual(await snapshot({ readText: async () => Promise.reject(new Error("busy")) }), null);
  assert.deepStrictEqual(await snapshot({ readText: () => "sync" }), { text: "sync" }, "a synchronous clipboard works too");
});

test("the old text is restored only if the clipboard still holds the dictation", async () => {
  const c = clip("old");
  const previous = await snapshot(c);
  await c.writeText("dictated");
  await restoreSnapshot(c, previous, "dictated");
  assert.strictEqual(c.text, "old");
  await c.writeText("something the user copied since");
  await restoreSnapshot(c, previous, "dictated");
  assert.strictEqual(c.text, "something the user copied since");
  await restoreSnapshot(c, null, "dictated"); // no previous text: leave it alone
  await assert.doesNotReject(restoreSnapshot({}, previous, "x"));
});

test("the text is on the clipboard before the paste key is pressed", async () => {
  const c = clip("old");
  // No paste tool exists on the test machine, so the keystroke step fails; what matters is
  // that the (slow) clipboard write had already finished when it was attempted.
  await pasteText(c, "dictated", { restore: false }).catch(() => {});
  assert.deepStrictEqual(c.writes, ["dictated"]);
  assert.strictEqual(c.text, "dictated");
});
