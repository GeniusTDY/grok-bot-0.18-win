import { createHash } from "node:crypto";
import { access, cp, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { extractAll, extractFile } from "@electron/asar";
import {
  cacheDir,
  cachedWindowsRuntime,
  sourceAppDir,
  upstreamVersion,
  windowsAsarSha256,
} from "./config.mjs";

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export function runtimeLayout(runtimePath) {
  const resolved = path.resolve(runtimePath);
  const resources = path.join(resolved, "resources");
  return {
    platform: "win32",
    root: resolved,
    resources,
    executable: path.join(resolved, "Grok Bot.exe"),
    archive: path.join(resources, "app.asar"),
    unpacked: path.join(resources, "app.asar.unpacked"),
  };
}

export async function validateWindowsRuntime(runtimePath) {
  const layout = runtimeLayout(runtimePath);
  if (!(await stat(layout.executable)).isFile() || !(await stat(layout.unpacked)).isDirectory()) {
    throw new Error(`Incomplete Grok Bot Windows runtime at ${runtimePath}`);
  }
  const archive = await readFile(layout.archive);
  const digest = createHash("sha256").update(archive).digest("hex");
  if (digest !== windowsAsarSha256) {
    throw new Error(`Windows app.asar checksum mismatch: expected ${windowsAsarSha256}, got ${digest}`);
  }
  const appPackage = JSON.parse(extractFile(layout.archive, "package.json").toString("utf8"));
  if (appPackage.version !== upstreamVersion) {
    throw new Error(`Expected Grok Bot ${upstreamVersion}, got ${String(appPackage.version)} at ${runtimePath}`);
  }
  return layout.root;
}

export async function resolveRuntimeApp() {
  const configuredWindowsRuntime = process.env.GROK_BOT_018_WINDOWS_RUNTIME?.trim();
  if (configuredWindowsRuntime) return await validateWindowsRuntime(path.resolve(configuredWindowsRuntime));
  if (await exists(cachedWindowsRuntime)) return await validateWindowsRuntime(cachedWindowsRuntime);
  throw new Error("Missing Grok Bot 0.18.0 Windows runtime. Run `npm run bootstrap:windows` first.");
}

export async function hydrateSourcePayloadFromAsar(archive, {
  destination = sourceAppDir,
  expectedSha256 = windowsAsarSha256,
} = {}) {
  const bytes = await readFile(archive);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Upstream app.asar checksum mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  }

  const hydrationRoot = path.join(cacheDir, "source-payloads");
  await mkdir(hydrationRoot, { recursive: true });
  const temporary = await mkdtemp(path.join(hydrationRoot, "grok-bot-018-"));
  try {
    extractAll(archive, temporary);
    for (const required of [
      "dist/electron-main/main.cjs",
      "dist/host/host-main.cjs",
      "dist/renderer/index.html",
    ]) {
      if (!(await stat(path.join(temporary, required))).isFile()) {
        throw new Error(`Upstream app.asar is missing ${required}`);
      }
    }
    await mkdir(destination, { recursive: true });
    await rm(path.join(destination, "dist"), { recursive: true, force: true });
    await cp(path.join(temporary, "dist"), path.join(destination, "dist"), {
      recursive: true,
      dereference: false,
      preserveTimestamps: true,
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return { archive, sha256: actualSha256, destination: path.join(destination, "dist") };
}

export async function hydrateSourcePayloadFromRuntime(runtimeApp, options = {}) {
  const validated = await validateWindowsRuntime(runtimeApp);
  const archive = runtimeLayout(validated).archive;
  const expectedSha256 = options.expectedSha256 ?? windowsAsarSha256;
  return hydrateSourcePayloadFromAsar(archive, { ...options, expectedSha256 });
}

export async function copyTree(source, destination) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, dereference: false, preserveTimestamps: true });
}
