import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { outputWindowsDir, outputWindowsExe } from "./lib/config.mjs";

if (process.platform !== "win32") throw new Error("The Windows smoke check requires Windows.");

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address != null ? address.port : null;
  await new Promise(resolve => server.close(resolve));
  if (!Number.isInteger(port)) throw new Error("Could not allocate a Chromium debugging port.");
  return port;
}

async function runUtility(command, args) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    child.once("error", () => resolve());
    child.once("exit", () => resolve());
  });
}

const temporaryBase = path.resolve(tmpdir());
const userDataRoot = await mkdtemp(path.join(temporaryBase, "grok-bot-win32-smoke-"));
const relativeUserData = path.relative(temporaryBase, userDataRoot);
if (relativeUserData.startsWith("..") || path.isAbsolute(relativeUserData)) {
  throw new Error(`Refusing to use a smoke profile outside the OS temporary directory: ${userDataRoot}`);
}

const debugPort = await freePort();
const smokeScheme = `sand-reconstructed-smoke-${process.pid}`;
let output = "";
let exited;
const child = spawn(outputWindowsExe, [`--remote-debugging-port=${debugPort}`], {
  cwd: outputWindowsDir,
  env: {
    ...process.env,
    SAND_USER_DATA_DIR: userDataRoot,
    SAND_DATA_ROOT: path.join(userDataRoot, "sand-data"),
    SAND_DISABLE_UPDATES: "1",
    SAND_DISABLE_SENTRY: "1",
    SAND_DISABLE_TELEMETRY: "1",
    SAND_DISABLE_ANALYTICS: "1",
    SAND_AUTH_REDIRECT_TARGET: smokeScheme,
    SAND_AUTH_CALLBACK_SCHEME: smokeScheme,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
child.stdout.on("data", chunk => { output = `${output}${chunk}`.slice(-64 * 1024); });
child.stderr.on("data", chunk => { output = `${output}${chunk}`.slice(-64 * 1024); });
child.once("exit", (code, signal) => { exited = { code, signal }; });

try {
  const deadline = Date.now() + 25_000;
  let pages;
  while (Date.now() < deadline && exited == null) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        const candidate = await response.json();
        if (Array.isArray(candidate) && candidate.some(page => page?.type === "page")) {
          pages = candidate;
          break;
        }
      }
    } catch {}
    await delay(250);
  }
  if (pages == null) {
    throw new Error(exited == null
      ? `No renderer page appeared before the smoke timeout.\n${output}`
      : `The Windows application exited early (${exited.code ?? exited.signal}).\n${output}`);
  }
  console.log(JSON.stringify({
    status: "pass",
    executable: outputWindowsExe,
    rendererPages: pages.map(page => ({ title: page.title, type: page.type, url: page.url })),
    isolatedUserData: userDataRoot,
  }, null, 2));
} finally {
  if (child.pid != null) await runUtility("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"]);
  await runUtility("reg.exe", ["delete", `HKCU\\Software\\Classes\\${smokeScheme}`, "/f"]);
  await delay(250);
  await rm(userDataRoot, { recursive: true, force: true });
}
