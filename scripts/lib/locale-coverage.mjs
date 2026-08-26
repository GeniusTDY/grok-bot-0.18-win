/**
 * Build-time locale coverage gate.
 *
 * The shipped renderer is the byte-preserved, checksum-pinned upstream artifact;
 * its visible copy is localized by the injected locale runtime
 * (`frontend/src/locale/*`). That runtime is only as complete as its catalog, so
 * newly surfaced copy would otherwise ship untranslated and silently.
 *
 * This module closes that hole:
 *   1. harvest every string literal from the pinned first-party renderer assets,
 *   2. narrow it to copy that the readable mirror (`frontend/src/recovered/**`)
 *      also produces, which removes minifier noise and third-party bundles,
 *   3. run the *real* engine (`translateCopy`) against each candidate,
 *   4. fail the build when anything translatable-looking is not covered.
 *
 * Step 3 deliberately executes the same module the renderer ships, so the gate can
 * never drift from runtime behavior.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { build as esbuild } from "esbuild";

import { repoRoot } from "./config.mjs";

const RENDERER_ASSETS_DIR = ["src", "app", "dist", "renderer", "assets"];
const RECOVERED_DIR = ["frontend", "src", "recovered"];
const RENDERER_ASSETS_MANIFEST = ["frontend", "manifests", "renderer-runtime-assets.json"];
const ENGINE_ENTRYPOINT = ["frontend", "src", "locale", "translate.ts"];

const CANDIDATE_SHAPE = /^[A-Z0-9][A-Za-z0-9 ,.'’&%()\/:;+\-–—!?]*$/;

const CSS_LIKE = [
  /^[\d\s.,%]+$/,
  /\d+(\.\d+)?px\b/,
  /\b(rgba?|hsla?)\(/,
  /var\(--/,
  /#[0-9a-fA-F]{3,8}\b/,
  /\b(currentColor|transparent|inherit)\b/,
  /\bfr\b/,
  /\bauto\b/,
  /\b(solid|dashed|dotted)\b/,
  /\blinear\b/,
  /^-?\d+(\.\d+)?(px|em|rem|%)?\s+-?\d/,
];

const THIRD_PARTY_PREFIXES = [
  "mermaid", "diagram", "Diagram-", "katex", "xlsx", "pdf", "emojibase", "iamcal",
  "compact", "messages", "cytoscape", "dagre", "cose-", "layout-", "map-", "DefaultCode",
  "arc-", "ordinal-", "scroll-pane", "sizeCapture", "graph-", "channel-", "connector-card",
  "linear-", "init-", "defaultLocale", "abnf", "architecture", "block", "c4", "classDiagram",
  "cynefin", "ebnf", "erDiagram", "flowDiagram", "gantt", "gitGraph", "infoDiagram",
  "ishikawa", "journey", "kanban", "mindmap", "pegDiagram", "pieDiagram", "quadrant",
  "railroad", "requirement", "sankey", "sequence", "stateDiagram", "swimlanes", "timeline",
  "venn", "wardley", "xychart",
];

/**
 * First-party literals that are deliberately *not* translated:
 *   - product names and platform identifiers that must stay verbatim,
 *   - font family names referenced only from generated CSS,
 *   - sentence fragments that only exist in the bundle because a larger sentence
 *     is composed at runtime (the composed sentence itself is covered by a
 *     dictionary entry or a rule).
 */
export const IGNORED_COPY = Object.freeze([
  "Microsoft 365",
  "Segoe UI",
  "An agent is",
  "Courier New",
  "Liberation Mono",
]);

const SVG_PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz][0-9MmLlHhVvCcSsQqTtAaZz\s.,\-+]*$/;

/**
 * True for SVG path geometry (`d` attributes). Path data is only ever consumed
 * by the renderer as vector geometry, never shown as copy, so it must not be
 * demanded of the translation catalog.
 */
function looksLikeSvgPath(value) {
  return value.length > 24 && /\d/.test(value) && SVG_PATH_DATA.test(value);
}

function looksLikeStyle(value) {
  return CSS_LIKE.some((pattern) => pattern.test(value)) || looksLikeSvgPath(value);
}

/**
 * True when a raw string literal looks like translatable UI copy rather than CSS,
 * a URL, an identifier or an escaped code fragment.
 */
