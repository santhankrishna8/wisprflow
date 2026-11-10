// On-device speech-to-text with a bundled whisper.cpp server.
//
// The server is started lazily (on first dictation, or when recording starts so
// the model loads while you speak), reused for back-to-back dictations, and
// stopped after IDLE_MS without use. Nothing runs in the background otherwise.

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const os = require("node:os");
const { spawn } = require("node:child_process");

const HF = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
const MODELS = [
  { id: "tiny", name: "Tiny", file: "ggml-tiny.bin", bytes: 78_000_000, size: "75 MB", blurb: "Fastest. Fine for short, clear notes." },
  { id: "base", name: "Base", file: "ggml-base.bin", bytes: 148_000_000, size: "142 MB", blurb: "Quick and accurate enough for most dictation.", recommended: true },
  { id: "small", name: "Small", file: "ggml-small.bin", bytes: 488_000_000, size: "466 MB", blurb: "Noticeably more accurate. Great on modern CPUs." },
  { id: "turbo-q5", name: "Large v3 Turbo", file: "ggml-large-v3-turbo-q5_0.bin", bytes: 574_041_195, size: "574 MB", blurb: "Near-best accuracy. Slower without a strong CPU." },
];

const IDLE_MS = 10 * 60 * 1000;
const STARTUP_TIMEOUT_MS = 60_000;
// Anti-hallucination thresholds (from OpenWhispr, measured over thousands of
// dictations): stop near-silent windows from emitting "Thank you for watching".
const DECODER_FIELDS = { entropy_thold: "2.8", logprob_thold: "-1.25" };

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function defaultThreads() {
  const n = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(8, Math.floor(n * 0.75)));
}

/**
 * @param {object} o
 * @param {string} o.binDir     folder containing whisper-server(.exe)
 * @param {string} o.modelsDir  where ggml models are stored
 * @param {typeof fetch} [o.fetchImpl]  fetch used for model downloads (Electron's net.fetch honours system proxies)
 * @param {string} [o.command] [o.prefixArgs]  override the server command (tests)
 * @param {number} [o.idleMs]
 * @param {Array} [o.models] [o.modelBaseUrl]  override the model catalogue (tests)
 */
