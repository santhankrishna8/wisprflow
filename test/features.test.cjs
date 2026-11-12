const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const { createRecordings, UNSENT_MAX_COUNT } = require("../electron/recordings.cjs");
const { suggestReplacements } = require("../electron/learn.cjs");
const { matchSnippet } = require("../electron/snippets.cjs");
const ai = require("../electron/ai.cjs");
const { createStore } = require("../electron/store.cjs");

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

// ---------- recordings (recovery) ----------
test("recordings: save, read back, remove", () => {
  const rec = createRecordings(tmp("wf-rec-"));
  const id = crypto.randomUUID();
  rec.save(id, { audio: Buffer.from("abc"), mimeType: "audio/wav", durationMs: 4200 });
  const got = rec.read(id);
  assert.strictEqual(got.audio.toString(), "abc");
  assert.strictEqual(got.mimeType, "audio/wav");
  assert.strictEqual(got.durationMs, 4200);
  rec.remove(id);
  assert.strictEqual(rec.read(id), null);
});

test("recordings: ids that are not UUIDs are rejected (no path traversal)", () => {
  const dir = tmp("wf-rec-");
  const rec = createRecordings(dir);
  assert.throws(() => rec.save("../evil", { audio: Buffer.from("x"), mimeType: "audio/wav", durationMs: 1 }));
  assert.strictEqual(rec.read("../../etc/passwd"), null);
  rec.remove("../x"); // must not throw or delete anything
});

test("recordings: unsent lists only recordings without a history entry; sweep expires old and excess ones", () => {
  const dir = tmp("wf-rec-");
  const rec = createRecordings(dir);
  const ids = Array.from({ length: UNSENT_MAX_COUNT + 3 }, () => crypto.randomUUID());
  ids.forEach((id, i) => {
    rec.save(id, { audio: Buffer.from("x"), mimeType: "audio/webm", durationMs: 1000 });
    const t = new Date(Date.now() - i * 1000); // ids[0] is newest
    fs.utimesSync(path.join(dir, fs.readdirSync(dir).find((f) => f.startsWith(id))), t, t);
  });
  const kept = new Set([ids[0]]); // belongs to a history entry
  assert.ok(!rec.unsent(kept).some((u) => u.id === ids[0]));
  rec.sweep(kept);
  assert.strictEqual(rec.unsent(kept).length, UNSENT_MAX_COUNT);
  assert.ok(rec.has(ids[0]), "history-linked audio is never swept");

  const old = crypto.randomUUID();
  rec.save(old, { audio: Buffer.from("x"), mimeType: "audio/webm", durationMs: 1 });
  rec.sweep(kept, Date.now() + 25 * 3600_000);
  assert.ok(!rec.has(old), "unsent recordings expire after 24h");
});

// ---------- learn from corrections ----------
test("learn: suggests the changed word, not the whole sentence", () => {
  const s = suggestReplacements("tell Priyah the launch is on Thursday", "tell Priya the launch is on Thursday");
  assert.deepStrictEqual(s, [{ word: "Priyah", to: "Priya" }]);
});

test("learn: captures capitalisation fixes and multi-word swaps, ignores punctuation-only changes", () => {
  assert.deepStrictEqual(suggestReplacements("deploy to kubernetes now", "deploy to Kubernetes now"), [{ word: "kubernetes", to: "Kubernetes" }]);
  assert.deepStrictEqual(suggestReplacements("ask open a i about it", "ask OpenAI about it"), [{ word: "open a i", to: "OpenAI" }]);
  assert.deepStrictEqual(suggestReplacements("hello there friend", "hello there, friend."), []);
});

test("learn: skips words already in the dictionary and big rewrites", () => {
  assert.deepStrictEqual(suggestReplacements("hi Priyah", "hi Priya", [{ word: "priyah", to: "Priya" }]), []);
  assert.deepStrictEqual(suggestReplacements("one two three four five six", "completely different text goes right here"), []);
});

// ---------- snippets ----------
test("snippets: match only when the whole dictation is the trigger", () => {
  const list = [{ id: "1", trigger: "my signature", text: "Best,\nSanthan" }];
  assert.strictEqual(matchSnippet("My signature.", list)?.text, "Best,\nSanthan");
  assert.strictEqual(matchSnippet("insert my signature", list)?.id, "1");
  assert.strictEqual(matchSnippet("please add my signature to the email", list), null);
  assert.strictEqual(matchSnippet("", list), null);
});

// ---------- ai: edit, code tone, receipt ----------
test("editText sends selection and instruction and returns the edited text", async () => {
  const real = global.fetch;
  let sent;
  global.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "Short." } }] }), { status: 200 });
  };
  try {
    const out = await ai.editText({
      selection: "This is a very long sentence.",
      instruction: "make it shorter",
      settings: { llmProvider: "openai", llmModel: "m" },
      apiKey: "k",
      dictionary: [],
    });
    assert.strictEqual(out, "Short.");
    assert.match(sent.messages[1].content, /<selection>[\s\S]*very long sentence[\s\S]*<instruction>[\s\S]*make it shorter/);
    await assert.rejects(ai.editText({ selection: "  ", instruction: "x", settings: {}, apiKey: "k" }), /Select some text/);
  } finally {
    global.fetch = real;
  }
});

test("receipt: says what left the device, from settings", () => {
  const local = ai.describeRoute({ sttProvider: "local", localModel: "base", llmProvider: "custom", llmBaseUrl: "http://localhost:11434/v1", llmModel: "llama3.2:3b" }, { cleaned: true });
  assert.strictEqual(local.leavesDevice, false);
  const cloud = ai.describeRoute({ sttProvider: "groq", sttModel: "whisper-large-v3", llmProvider: "openai", llmModel: "gpt-4o-mini" }, { cleaned: true });
  assert.strictEqual(cloud.stt.leavesDevice, true);
  assert.strictEqual(cloud.cleanup.leavesDevice, true);
  const mixed = ai.describeRoute({ sttProvider: "local", localModel: "small", llmProvider: "anthropic", llmModel: "x" }, { cleaned: false });
  assert.strictEqual(mixed.cleanup, null, "no cleanup ran, so nothing was sent to the LLM");
  assert.strictEqual(mixed.leavesDevice, false);
  assert.ok(ai.isLocalUrl("http://192.168.1.5:8000") && !ai.isLocalUrl("https://api.openai.com/v1"));
});

// ---------- store ----------
test("store: updateHistory merges and drops undefined fields; snippets are sanitised", () => {
  const store = createStore({ getPath: () => tmp("wf-store-") }, { isEncryptionAvailable: () => false });
  store.addHistory({ id: "a", createdAt: new Date().toISOString(), text: "hi", alt: { text: "x" } });
  const u = store.updateHistory("a", { text: "hello", alt: undefined });
  assert.strictEqual(u.text, "hello");
  assert.ok(!("alt" in u));
  assert.strictEqual(store.updateHistory("missing", {}), null);
  const sn = store.setSnippets([{ id: "1", trigger: " sig ", text: "Best" }, { id: "2", trigger: "", text: "x" }, { id: "3", trigger: "y", text: "" }]);
  assert.deepStrictEqual(sn, [{ id: "1", trigger: "sig", text: "Best" }]);
});
