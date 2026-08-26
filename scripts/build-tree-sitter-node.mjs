import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { repoRoot } from "./lib/config.mjs";

const packages = ["tree-sitter", "tree-sitter-bash"];
const dependencies = ["node-addon-api", "node-gyp-build"];

function nodeRuntimeCacheRoot() {
  return path.join(repoRoot, ".cache", "tree-sitter-node", process.versions.modules, `${process.platform}-${process.arch}`);
}

function runNodeGyp(target) {
  const nodeGypCommand = process.platform === "win32"
    ? path.join(repoRoot, "node_modules", ".bin", "node-gyp.cmd")
    : path.join(repoRoot, "node_modules", ".bin", "node-gyp");
  const environment = { ...process.env };
  for (const key of ["npm_config_runtime", "npm_config_target", "npm_config_disturl", "npm_config_nodedir"]) delete environment[key];
  environment.npm_config_build_from_source = "true";
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : nodeGypCommand;
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", `"${nodeGypCommand}" rebuild --directory "${target}" --release`]
      : ["rebuild", "--directory", target, "--release"];
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: environment,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`node-gyp exited with ${code} for ${path.basename(target)}`)));
  });
}

async function hasNodeRuntimeBinaries(root) {
  for (const alternatives of [
    [
      "tree-sitter/build/Release/tree_sitter_runtime_binding.node",
      `tree-sitter/prebuilds/${process.platform}-${process.arch}/tree-sitter.node`,
    ],
    [
      "tree-sitter-bash/build/Release/tree_sitter_bash_binding.node",
      `tree-sitter-bash/prebuilds/${process.platform}-${process.arch}/tree-sitter-bash.node`,
    ],
  ]) {
    let found = false;
    for (const relative of alternatives) {
      try { await readFile(path.join(root, relative)); found = true; break; }
      catch {}
    }
    if (!found) return false;
  }
  return true;
}

function validateNodeTreeSitterRuntime(root) {
  const probe = `require(${JSON.stringify(path.join(root, "tree-sitter"))});require(${JSON.stringify(path.join(root, "tree-sitter-bash"))});`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", probe], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`tree-sitter runtime probe exited with ${code}`)));
  });
}

export async function ensureNodeTreeSitterRuntime() {
  const cacheRoot = nodeRuntimeCacheRoot();
  if (await hasNodeRuntimeBinaries(cacheRoot)) {
    await validateNodeTreeSitterRuntime(cacheRoot);
    return cacheRoot;
  }

  const temporaryRoot = await mkdtemp(path.join(repoRoot, ".tmp-tree-sitter-node-"));
  try {
    const packageRoot = path.join(temporaryRoot, "node_modules");
    await mkdir(packageRoot, { recursive: true });
    for (const packageName of [...packages, ...dependencies]) {
      await cp(
        path.join(repoRoot, "node_modules", packageName),
        path.join(packageRoot, packageName),
        { recursive: true, dereference: true },
      );
    }
    const runtimeNodeModules = path.join(packageRoot, "node_modules");
    await mkdir(runtimeNodeModules, { recursive: true });
    for (const packageName of dependencies) {
      await cp(path.join(packageRoot, packageName), path.join(runtimeNodeModules, packageName), { recursive: true, dereference: true });
    }
    if (process.platform === "win32" && await hasNodeRuntimeBinaries(packageRoot)) {
      await validateNodeTreeSitterRuntime(packageRoot);
      console.log("Using lockfile-pinned Windows x64 tree-sitter N-API prebuilds for the Node helper runtime.");
    } else {
      for (const packageName of packages) await runNodeGyp(path.join(packageRoot, packageName));
      await validateNodeTreeSitterRuntime(packageRoot);
    }
    await rm(cacheRoot, { recursive: true, force: true });
    await mkdir(path.dirname(cacheRoot), { recursive: true });
    await cp(packageRoot, cacheRoot, { recursive: true, dereference: true });
    return cacheRoot;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function stageNodeTreeSitterRuntime(outputRoot) {
  const cacheRoot = await ensureNodeTreeSitterRuntime();
  const destination = path.join(outputRoot, "dist", "node-deps");
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(cacheRoot, destination, { recursive: true, dereference: true });
  const runtimeNodeModules = path.join(destination, "node_modules");
  await mkdir(runtimeNodeModules, { recursive: true });
  for (const packageName of dependencies) {
    await cp(path.join(cacheRoot, packageName), path.join(runtimeNodeModules, packageName), { recursive: true, dereference: true });
  }
  return destination;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify({ node: process.version, modules: process.versions.modules, output: await ensureNodeTreeSitterRuntime() }, null, 2));
}
