import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";

import { run } from "./lib/process.mjs";
import { outputWindowsDir, outputWindowsExe, repoRoot } from "./lib/config.mjs";

if (process.platform !== "win32") {
  throw new Error("The desktop shortcut installer is available only on Windows.");
}

await access(outputWindowsExe).catch(() => {
  throw new Error("The portable app is missing. Run `npm run package:windows` first.");
});

const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) throw new Error("LOCALAPPDATA is unavailable.");

const programsRoot = path.resolve(localAppData, "Programs");
const installDir = path.resolve(programsRoot, "GrokBot018Reconstructed");
const relativeInstallDir = path.relative(programsRoot, installDir);
if (!relativeInstallDir || relativeInstallDir.startsWith("..") || path.isAbsolute(relativeInstallDir)) {
  throw new Error(`Refusing unexpected installation path: ${installDir}`);
}

await mkdir(installDir, { recursive: true });
await cp(outputWindowsDir, installDir, { recursive: true, force: true });
await cp(
  path.join(repoRoot, "scripts", "windows", "Launch Grok Bot.vbs"),
  path.join(installDir, "Launch Grok Bot.vbs"),
  { force: true },
);
await run("cscript.exe", [
  "//nologo",
  path.join(repoRoot, "scripts", "windows", "Create Desktop Shortcut.vbs"),
  installDir,
]);

console.log(`Installed the portable application at ${installDir}`);
console.log("Created or refreshed the desktop shortcut: Grok Bot 0.18 Reconstructed.lnk");
