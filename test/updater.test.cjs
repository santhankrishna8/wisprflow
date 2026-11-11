const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { pickAsset, downloadInstaller, ASSET_PREFIX } = require("../electron/updater.cjs");

const body = Buffer.from("MZ-fake-installer-".repeat(5000));
const sha = crypto.createHash("sha256").update(body).digest("hex");
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "st-upd-")), "SayType-Setup.exe");
const serve = (data, status = 200) => async () =>
  new Response(data, { status, headers: { "content-length": String(data.length) } });

test("pickAsset accepts only this project's release downloads", () => {
  const good = { assets: [{ name: "SayType-Setup.exe", size: 10, digest: `sha256:${sha}`, browser_download_url: ASSET_PREFIX + "v1.0.0/SayType-Setup.exe" }] };
  assert.deepStrictEqual(pickAsset(good, "SayType-Setup.exe"), { url: ASSET_PREFIX + "v1.0.0/SayType-Setup.exe", size: 10, sha256: sha });
  const foreign = { assets: [{ name: "SayType-Setup.exe", size: 10, browser_download_url: "https://evil.example/SayType-Setup.exe" }] };
  assert.strictEqual(pickAsset(foreign, "SayType-Setup.exe"), null);
  assert.strictEqual(pickAsset({ assets: [] }, "SayType-Setup.exe"), null);
  assert.strictEqual(pickAsset({ assets: [{ ...good.assets[0], digest: undefined }] }, "SayType-Setup.exe").sha256, null);
});

test("downloads with progress and verifies size and hash", async () => {
  const file = tmp();
  const seen = [];
  await downloadInstaller({ asset: { url: "u", size: body.length, sha256: sha }, file, fetchImpl: serve(body), onProgress: (p) => seen.push(p) });
  assert.strictEqual(fs.statSync(file).size, body.length);
  assert.strictEqual(seen.at(-1).received, body.length);
  assert.strictEqual(seen.at(-1).total, body.length);
});

test("a tampered or truncated download is rejected and removed", async () => {
  const file = tmp();
  await assert.rejects(downloadInstaller({ asset: { url: "u", size: body.length, sha256: "0".repeat(64) }, file, fetchImpl: serve(body) }), /integrity/);
  assert.strictEqual(fs.existsSync(file), false);
  await assert.rejects(downloadInstaller({ asset: { url: "u", size: body.length + 1, sha256: null }, file, fetchImpl: serve(body) }), /incomplete/);
  assert.strictEqual(fs.existsSync(file), false);
  await assert.rejects(downloadInstaller({ asset: { url: "u", size: 1, sha256: null }, file, fetchImpl: serve("nope", 404) }), /404/);
});
