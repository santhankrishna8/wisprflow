const test = require("node:test");
const assert = require("node:assert");
const { applyDictionary, cleanupPrompt } = require("../electron/ai.cjs");

test("applyDictionary replaces whole words case-insensitively", () => {
  const dict = [{ word: "kubernetes", to: "Kubernetes" }, { word: "open ai", to: "OpenAI" }];
  assert.strictEqual(applyDictionary("deploy kubernetes with open ai", dict), "deploy Kubernetes with OpenAI");
  assert.strictEqual(applyDictionary("kubernetesish", dict), "kubernetesish");
});

test("applyDictionary escapes regex characters", () => {
  assert.strictEqual(applyDictionary("use c++ here", [{ word: "c++", to: "C++" }]), "use C++ here");
});

test("cleanupPrompt includes dictionary spellings and tone", () => {
  const p = cleanupPrompt("professional", [{ word: "Priya" }]);
  assert.match(p, /"Priya"/);
  assert.match(p, /professionally/);
});

const { createStore, RETENTION_MS } = require("../electron/store.cjs");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

test("pruneHistory removes only entries older than the retention window", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-store-"));
  const store = createStore({ getPath: () => dir }, { isEncryptionAvailable: () => false });
  const now = Date.parse("2026-11-09T12:00:00Z");
  const at = (hoursAgo) => new Date(now - hoursAgo * 3600_000).toISOString();
  for (const [id, h] of [["fresh", 0.5], ["edge", 2.9], ["old", 3.1], ["ancient", 50]]) {
    store.addHistory({ id, createdAt: at(h), text: id, words: 1 });
  }
  assert.strictEqual(store.pruneHistory(RETENTION_MS["3h"], now), 2);
  assert.deepStrictEqual(store.getHistory().map((h) => h.id).sort(), ["edge", "fresh"]);
  assert.strictEqual(store.pruneHistory(RETENTION_MS.forever, now), 0, "forever keeps everything");
  assert.strictEqual(store.getHistory().length, 2);
});

test("a corrupt data file is backed up, not silently overwritten", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-corrupt-"));
  fs.writeFileSync(path.join(dir, "wisprflow-data.json"), "{ not json");
  const store = createStore({ getPath: () => dir }, { isEncryptionAvailable: () => false });
  assert.deepStrictEqual(store.getHistory(), []);
  assert.ok(fs.readdirSync(dir).some((f) => f.includes(".corrupt-")), "backup exists");
});

test("cleanup rejects truncated output so raw text is pasted instead", async () => {
  const realFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "cut" } }] }), { status: 200 });
  try {
    const { cleanup } = require("../electron/ai.cjs");
    await assert.rejects(
      cleanup({ text: "hello world", settings: { llmProvider: "openai", llmModel: "x", tone: "natural" }, apiKey: "k", dictionary: [] }),
      /cut off/
    );
  } finally {
    global.fetch = realFetch;
  }
});
