import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { capture } from "./lib/process.mjs";
import { repoRoot } from "./lib/config.mjs";

const git = process.platform === "win32" ? "git.exe" : "git";
const listed = await capture(
  git,
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: repoRoot },
);
const files = listed.split("\0").filter(Boolean);
const maximumTextBytes = 2 * 1024 * 1024;
const forbiddenNames = new Set([
  "auth.json",
  "codex-auth.json",
  "chatgpt-auth.json",
  "sand-secrets.json",
  "inference-router-transcript.json",
]);
const secretPatterns = [
  ["private key", new RegExp(["-----BEGIN ", "(?:RSA |EC |OPENSSH )?", "PRIVATE KEY-----"].join(""), "g")],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{20,}/g],
  ["OpenAI token", /(?<![A-Za-z0-9_-])sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{20,}/g],
  ["AWS access key", /AKIA[0-9A-Z]{16}/g],
  ["Google API key", /AIza[0-9A-Za-z_-]{30,}/g],
  ["serialized session token", /["'](?:access_token|refresh_token|id_token)["']\s*:\s*["'][^"'\r\n]{20,}["']/gi],
];

const personalRoots = [process.env.USERPROFILE, process.env.HOME]
  .filter(Boolean)
  .flatMap(value => [value, value.replaceAll("\\", "/")])
  .filter((value, index, values) => value.length > 3 && values.indexOf(value) === index);
const findings = [];

for (const relativeFile of files) {
  const lowerName = path.basename(relativeFile).toLowerCase();
  const pathSegments = relativeFile.toLowerCase().split(/[\\/]/);
  if (pathSegments.includes(".codex")) {
    findings.push(`${relativeFile}: local Codex configuration or session data`);
    continue;
  }
  if ((lowerName === ".env" || lowerName.startsWith(".env.")) && lowerName !== ".env.example") {
    findings.push(`${relativeFile}: credential environment file`);
    continue;
  }
  if (forbiddenNames.has(lowerName)) {
    findings.push(`${relativeFile}: local session or transcript file`);
    continue;
  }

  const absoluteFile = path.join(repoRoot, relativeFile);
  let metadata;
  try {
    metadata = await stat(absoluteFile);
  } catch {
    continue;
  }
  if (!metadata.isFile() || metadata.size > maximumTextBytes) continue;

  const bytes = await readFile(absoluteFile);
  if (bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.push(`${relativeFile}: possible ${label}`);
  }
  for (const personalRoot of personalRoots) {
    if (text.toLowerCase().includes(personalRoot.toLowerCase())) {
      findings.push(`${relativeFile}: absolute path under the current user profile`);
      break;
    }
  }
}

if (findings.length) {
  console.error("Publication secret scan found items that require review:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Publication secret scan passed for ${files.length} tracked and untracked source files.`);
}
