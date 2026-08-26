import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, copyFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import sevenZipBin from "7zip-bin";

import {
  archivedWindowsInstaller,
  cachedWindowsInstaller,
  cachedWindowsRuntime,
  windowsInstallerSha256,
  windowsInstallerUrl,
} from "./lib/config.mjs";
import { run } from "./lib/process.mjs";
import { hydrateSourcePayloadFromRuntime, validateWindowsRuntime } from "./lib/runtime.mjs";

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("The reconstructed Windows runtime currently targets Windows x64 only.");
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function sha256(target) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  return hash.digest("hex");
}

async function prepareInstaller() {
  await mkdir(path.dirname(cachedWindowsInstaller), { recursive: true });
  if (await exists(cachedWindowsInstaller)) {
    const digest = await sha256(cachedWindowsInstaller);
    if (digest === windowsInstallerSha256) return;
    await rm(cachedWindowsInstaller, { force: true });
  }

  if (await exists(archivedWindowsInstaller)) {
    const digest = await sha256(archivedWindowsInstaller);
    if (digest !== windowsInstallerSha256) {
      throw new Error(`Archived Windows installer checksum mismatch: expected ${windowsInstallerSha256}, got ${digest}. Run git lfs pull before bootstrapping.`);
    }
    console.log(`Using archived Windows release ${archivedWindowsInstaller}`);
    await copyFile(archivedWindowsInstaller, cachedWindowsInstaller);
    return;
  }

  console.log(`Downloading ${windowsInstallerUrl}`);
  const response = await fetch(windowsInstallerUrl, { redirect: "follow" });
  if (!response.ok || response.body == null) throw new Error(`Download failed: HTTP ${response.status}`);
  const partial = `${cachedWindowsInstaller}.partial`;
  await rm(partial, { force: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { mode: 0o600 }));
  const digest = await sha256(partial);
  if (digest !== windowsInstallerSha256) {
    await rm(partial, { force: true });
    throw new Error(`Windows installer checksum mismatch: expected ${windowsInstallerSha256}, got ${digest}`);
  }
  await rename(partial, cachedWindowsInstaller);
}

async function extractRuntime() {
  const runtimeParent = path.dirname(cachedWindowsRuntime);
  await mkdir(runtimeParent, { recursive: true });
  const temporary = await mkdtemp(path.join(runtimeParent, "win32-x64-"));
  try {
    await run(sevenZipBin.path7za, ["x", cachedWindowsInstaller, `-o${temporary}`, "-y"]);
    await validateWindowsRuntime(temporary);
    await rm(cachedWindowsRuntime, { recursive: true, force: true });
    await rename(temporary, cachedWindowsRuntime);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return validateWindowsRuntime(cachedWindowsRuntime);
}

await prepareInstaller();

let runtime;
if (await exists(cachedWindowsRuntime)) {
  try {
    runtime = await validateWindowsRuntime(cachedWindowsRuntime);
  } catch {
    await rm(cachedWindowsRuntime, { recursive: true, force: true });
  }
}
runtime ??= await extractRuntime();

const hydrated = await hydrateSourcePayloadFromRuntime(runtime);
console.log(`Windows runtime ready: ${runtime}`);
console.log(`Checksum-pinned Windows source payload ready: ${hydrated.destination} (${hydrated.sha256})`);
console.log("The preserved installer is used only as a pinned Electron shell, renderer, native-dependency, and helper-binary input.");