export function isCopyCandidate(value) {
  return (
    CANDIDATE_SHAPE.test(value) &&
    value.includes(" ") &&
    value.length >= 5 &&
    !value.includes("://") &&
    !value.includes("\\") &&
    !looksLikeStyle(value)
  );
}

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Every maximal run between two consecutive unescaped occurrences of `quote`.
 *
 * A quoted literal's body is always exactly such a run: it opens with a quote,
 * contains no unescaped quote, and closes with the next one. Pairing-based
 * extraction (`/"..."/`) instead assumes the whole file is balanced, which
 * minified bundles violate — a stray quote inside a regex literal or a
 * single-quoted string flips the local parity, so the very next real literal is
 * read as the *interior* of a bogus pair and never surfaces. Scanning runs is
 * immune to that, so no visible copy can slip past the gate.
 */
export function extractQuotedRuns(text, quote) {
  const runs = [];
  let previous = -1;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== quote) continue;
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) backslashes += 1;
    if (backslashes % 2 === 1) continue;
    if (previous !== -1) runs.push(text.slice(previous + 1, index));
    previous = index;
  }
  return runs;
}

function collectQuotedLiterals(text, into) {
  for (const quote of ['"', "'"]) {
    for (const run of extractQuotedRuns(text, quote)) {
      if (isCopyCandidate(run)) into.add(run);
    }
  }
}

/** English copy authored in the readable mirror of the pinned renderer. */
export async function collectRecoveredCopy() {
  const literals = new Set();
  for (const file of await walk(path.join(repoRoot, ...RECOVERED_DIR))) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    collectQuotedLiterals(await readFile(file, "utf8"), literals);
  }
  return literals;
}

async function readPinnedImmutableAssets() {
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, ...RENDERER_ASSETS_MANIFEST), "utf8"),
  );
  return new Set((manifest.immutableAssets ?? []).map((asset) => asset.file));
}

function isThirdPartyAsset(file, pinned) {
  return pinned.has(file) || THIRD_PARTY_PREFIXES.some((prefix) => file.startsWith(prefix));
}

/** Copy candidates found in the pinned first-party renderer bundles. */
export async function collectRendererCopy() {
  const assetsDir = path.join(repoRoot, ...RENDERER_ASSETS_DIR);
  const pinned = await readPinnedImmutableAssets();
  const candidates = new Map();
  for (const file of (await readdir(assetsDir)).filter((name) => name.endsWith(".js")).sort()) {
    if (isThirdPartyAsset(file, pinned)) continue;
    const text = await readFile(path.join(assetsDir, file), "utf8");
    for (const quote of ['"', "'"]) {
      for (const raw of extractQuotedRuns(text, quote)) {
        if (!isCopyCandidate(raw)) continue;
        if (!candidates.has(raw)) candidates.set(raw, []);
        candidates.get(raw).push(file);
      }
    }
  }
  return candidates;
}

/** Loads the exact engine the renderer ships, so the gate cannot drift from it. */
export async function createEngineLookup() {
  const result = await esbuild({
    absWorkingDir: repoRoot,
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "neutral",
    sourcemap: false,
    target: "node22",
    write: false,
    entryPoints: [path.join(repoRoot, ...ENGINE_ENTRYPOINT)],
  });
  const code = result.outputFiles[0].text;
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  return module.translateCopy;
}

export async function analyzeLocaleCoverage() {
  const translateCopy = await createEngineLookup();
  const recoveredCopy = await collectRecoveredCopy();
  const rendererCopy = await collectRendererCopy();

  const firstPartyCopy = [...rendererCopy.keys()].filter((value) => recoveredCopy.has(value)).sort();

  const covered = [];
  const ignored = [];
  const uncovered = [];
  for (const value of firstPartyCopy) {
    if (IGNORED_COPY.includes(value)) {
      ignored.push(value);
      continue;
    }
    if (translateCopy(value) != null) covered.push(value);
    else uncovered.push(value);
  }

  return { recoveredCopy, rendererCopy, firstPartyCopy, covered, ignored, uncovered };
}

export async function assertLocaleCoverage() {
  const report = await analyzeLocaleCoverage();
  if (report.uncovered.length > 0) {
    const listing = report.uncovered.map((value, index) => `  ${index + 1}. ${JSON.stringify(value)}`).join("\n");
    throw new Error(
      `locale coverage gate: ${report.uncovered.length} visible renderer string(s) are not covered by the injected catalog.\n` +
        `Add them to frontend/src/locale/dictionary.ts, cover them with a rule in frontend/src/locale/patterns.ts, ` +
        `or record a deliberate exclusion in IGNORED_COPY (scripts/lib/locale-coverage.mjs).\n${listing}`,
    );
  }
  return report;
}
