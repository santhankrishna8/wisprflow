// Finding and downloading a new installer from this project's GitHub releases.
const fs = require("node:fs");
const crypto = require("node:crypto");

const ASSET_PREFIX = "https://github.com/santhankrishna8/wisprflow/releases/download/";

/**
 * The installer asset of a GitHub release, or null when it isn't one we trust.
 * Only this project's own release downloads are accepted.
 * @returns {{url: string, size: number, sha256: string|null}|null}
 */
function pickAsset(release, name) {
  const asset = (release?.assets || []).find((a) => a.name === name);
  const url = String(asset?.browser_download_url || "");
  if (!url.startsWith(ASSET_PREFIX)) return null;
  const sha256 = (/^sha256:([0-9a-f]{64})$/i.exec(String(asset.digest || "")) || [])[1];
  return { url, size: Number(asset.size) || 0, sha256: sha256 ? sha256.toLowerCase() : null };
}

/**
 * Download `asset` to `file`, reporting progress, and check its size and SHA-256.
 * The file is deleted if anything is wrong.
 */
async function downloadInstaller({ asset, file, fetchImpl = fetch, signal, onProgress }) {
  fs.rmSync(file, { force: true });
  try {
    const res = await fetchImpl(asset.url, { signal });
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`);
    const total = Number(res.headers.get("content-length")) || asset.size;
    const hash = crypto.createHash("sha256");
    const out = fs.createWriteStream(file);
    let received = 0;
    let last = 0;
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        hash.update(value);
        if (!out.write(value)) await new Promise((r) => out.once("drain", r));
        const now = Date.now();
        if (now - last > 120) {
          last = now;
          onProgress?.({ received, total });
        }
      }
    } finally {
      await new Promise((r) => out.end(r));
    }
    onProgress?.({ received, total });
    if (asset.size && received !== asset.size) throw new Error("The download was incomplete. Please try again.");
    if (asset.sha256 && hash.digest("hex") !== asset.sha256) throw new Error("The download failed its integrity check. Please try again.");
    return { received };
  } catch (err) {
    fs.rmSync(file, { force: true });
    throw err;
  }
}

module.exports = { ASSET_PREFIX, pickAsset, downloadInstaller };
