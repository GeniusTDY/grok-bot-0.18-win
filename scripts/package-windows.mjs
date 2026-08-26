import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  outputDir,
  outputWindowsDir,
  outputWindowsExe,
  reconstructedName,
} from "./lib/config.mjs";
import { hydrateSourcePayloadFromRuntime, resolveRuntimeApp } from "./lib/runtime.mjs";
import { copyFileTolerant, copyTreeTolerant, moveTolerant, removeTreeTolerant } from "./lib/tolerant-fs.mjs";
import { verifyReconstructedWindowsPackage } from "./lib/windows-package-verification.mjs";

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("The reconstructed Windows package currently targets Windows x64 only.");
}

const runtime = await resolveRuntimeApp();
await hydrateSourcePayloadFromRuntime(runtime);

const { buildFidelityReconstructedAsar } = await import("./clean-build.mjs");
const { builtAsar, builtAsarUnpacked } = await buildFidelityReconstructedAsar();

await mkdir(outputDir, { recursive: true });
await removeTreeTolerant(outputWindowsDir);
await copyTreeTolerant(runtime, outputWindowsDir, { preserveTimestamps: true });

const originalExecutable = path.join(outputWindowsDir, "Grok Bot.exe");
await moveTolerant(originalExecutable, outputWindowsExe);
const resources = path.join(outputWindowsDir, "resources");
const packagedAsar = path.join(resources, "app.asar");
const packagedUnpacked = path.join(resources, "app.asar.unpacked");
await removeTreeTolerant(packagedUnpacked);
await copyFileTolerant(builtAsar, packagedAsar, { preserveTimestamps: true });
await copyTreeTolerant(builtAsarUnpacked, packagedUnpacked, { preserveTimestamps: true });

const verification = await verifyReconstructedWindowsPackage({
  officialRuntime: runtime,
  reconstructedRoot: outputWindowsDir,
  reconstructedExecutable: outputWindowsExe,
  sourceAsar: builtAsar,
  sourceUnpackedRoot: builtAsarUnpacked,
});
await writeFile(path.join(outputWindowsDir, "RECONSTRUCTION.json"), `${JSON.stringify(verification, null, 2)}\n`);
await writeFile(path.join(outputWindowsDir, "README-PORTABLE.txt"), [
  `${reconstructedName} (experimental Windows x64 portable build)`,
  "",
  `Run: ${path.basename(outputWindowsExe)}`,
  "This directory is portable; keep all DLL, locales, and resources files beside the executable.",
  "The build reuses the checksum-pinned Grok Bot 0.18.0 Windows Electron shell and native runtime files.",
  "It is an unofficial local reconstruction and is not Authenticode-signed as a reconstructed release.",
  "",
].join("\r\n"));

console.log(`Packaged Windows application: ${outputWindowsExe}`);
console.log(`Verified ${verification.unpacked.fileCount} unpacked runtime files; app.asar ${verification.appAsar.sha256}`);
