#!/usr/bin/env node
// End-to-end check of on-device transcription against a *packaged* app:
// downloads the Tiny model with the app's own downloader, starts the bundled
// whisper-server, transcribes whisper.cpp's JFK sample and checks the words.
//
// Usage: node scripts/smoke-local-whisper.cjs <path to packaged resources/whisper>

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLocalWhisper } = require("../electron/localWhisper.cjs");

async function main() {
  const binDir = path.resolve(process.argv[2] || "release/win-unpacked/resources/whisper");
  const modelsDir = path.join(os.tmpdir(), "saytype-smoke-models");
  const lw = createLocalWhisper({ binDir, modelsDir });
  if (!lw.engineAvailable()) throw new Error(`No whisper-server in ${binDir}`);

  console.log("Downloading Tiny model…");
  let lastPct = -1;
  await lw.downloadModel("tiny", ({ received, total }) => {
    const pct = Math.floor((received / total) * 10) * 10;
    if (pct !== lastPct) console.log(`  ${pct}%`), (lastPct = pct);
  });

  const res = await fetch("https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/samples/jfk.wav");
  if (!res.ok) throw new Error(`Sample download failed: ${res.status}`);
  const wav = Buffer.from(await res.arrayBuffer());

  let t0 = Date.now();
  await lw.ensureServer("tiny");
  console.log(`Engine started in ${Date.now() - t0} ms`);
  t0 = Date.now();
  // Auto-detect limited to the app's languages: English speech must come back as English.
  const { text, language } = await lw.transcribe({ wav, modelId: "tiny", language: "auto", allowed: ["en", "hi", "te", "ta", "kn"] });
  console.log(`Transcribed in ${Date.now() - t0} ms (${language}): "${text}"`);
  if (language !== "en") throw new Error(`Expected English to be detected, got "${language}"`);
  // When the detected language isn't one the speaker uses, the engine must fall back to one that is.
  const forced = await lw.transcribe({ wav, modelId: "tiny", language: "auto", allowed: ["hi", "te"] });
  console.log(`Restricted to Hindi/Telugu (${forced.language}): "${forced.text}"`);
  if (!["hi", "te"].includes(forced.language)) throw new Error(`Expected a fallback to hi or te, got "${forced.language}"`);
  await lw.stop();

  const t = text.toLowerCase();
  for (const word of ["ask not", "country"]) {
    if (!t.includes(word)) throw new Error(`Expected "${word}" in transcript`);
  }
  if (lw.isRunning()) throw new Error("Engine still running after stop()");
  console.log("Local transcription smoke test passed.");
  fs.rmSync(modelsDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
