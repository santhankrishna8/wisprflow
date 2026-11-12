// Audio is written to disk BEFORE transcription starts, so a failed paste, a provider
// error or a crash never costs you what you said. Files live in the app's data folder.
//
// File name: <uuid>_<durationMs>.<ext>. A recording is "unsent" until it either
// succeeds (then it is deleted, or kept with its history entry if the user opted in)
// or is discarded. Unsent recordings expire after 24 hours.
const fs = require("node:fs");
const path = require("node:path");

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME_BY_EXT = { wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", webm: "audio/webm" };
const UNSENT_MAX_AGE_MS = 24 * 3600_000;
const UNSENT_MAX_COUNT = 10;

function extFor(mimeType) {
  const m = String(mimeType || "");
  return m.includes("wav") ? "wav" : m.includes("ogg") ? "ogg" : m.includes("mp4") ? "m4a" : "webm";
}

function createRecordings(dir) {
  const parse = (name) => {
    const m = /^([0-9a-f-]{36})_(\d+)\.(wav|ogg|m4a|webm)$/i.exec(name);
    return m && ID_RE.test(m[1]) ? { id: m[1], durationMs: Number(m[2]), ext: m[3].toLowerCase(), name } : null;
  };
  const entries = () => {
    try {
      return fs.readdirSync(dir).map(parse).filter(Boolean);
    } catch {
      return [];
    }
  };
  const find = (id) => (ID_RE.test(String(id)) ? entries().find((e) => e.id === id) : undefined);

  return {
    save(id, { audio, mimeType, durationMs }) {
      if (!ID_RE.test(String(id))) throw new Error("Invalid recording id");
      fs.mkdirSync(dir, { recursive: true });
      const name = `${id}_${Math.max(0, Math.round(durationMs || 0))}.${extFor(mimeType)}`;
      const file = path.join(dir, name);
      fs.writeFileSync(file + ".tmp", Buffer.from(audio));
      fs.renameSync(file + ".tmp", file);
    },
    read(id) {
      const e = find(id);
      if (!e) return null;
      const file = path.join(dir, e.name);
      return {
        id: e.id,
        audio: fs.readFileSync(file),
        mimeType: MIME_BY_EXT[e.ext],
        durationMs: e.durationMs,
        createdAt: fs.statSync(file).mtime.toISOString(),
      };
    },
    has: (id) => Boolean(find(id)),
    remove(id) {
      const e = find(id);
      if (e) fs.rmSync(path.join(dir, e.name), { force: true });
    },
    /** Recordings that were never successfully transcribed: newest first. */
    unsent(keepIds = new Set()) {
      return entries()
        .filter((e) => !keepIds.has(e.id))
        .map((e) => {
          const st = fs.statSync(path.join(dir, e.name));
          return { id: e.id, durationMs: e.durationMs, bytes: st.size, createdAt: st.mtime.toISOString() };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    /** Delete expired or excess unsent recordings, and stray temp files. */
    sweep(keepIds = new Set(), now = Date.now()) {
      let removed = 0;
      for (const [i, u] of this.unsent(keepIds).entries()) {
        if (i >= UNSENT_MAX_COUNT || now - Date.parse(u.createdAt) > UNSENT_MAX_AGE_MS) {
          this.remove(u.id);
          removed++;
        }
      }
      try {
        for (const f of fs.readdirSync(dir)) if (f.endsWith(".tmp")) fs.rmSync(path.join(dir, f), { force: true });
      } catch {
        /* no folder yet */
      }
      return removed;
    },
  };
}

module.exports = { createRecordings, extFor, UNSENT_MAX_AGE_MS, UNSENT_MAX_COUNT };
