import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(thisDir, "../..");
export const sourceAppDir = path.join(repoRoot, "src", "app");
export const cacheDir = path.join(repoRoot, ".cache");
export const cachedWindowsRuntime = path.join(cacheDir, "runtime", "win32-x64");
export const cachedWindowsInstaller = path.join(cacheDir, "downloads", "Grok_Bot_0.18.0_Setup.exe");
export const archivedWindowsInstaller = path.join(repoRoot, "research-archives", "original", "0.18.0", "windows-x64", "Grok_Bot_0.18.0_Setup.exe");
export const buildDir = path.join(repoRoot, ".build");
export const stagedAppDir = path.join(buildDir, "app");
export const builtAsar = path.join(buildDir, "app.asar");
export const builtAsarUnpacked = `${builtAsar}.unpacked`;
export const fidelityBuildDir = path.join(buildDir, "fidelity");
export const fidelityStagedAppDir = path.join(fidelityBuildDir, "app");
export const fidelityBuiltAsar = path.join(fidelityBuildDir, "app.asar");
export const fidelityBuiltAsarUnpacked = `${fidelityBuiltAsar}.unpacked`;
export const outputDir = path.join(repoRoot, "dist");
export const outputWindowsDir = path.join(outputDir, "Grok Bot 0.18 Reconstructed-win32-x64");
export const outputWindowsExe = path.join(outputWindowsDir, "Grok Bot 0.18 Reconstructed.exe");
export const recoveredFrontendDir = path.join(repoRoot, "recovered", "frontend");
export const recoveredRendererDir = path.join(recoveredFrontendDir, "app");
export const frontendDir = path.join(repoRoot, "frontend");

export const upstreamVersion = "0.18.0";
export const reconstructedName = "Grok Bot 0.18 Reconstructed";
export const windowsInstallerUrl = "https://downloads.cursor.com/grokbot/stable/win32-x64/0.18.0/Grok_Bot_0.18.0_Setup.exe";
export const windowsInstallerSha256 = "464079a15ef5fa8b61ccea8fffcc78f63cfcf6df65fb0ad5e725d8b95f7e437e";
export const windowsAsarSha256 = "38e85c0e5042c0257db7925e1e55709d6d155d90d92fe26ad654127d509766e0";