function createLocalWhisper(o) {
  const fetchImpl = o.fetchImpl || fetch;
  const models = o.models || MODELS;
  const idleMs = o.idleMs ?? IDLE_MS;
  const exe = process.platform === "win32" ? "whisper-server.exe" : "whisper-server";
  const command = o.command || path.join(o.binDir, exe);
  const prefixArgs = o.prefixArgs || [];
  const downloads = new Map(); // id -> AbortController
  let server = null; // { proc, port, model, ready: Promise }
  let idleTimer = null;

  const modelPath = (m) => path.join(o.modelsDir, m.file);
  const find = (id) => {
    const m = models.find((x) => x.id === id);
    if (!m) throw new Error(`Unknown model “${id}”.`);
    return m;
  };

  function isDownloaded(m) {
    try {
      return fs.statSync(modelPath(m)).size > m.bytes * 0.9;
    } catch {
      return false;
    }
  }

  function engineAvailable() {
    return Boolean(o.command) || fs.existsSync(command);
  }

  function listModels() {
    return models.map((m) => ({
      id: m.id,
      name: m.name,
      size: m.size,
      blurb: m.blurb,
      recommended: Boolean(m.recommended),
      downloaded: isDownloaded(m),
      downloading: downloads.has(m.id),
    }));
  }

  async function sha256File(file) {
    const hash = crypto.createHash("sha256");
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest("hex");
  }

  async function downloadModel(id, onProgress) {
    const m = find(id);
    if (isDownloaded(m)) return { ok: true };
    if (downloads.has(id)) throw new Error("Already downloading.");
    const abort = new AbortController();
    downloads.set(id, abort);
    fs.mkdirSync(o.modelsDir, { recursive: true });
    const part = modelPath(m) + ".part";
    try {
      // Resume an interrupted download when a partial file is present.
      let have = 0;
      try {
        have = fs.statSync(part).size;
      } catch {
        /* fresh download */
      }
      if (have >= m.bytes * 1.1) {
        fs.rmSync(part, { force: true });
        have = 0;
      }
      const res = await fetchImpl(`${o.modelBaseUrl || HF}/${m.file}`, {
        signal: abort.signal,
        headers: have ? { Range: `bytes=${have}-` } : {},
      });
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`);
      const resumed = have > 0 && res.status === 206;
      if (!resumed) have = 0;
      const total = have + (Number(res.headers.get("content-length")) || m.bytes - have);
      const out = fs.createWriteStream(part, { flags: resumed ? "a" : "w" });
      let received = have;
      let last = 0;
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (!out.write(value)) await new Promise((r) => out.once("drain", r));
          const now = Date.now();
          if (now - last > 120) {
            last = now;
            onProgress?.({ id, received, total });
          }
        }
      } finally {
        await new Promise((r) => out.end(r));
      }
      if (received < m.bytes * 0.9) throw new Error("Download was incomplete. Please try again.");
      // Hugging Face exposes the file's SHA-256 for LFS files; verify it when present.
      const expected = (res.headers.get("x-linked-etag") || "").replace(/"/g, "").toLowerCase();
      if (/^[0-9a-f]{64}$/.test(expected) && (await sha256File(part)) !== expected) {
        fs.rmSync(part, { force: true });
        throw new Error("The downloaded model failed its integrity check. Please try again.");
      }
      fs.renameSync(part, modelPath(m));
      onProgress?.({ id, received: total, total, done: true });
      return { ok: true };
    } catch (err) {
      if (abort.signal.aborted) {
        fs.rmSync(part, { force: true });
        return { ok: false, cancelled: true };
      }
      // Keep the partial file after network errors so the next attempt resumes.
      if (/incomplete/.test(err.message)) fs.rmSync(part, { force: true });
      throw err;
    } finally {
      downloads.delete(id);
    }
  }

  function cancelDownload(id) {
    downloads.get(id)?.abort();
  }

  async function deleteModel(id) {
    const m = find(id);
    if (server?.model === id) await stop();
    fs.rmSync(modelPath(m), { force: true });
  }

  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => stop(), idleMs);
    idleTimer.unref?.();
  }

  async function waitReady(port, proc) {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    let exited = null;
    proc.once("exit", (code) => (exited = code ?? "signal"));
    while (Date.now() < deadline) {
      if (exited !== null) throw new Error(`Local engine stopped while loading (exit ${exited}).`);
      try {
        const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
        if (r.ok) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error("Local engine took too long to start.");
  }

  /** Start (or reuse) the server for `modelId`. Resolves once it accepts requests. */
  async function ensureServer(modelId) {
    const m = find(modelId);
    if (server && server.model === modelId && server.proc.exitCode === null) {
      armIdle();
      return server.ready;
    }
    await stop();
    if (!engineAvailable()) throw new Error("The local engine isn't available in this build.");
    if (!isDownloaded(m)) throw new Error(`Download the ${m.name} model first (Settings → Transcription).`);

    const port = await freePort();
    const args = [
      ...prefixArgs,
      "--model", modelPath(m),
      "--host", "127.0.0.1",
      "--port", String(port),
      "--threads", String(defaultThreads()),
      "--language", "auto",
      "--max-len", "4096",
    ];
    const proc = spawn(command, args, {
      cwd: path.dirname(command),
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
    const current = { proc, port, model: modelId, ready: null };
    current.ready = new Promise((resolve, reject) => {
      proc.once("error", (e) => reject(new Error(`Couldn't start the local engine: ${e.message}`)));
      waitReady(port, proc).then(() => resolve(port), (e) => reject(new Error(`${e.message}${stderr ? `\n${stderr.trim().split("\n").pop()}` : ""}`)));
    });
    proc.once("exit", () => {
      if (server === current) server = null;
    });
    server = current;
    current.ready.catch(() => stop());
    armIdle();
    return current.ready;
  }

  async function transcribe({ wav, modelId, language, prompt, signal }) {
    const port = await ensureServer(modelId);
    const form = new FormData();
    form.append("file", new Blob([wav], { type: "audio/wav" }), "audio.wav");
    form.append("response_format", "json");
    form.append("temperature", "0.0");
    form.append("language", language && language !== "auto" ? language : "auto");
    for (const [k, v] of Object.entries(DECODER_FIELDS)) form.append(k, v);
    if (prompt) form.append("prompt", prompt);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/inference`, { method: "POST", body: form, signal });
      if (!res.ok) throw new Error(`Local transcription failed (${res.status}).`);
      const json = await res.json();
      if (json.error) throw new Error(`Local transcription failed: ${json.error}`);
      return String(json.text || "")
        .replace(/\[(BLANK_AUDIO|MUSIC|NOISE|SILENCE)\]/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    } finally {
      armIdle();
    }
  }

  function stop() {
    clearTimeout(idleTimer);
    const s = server;
    server = null;
    if (!s || s.proc.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        s.proc.kill("SIGKILL");
        resolve();
      }, 2000);
      s.proc.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
      s.proc.kill();
    });
  }

  return {
    listModels,
    downloadModel,
    cancelDownload,
    deleteModel,
    ensureServer,
    transcribe,
    stop,
    engineAvailable,
    isRunning: () => Boolean(server && server.proc.exitCode === null),
    runningModel: () => server?.model ?? null,
  };
}

module.exports = { createLocalWhisper, MODELS };
