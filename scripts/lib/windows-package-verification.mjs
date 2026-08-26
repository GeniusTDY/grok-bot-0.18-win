import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { extractFile } from "@electron/asar";

import { reconstructedName, upstreamVersion } from "./config.mjs";
import { runtimeLayout, validateWindowsRuntime } from "./runtime.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const extractText = (archive, relative) => extractFile(archive, relative.split("/").join(path.sep)).toString("utf8");

async function fileRecord(target) {
  const bytes = await readFile(target);
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
}

async function inventory(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(root, target));
    else if (entry.isFile()) files.push({
      path: path.relative(root, target).split(path.sep).join("/"),
      ...await fileRecord(target),
    });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function assertFile(target, label) {
  if (!(await stat(target)).isFile()) throw new Error(`Missing ${label}: ${target}`);
}

export async function verifyReconstructedWindowsPackage({
  officialRuntime,
  reconstructedRoot,
  reconstructedExecutable,
  sourceAsar,
  sourceUnpackedRoot,
}) {
  const officialRoot = await validateWindowsRuntime(officialRuntime);
  const official = runtimeLayout(officialRoot);
  const packagedResources = path.join(reconstructedRoot, "resources");
  const packagedAsar = path.join(packagedResources, "app.asar");
  const packagedUnpacked = path.join(packagedResources, "app.asar.unpacked");

  for (const [target, label] of [
    [reconstructedExecutable, "reconstructed Windows executable"],
    [packagedAsar, "packaged app.asar"],
    [path.join(packagedUnpacked, "dist", "native", "sand-webauthn-signer.exe"), "Windows WebAuthn helper"],
    [path.join(packagedUnpacked, "dist", "deps", "better-sqlite3", "build", "Release", "better_sqlite3.node"), "Windows SQLite native binding"],
    [path.join(packagedUnpacked, "dist", "deps", "tree-sitter-bash", "prebuilds", "win32-x64", "tree-sitter-bash.node"), "Windows tree-sitter Bash binding"],
    [path.join(packagedUnpacked, "dist", "deps", "whichlang-node-win32-x64-msvc", "whichlang-node.win32-x64-msvc.node"), "Windows language detector binding"],
  ]) await assertFile(target, label);

  const [officialShell, packagedShell, builtArchive, packagedArchive, builtUnpacked, copiedUnpacked] = await Promise.all([
    fileRecord(official.executable),
    fileRecord(reconstructedExecutable),
    fileRecord(sourceAsar),
    fileRecord(packagedAsar),
    inventory(sourceUnpackedRoot),
    inventory(packagedUnpacked),
  ]);
  if (officialShell.sha256 !== packagedShell.sha256) throw new Error("The checksum-pinned Windows Electron shell changed during packaging.");
  if (builtArchive.sha256 !== packagedArchive.sha256) throw new Error("The packaged Windows app.asar differs from the verified build output.");
  if (JSON.stringify(builtUnpacked) !== JSON.stringify(copiedUnpacked)) throw new Error("The packaged Windows app.asar.unpacked inventory drifted.");

  const appPackage = JSON.parse(extractText(packagedAsar, "package.json"));
  if (appPackage.version !== upstreamVersion || appPackage.productName !== reconstructedName || appPackage.reconstructed !== true) {
    throw new Error("The packaged Windows application identity is not the reconstructed identity.");
  }
  const electronMain = extractText(packagedAsar, "dist/electron-main/main.cjs");
  for (const guard of ["SAND_DISABLE_UPDATES", "SAND_DISABLE_SENTRY", "SAND_DISABLE_TELEMETRY"]) {
    if (!electronMain.includes(guard)) throw new Error(`The packaged Electron main is missing ${guard}.`);
  }
  const routerExtension = JSON.parse(extractText(packagedAsar, "dist/renderer-router-extension.json"));
  if (!routerExtension.features?.includes("settings-router-provider")) throw new Error("The packaged renderer is missing the Router extension.");
  const localeExtension = JSON.parse(extractText(packagedAsar, "dist/renderer-locale-extension.json"));
  for (const feature of ["system-language-detection", "simplified-chinese-deep-translation", "english-default-fallback"]) {
    if (!localeExtension.features?.includes(feature)) throw new Error(`The packaged renderer is missing the locale runtime feature: ${feature}.`);
  }
  const localeAsset = extractFile(packagedAsar, localeExtension.asset.split("/").join(path.sep));
  if (localeAsset.byteLength !== localeExtension.assetBytes || sha256(localeAsset) !== localeExtension.assetSha256) {
    throw new Error("The packaged renderer locale runtime drifted from its embedded provenance.");
  }
  const localeCoverage = localeExtension.coverage;
  if (!localeCoverage || localeCoverage.uncovered !== 0 || localeCoverage.covered !== localeCoverage.firstPartyStrings - localeCoverage.ignored) {
    throw new Error("The packaged renderer locale runtime does not carry a complete, zero-uncovered coverage record.");
  }
  const rendererHtml = extractText(packagedAsar, "dist/renderer/index.html");
  if (typeof localeExtension.scriptTag !== "string" || !rendererHtml.includes(localeExtension.scriptTag)) {
    throw new Error("The packaged renderer HTML does not load the locale runtime.");
  }

  return {
    schemaVersion: 1,
    platform: "win32",
    arch: "x64",
    version: upstreamVersion,
    identity: { productName: appPackage.productName, reconstructed: appPackage.reconstructed },
    electronShell: packagedShell,
    appAsar: packagedArchive,
    unpacked: {
      fileCount: copiedUnpacked.length,
      inventorySha256: sha256(JSON.stringify(copiedUnpacked)),
    },
    routerExtension: {
      mode: routerExtension.mode,
      features: routerExtension.features,
      chunks: routerExtension.chunks,
    },
    localeExtension: {
      mode: localeExtension.mode,
      features: localeExtension.features,
      asset: localeExtension.asset,
      assetSha256: localeExtension.assetSha256,
      languages: localeExtension.languages,
      defaultLanguage: localeExtension.defaultLanguage,
      sourceCount: localeExtension.sources?.length ?? 0,
      coverage: localeExtension.coverage,
    },
    updaterDisabled: true,
    telemetryDisabledByDefault: true,
  };
}
