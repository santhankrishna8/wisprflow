#!/usr/bin/env node
// Downloads the pinned whisper-server build for the target platform into
// vendor/whisper/<platform>-<arch>/, verifying its SHA-256. electron-builder
// then ships that folder inside the app (see "extraResources" in package.json).
//
// Usage: node scripts/fetch-whisper.cjs [--platform win32] [--arch x64]
//
// Builds come from OpenWhispr's whisper.cpp fork (MIT). The Windows zip bundles
// the MSVC runtime DLLs so it runs without the VC++ redistributable installed.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const extract = require("extract-zip");

const TAG = "0.0.11";
const BASE = `https://github.com/OpenWhispr/whisper.cpp/releases/download/${TAG}`;
const BUILDS = {
  "win32-x64": {
    zip: "whisper-server-win32-x64-cpu.zip",
    sha256: "7fca73533d5ac5d30f8f6aa0967672321861887c8ea1000cb13196a7d5135fd3",
    binary: "whisper-server-win32-x64-cpu.exe",
  },
  "linux-x64": {
    zip: "whisper-server-linux-x64-cpu.zip",
    sha256: "d184b6037f33d15f639cf3363c583148a6b2cb8d0ae7b73aafb8e71950f9fbe7",
    binary: "whisper-server-linux-x64-cpu",
  },
  "darwin-arm64": {
    zip: "whisper-server-darwin-arm64.zip",
    sha256: "d248c01c8824271487fb3dea5aab1aa20ba4a47e04d99b5e0fa13e9efb25d313",
    binary: "whisper-server-darwin-arm64",
  },
  "darwin-x64": {
    zip: "whisper-server-darwin-x64.zip",
    sha256: "3a952899bf01d959f7459e1240bd900f7e2855a4fa0ce875e05885f2952a7b61",
    binary: "whisper-server-darwin-x64",
  },
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

async function main() {
  const target = `${arg("platform", process.platform)}-${arg("arch", process.arch)}`;
  const build = BUILDS[target];
  if (!build) {
    console.warn(`[whisper] No prebuilt whisper-server for ${target}; local transcription will be unavailable.`);
    return;
  }
  const outDir = path.join(__dirname, "..", "vendor", "whisper", target);
  const exe = target.startsWith("win32") ? "whisper-server.exe" : "whisper-server";
  const marker = path.join(outDir, ".version");
  if (fs.existsSync(path.join(outDir, exe)) && fs.readFileSync(marker, "utf8").trim() === `${TAG}:${build.sha256}`) {
    console.log(`[whisper] ${target} already present (${TAG}).`);
    return;
  }

  console.log(`[whisper] Downloading ${build.zip} (${TAG})…`);
  const res = await fetch(`${BASE}/${build.zip}`);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  if (hash !== build.sha256) throw new Error(`Checksum mismatch for ${build.zip}: got ${hash}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wf-whisper-"));
  const zipPath = path.join(tmp, build.zip);
  fs.writeFileSync(zipPath, buf);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  await extract(zipPath, { dir: path.resolve(outDir) });
  fs.renameSync(path.join(outDir, build.binary), path.join(outDir, exe));
  if (!target.startsWith("win32")) fs.chmodSync(path.join(outDir, exe), 0o755);
  fs.writeFileSync(marker, `${TAG}:${build.sha256}\n`);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`[whisper] Installed to ${path.relative(process.cwd(), outDir)}: ${fs.readdirSync(outDir).join(", ")}`);
}

main().catch((err) => {
  console.error(`[whisper] ${err.message}`);
  process.exit(1);
});
