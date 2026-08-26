import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { transform } from "esbuild";

import {
  archivedWindowsInstaller,
  windowsAsarSha256,
  windowsInstallerSha256,
} from "../scripts/lib/config.mjs";
import { runtimeLayout } from "../scripts/lib/runtime.mjs";

test("Windows reconstruction scripts retain the pinned x64 release boundary", async () => {
  const artifacts = JSON.parse(await readFile(new URL("../research-archives/original/0.18.0/artifacts.json", import.meta.url), "utf8"));
  const windows = artifacts.artifacts.find(artifact => artifact.platform === "win32");
  assert.equal(windows.sha256, windowsInstallerSha256);
  assert.equal(path.basename(archivedWindowsInstaller), "Grok_Bot_0.18.0_Setup.exe");
  assert.match(windowsAsarSha256, /^[0-9a-f]{64}$/);

  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["bootstrap:windows"], "node scripts/bootstrap-windows-runtime.mjs");
  assert.equal(packageJson.scripts["package:windows"], "npm run check && node scripts/package-windows.mjs");
  assert.equal(packageJson.scripts["install:windows"], "node scripts/install-windows-portable.mjs");
  assert.equal(packageJson.scripts["verify:windows"], "node scripts/verify-windows.mjs");
  assert.equal(packageJson.scripts["smoke:windows"], "node scripts/smoke-windows.mjs");
});

test("Windows desktop installation uses a stable per-user directory and Docker-aware launcher", async () => {
  const installer = await readFile(new URL("../scripts/install-windows-portable.mjs", import.meta.url), "utf8");
  const launcher = await readFile(new URL("../scripts/windows/Launch Grok Bot.vbs", import.meta.url), "utf8");
  const shortcut = await readFile(new URL("../scripts/windows/Create Desktop Shortcut.vbs", import.meta.url), "utf8");
  const releaseInstaller = await readFile(new URL("../scripts/windows/Install.cmd", import.meta.url), "utf8");

  assert.match(installer, /LOCALAPPDATA/);
  assert.match(installer, /GrokBot018Reconstructed/);
  assert.match(installer, /Create Desktop Shortcut\.vbs/);
  assert.match(launcher, /DockerDesktop\\resources\\bin\\docker\.exe/);
  assert.match(launcher, /DateDiff\("s", startedAt, Now\) < 120/);
  assert.match(launcher, /processEnvironment\("DOCKER_API_VERSION"\) = "1\.44"/);
  assert.match(shortcut, /SpecialFolders\("Desktop"\)/);
  assert.match(shortcut, /wscript\.exe/);
  assert.match(shortcut, /Launch Grok Bot\.vbs/);
  assert.match(releaseInstaller, /GrokBot018Reconstructed/);
  assert.match(releaseInstaller, /robocopy/);
  assert.match(releaseInstaller, /Create Desktop Shortcut\.vbs/);
});

test("runtime layout resolves the Windows portable root", () => {
  const windows = runtimeLayout(path.join(process.cwd(), "win32-x64"));
  assert.equal(windows.platform, "win32");
  assert.equal(windows.executable, path.join(windows.root, "Grok Bot.exe"));
  assert.equal(windows.archive, path.join(windows.root, "resources", "app.asar"));
  assert.equal(windows.unpacked, path.join(windows.root, "resources", "app.asar.unpacked"));
});

test("Windows runtime keeps GPU rendering and avoids invisible browser screenshots", async () => {
  const main = await readFile(new URL("../source/electron-main/main.ts", import.meta.url), "utf8");
  const browserTools = await readFile(new URL("../source/host/runner/tools/sand-browser-tools.ts", import.meta.url), "utf8");
  const providers = await readFile(new URL("../source/host/extensions/inference/provider-session.ts", import.meta.url), "utf8");

  assert.match(main, /SAND_DISABLE_HARDWARE_ACCELERATION/);
  assert.match(main, /platform !== "win32"/);
  assert.doesNotMatch(main, /configureDesktopEnvironment[\s\S]*?deps\.app\.disableHardwareAcceleration\(\);\s*deps\.app\.commandLine\.appendSwitch\("no-sandbox"\)/);
  assert.match(browserTools, /captureActionScreenshots: false/);
  assert.match(browserTools, /spec\.op !== "screenshot"/);
  assert.match(providers, /Use the fewest browser calls needed/);
});

test("local Docker mounts each user's selected Codex profile read-only", async () => {
  const localDocker = await readFile(new URL("../source/electron-main/box/local-docker-host-connector.ts", import.meta.url), "utf8");
  assert.match(localDocker, /process\.env\.CODEX_HOME\?\.trim\(\) \|\| join\(homedir\(\), "\.codex"\)/);
  assert.match(localDocker, /\[codexHome, "\/root\/\.codex"\]/);
  assert.match(localDocker, /dst=\$\{destination\},readonly/);
});

test("Windows background helpers stay hidden and recover transient Docker outages", async () => {
  const [localDocker, localExec, spawnPromise, installer] = await Promise.all([
    readFile(new URL("../source/electron-main/box/local-docker-host-connector.ts", import.meta.url), "utf8"),
    readFile(new URL("../source/electron-main/local-exec/local-exec-native.ts", import.meta.url), "utf8"),
    readFile(new URL("../source/packages/utils/spawn-promise.ts", import.meta.url), "utf8"),
    readFile(new URL("../source/electron-main/update/win32-installer.ts", import.meta.url), "utf8"),
  ]);

  assert.match(localDocker, /LOCAL_DOCKER_API_COMPAT_VERSION = "1\.44"/);
  assert.match(localDocker, /DOCKER_COMMAND_TIMEOUT_MS = 15_000/);
  assert.match(localDocker, /ensureDockerDaemonAvailable/);
  assert.match(localDocker, /localRuntimeValidated && await gatewayReady\(token\)/);
  assert.match(localDocker, /windowsHide: true/);
  assert.match(localExec, /windowsHide: true/);
  assert.match(spawnPromise, /spawnOptions\.windowsHide \?\?= true/);
  assert.match(installer, /windowsHide: true/);
});

test("Windows caption strip matches the surrounding content when an overlay is open", async () => {
  const source = await readFile(new URL("../source/electron-main/window-chrome.ts", import.meta.url), "utf8");
  const { code } = await transform(source, { format: "esm", loader: "ts", target: "es2022" });
  const chrome = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

  const light = chrome.windowsTitleBarOverlayFor("#FCFCFC", true);
  assert.deepEqual(light, { height: 43, color: "rgba(0, 0, 0, 0)", symbolColor: "#000000" });
  assert.notEqual(light.color, "#0E0E0E");

  const dark = chrome.windowsTitleBarOverlayFor("#0B0B0B", true);
  assert.deepEqual(dark, { height: 43, color: "rgba(0, 0, 0, 0)", symbolColor: "#FFFFFF" });

  assert.deepEqual(chrome.windowsTitleBarOverlayFor("#FCFCFC", false), {
    height: 51,
    color: "#FCFCFC",
    symbolColor: "#000000",
  });
  assert.deepEqual(chrome.windowsTitleBarOverlayFor("#0B0B0B", false), {
    height: 51,
    color: "#0B0B0B",
    symbolColor: "#FFFFFF",
  });
});
