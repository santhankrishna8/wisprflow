const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createLocalWhisper } = require("../electron/localWhisper.cjs");

const MODEL = { id: "mini", name: "Mini", file: "ggml-mini.bin", bytes: 200_000, size: "0.2 MB", blurb: "" };

function modelHost(bytes, { slow = false } = {}) {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      if (req.url !== "/ggml-mini.bin") return res.writeHead(404).end();
      res.writeHead(200, { "content-length": bytes });
      const chunk = Buffer.alloc(20_000, 7);
      for (let sent = 0; sent < bytes; sent += chunk.length) {
        if (!res.write(chunk.subarray(0, Math.min(chunk.length, bytes - sent)))) await new Promise((r) => res.once("drain", r));
        if (slow) await new Promise((r) => setTimeout(r, 30));
      }
      res.end();
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}

function make(dir, url, extra = {}) {
  return createLocalWhisper({
    binDir: dir,
    modelsDir: path.join(dir, "models"),
    models: [MODEL],
    modelBaseUrl: url,
    command: process.execPath,
    prefixArgs: [path.join(__dirname, "fake-whisper-server.cjs")],
    ...extra,
  });
}

test("downloads a model with progress, then lists it as downloaded", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-"));
  const { srv, url } = await modelHost(MODEL.bytes);
  const lw = make(dir, url);
  assert.strictEqual(lw.listModels()[0].downloaded, false);
  const events = [];
  const r = await lw.downloadModel("mini", (p) => events.push(p));
  assert.deepStrictEqual(r, { ok: true });
  assert.ok(events.at(-1).done);
  assert.strictEqual(fs.statSync(path.join(dir, "models", "ggml-mini.bin")).size, MODEL.bytes);
  assert.ok(!fs.existsSync(path.join(dir, "models", "ggml-mini.bin.part")));
  assert.strictEqual(lw.listModels()[0].downloaded, true);
  srv.close();
});

test("cancelling a download leaves no partial file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-"));
  const { srv, url } = await modelHost(MODEL.bytes, { slow: true });
  const lw = make(dir, url);
  const p = lw.downloadModel("mini");
  setTimeout(() => lw.cancelDownload("mini"), 60);
  assert.deepStrictEqual(await p, { ok: false, cancelled: true });
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, "models")), []);
  srv.closeAllConnections();
  srv.close();
});

test("an incomplete download is rejected", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-"));
  const { srv, url } = await modelHost(1000);
  const lw = make(dir, url);
  await assert.rejects(lw.downloadModel("mini"), /incomplete/);
  assert.strictEqual(lw.listModels()[0].downloaded, false);
  srv.close();
});

test("starts on demand, transcribes WAV, reuses the server, and stops when idle", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-"));
  fs.mkdirSync(path.join(dir, "models"));
  fs.writeFileSync(path.join(dir, "models", MODEL.file), Buffer.alloc(MODEL.bytes));
  const lw = make(dir, "http://unused", { idleMs: 400 });
  assert.strictEqual(lw.isRunning(), false);

  const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(100)]);
  const text = await lw.transcribe({ wav, modelId: "mini", language: "en" });
  assert.strictEqual(text, "Hello world.");
  assert.strictEqual(lw.isRunning(), true);
  assert.strictEqual(lw.runningModel(), "mini");

  const port1 = await lw.ensureServer("mini");
  const port2 = await lw.ensureServer("mini");
  assert.strictEqual(port1, port2, "server is reused");

  await new Promise((r) => setTimeout(r, 900));
  assert.strictEqual(lw.isRunning(), false, "stopped after idle timeout");
});

test("sends WAV, language and anti-hallucination thresholds", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-"));
  fs.mkdirSync(path.join(dir, "models"));
  fs.writeFileSync(path.join(dir, "models", MODEL.file), Buffer.alloc(MODEL.bytes));
  const lw = make(dir, "http://unused");
  const port = await lw.ensureServer("mini");
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("RIFFxxxx")]), "a.wav");
  // Exercise the real transcribe() and inspect what the server echoes back.
  const res = await fetch(`http://127.0.0.1:${port}/inference`, { method: "POST", body: form });
  assert.ok(res.ok);
  const origFetch = global.fetch;
  let echo;
  global.fetch = async (...a) => {
    const r = await origFetch(...a);
    if (String(a[0]).endsWith("/inference")) echo = (await r.clone().json()).echo;
    return r;
  };
  try {
    await lw.transcribe({ wav: Buffer.from("RIFF1234"), modelId: "mini", language: "ta" });
  } finally {
    global.fetch = origFetch;
  }
  assert.strictEqual(echo.hasWav, true);
  assert.strictEqual(echo.language, "ta");
  assert.strictEqual(echo.entropy, "2.8");
  assert.ok(echo.model.endsWith("ggml-mini.bin"));
  await lw.stop();
  assert.strictEqual(lw.isRunning(), false);
});

test("clear errors when the model or engine is missing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-"));
  const lw = make(dir, "http://unused");
  await assert.rejects(lw.ensureServer("mini"), /Download the Mini model first/);
  const noEngine = createLocalWhisper({ binDir: path.join(dir, "nope"), modelsDir: dir, models: [MODEL] });
  assert.strictEqual(noEngine.engineAvailable(), false);
  await assert.rejects(noEngine.ensureServer("mini"), /isn't available/);
});
