import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { build as esbuild } from "esbuild";

import { repoRoot } from "./config.mjs";
import { assertLocaleCoverage } from "./locale-coverage.mjs";

export const localeAssetFile = "locale-runtime.js";
export const localeAssetPath = `dist/renderer/assets/${localeAssetFile}`;
export const localeProvenancePath = "dist/renderer-locale-extension.json";
export const localeScriptTag = `<script src="./assets/${localeAssetFile}"></script>`;
export const localeFeatures = Object.freeze([
  "system-language-detection",
  "simplified-chinese-deep-translation",
  "english-default-fallback",
  "template-rule-catalog",
  "pre-paint-boot-mask",
  "sub-frame-translation",
]);

const localeSourceFiles = Object.freeze([
  "frontend/src/locale/locale.ts",
  "frontend/src/locale/dictionary.ts",
  "frontend/src/locale/patterns.ts",
  "frontend/src/locale/translate.ts",
  "frontend/src/locale/deep-translate.ts",
  "frontend/src/locale/install.ts",
]);

const localeEntrypoint = "frontend/src/locale/install.ts";

const localeEntry = `
import { applyBootMask, installLocale } from "./frontend/src/locale/install";

applyBootMask();

const root = document.body ?? document.documentElement;
const boot = () => installLocale(root);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
`;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function bundleLocaleRuntime() {
  const result = await esbuild({
    absWorkingDir: repoRoot,
    banner: { js: `// Deterministic locale runtime bundle: ${localeEntrypoint}` },
    bundle: true,
    charset: "utf8",
    format: "iife",
    legalComments: "none",
    logLevel: "silent",
    minify: false,
    platform: "browser",
    sourcemap: false,
    stdin: {
      contents: localeEntry,
      loader: "ts",
      resolveDir: repoRoot,
      sourcefile: "scripts/build-entry/locale-runtime.ts",
    },
    target: "chrome120",
    write: false,
  });
  return Buffer.from(result.outputFiles[0].contents);
}

export async function buildLocaleRuntimeAsset({ stageRoot }) {
  const coverage = await assertLocaleCoverage();
  const assetBytes = await bundleLocaleRuntime();
  const assetTarget = path.join(stageRoot, ...localeAssetPath.split("/"));
  await mkdir(path.dirname(assetTarget), { recursive: true });
  await writeFile(assetTarget, assetBytes);

  const htmlPath = path.join(stageRoot, "dist", "renderer", "index.html");
  let html = await readFile(htmlPath, "utf8");
  if (!html.includes(localeScriptTag)) {
    if (!html.includes("</head>")) throw new Error("Renderer HTML has no head boundary for the locale runtime script");
    html = html.replace("</head>", `    ${localeScriptTag}\n  </head>`);
    await writeFile(htmlPath, html);
  }

  const sources = [];
  for (const relative of localeSourceFiles) {
    const bytes = await readFile(path.join(repoRoot, ...relative.split("/")));
    sources.push({ path: relative, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }

  const record = {
    schemaVersion: 1,
    mode: "system-language-locale-runtime",
    asset: localeAssetPath,
    assetBytes: assetBytes.byteLength,
    assetSha256: sha256(assetBytes),
    indexHtml: "dist/renderer/index.html",
    scriptTag: localeScriptTag,
    languages: ["en", "zh"],
    defaultLanguage: "en",
    simplifiedChineseLocales: ["zh", "zh-CN", "zh-SG", "zh-Hans"],
    features: [...localeFeatures],
    coverage: {
      firstPartyStrings: coverage.firstPartyCopy.length,
      covered: coverage.covered.length,
      ignored: coverage.ignored.length,
      uncovered: coverage.uncovered.length,
    },
    sources,
  };
  const provenancePath = path.join(stageRoot, ...localeProvenancePath.split("/"));
  await writeFile(provenancePath, `${JSON.stringify(record, null, 2)}\n`);
  return { ...record, provenancePath, provenanceBytes: (await stat(provenancePath)).size };
}
