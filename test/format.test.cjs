const test = require("node:test");
const assert = require("node:assert");
const fmt = require("../electron/format.cjs");
const { cleanupPrompt } = require("../electron/ai.cjs");

test("classifyApp recognises apps by process name and browser tabs by title", () => {
  assert.strictEqual(fmt.classifyApp({ app: "Cursor.exe", title: "main.ts" }).editor, "cursor");
  assert.strictEqual(fmt.classifyApp({ app: "Code", title: "x" }).kind, "code");
  assert.strictEqual(fmt.classifyApp({ app: "OUTLOOK.EXE", title: "Inbox" }).kind, "email");
  assert.strictEqual(fmt.classifyApp({ app: "chrome", title: "Inbox (3) - a@b.com - Gmail - Google Chrome" }).kind, "email");
  assert.strictEqual(fmt.classifyApp({ app: "chrome", title: "WhatsApp - Google Chrome" }).kind, "message");
  assert.strictEqual(fmt.classifyApp({ app: "msedge", title: "ChatGPT - Microsoft Edge" }).kind, "prompt");
  assert.strictEqual(fmt.classifyApp({ app: "explorer", title: "Downloads" }).kind, "other");
  assert.strictEqual(fmt.classifyApp(null).kind, "other");
});

test("resolveContext lets the user's choice override the detected app", () => {
  const win = { app: "slack", title: "general" };
  assert.strictEqual(fmt.resolveContext({ formatMode: "auto" }, win).kind, "message");
  assert.strictEqual(fmt.resolveContext({ formatMode: "email" }, win).kind, "email");
  const off = fmt.resolveContext({ formatMode: "auto", useAppContext: false }, win);
  assert.strictEqual(off.kind, "other");
  assert.strictEqual(off.title, "", "the window title is not used when app detection is off");
});

test("formatOffline handles spoken commands and filler words", () => {
  assert.strictEqual(fmt.formatOffline("um, so the plan is ready. New line. we ship on friday, uh, I think."), "So the plan is ready.\nWe ship on friday, I think.");
  assert.strictEqual(fmt.formatOffline("Shopping list new paragraph bullet point eggs bullet point milk"), "Shopping list\n\n- Eggs\n- Milk");
  assert.strictEqual(fmt.formatOffline("The summer was humid"), "The summer was humid", "words containing um stay intact");
});

test("formatOffline leaves Indian-language text untouched", () => {
  for (const t of ["నేను రేపు ఉదయం వస్తాను", "நான் நாளை வருகிறேன்", "मैं कल आऊंगा", "ನಾನು ನಾಳೆ ಬರುತ್ತೇನೆ"]) {
    assert.strictEqual(fmt.formatOffline(t, { kind: "message" }), t);
  }
});

test("formatOffline fixes developer speech in code apps", () => {
  const code = { kind: "code", editor: "cursor" };
  assert.strictEqual(fmt.formatOffline("Open utils dot ts and check the super base client", code), "Open utils.ts and check the Supabase client");
  assert.strictEqual(fmt.formatOffline("Rename it to user underscore profile underscore id", code), "Rename it to user_profile_id");
  assert.strictEqual(fmt.formatOffline("Check at file auth dot py and tag api.ts", code), "Check @auth.py and @api.ts");
  assert.strictEqual(fmt.formatOffline("Deploy it to vercel with the github api", code), "Deploy it to Vercel with the GitHub API");
  assert.strictEqual(fmt.formatOffline("Deploy it to vercel", { kind: "message" }), "Deploy it to vercel", "only in code apps or for developers");
  assert.strictEqual(fmt.formatOffline("Deploy it to vercel", { kind: "message", role: "developer" }), "Deploy it to Vercel");
});

test("sttPrompt primes Whisper in the target script and never labels Indian languages in English", () => {
  assert.match(fmt.sttPrompt({ language: "te", terms: ["Adithya"] }), /తెలుగు.*Adithya/);
  assert.doesNotMatch(fmt.sttPrompt({ language: "te", terms: ["Adithya"] }), /Vocabulary/);
  assert.strictEqual(fmt.sttPrompt({ language: "en", terms: ["Adithya", "git diff"] }), "Vocabulary: Adithya, git diff.");
  assert.strictEqual(fmt.sttPrompt({ language: "auto", terms: [] }), "");
  assert.strictEqual(fmt.normalizeLanguage("fr"), "auto");
  assert.strictEqual(fmt.normalizeLanguage("kn"), "kn");
});

test("cleanupPrompt carries language, app, role and window title", () => {
  const p = cleanupPrompt("natural", [], { language: "te", kind: "prompt", role: "developer", title: "Chat with Adithya", about: "I work at Zentric" });
  assert.match(p, /Telugu/);
  assert.match(p, /Never translate/);
  assert.match(p, /Do NOT answer the prompt/);
  assert.match(p, /software developer/);
  assert.match(p, /Chat with Adithya/);
  assert.match(p, /Zentric/);
  assert.match(cleanupPrompt("natural", [], { kind: "code", editor: "windsurf" }), /Windsurf.*@filename/s);
  assert.match(cleanupPrompt("natural", []), /same language and script/);
});
