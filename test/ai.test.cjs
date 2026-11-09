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
