import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { transform } from "esbuild";
import { patchOriginalSettingsPanel, patchOriginalTranscriptRows, patchOriginalWindowChromeTone } from "../scripts/lib/router-renderer-patch.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routerSourcePath = path.join(repoRoot, "frontend/src/recovered/features/settings/overlay/router.ts");

async function loadRouterModule() {
  const source = await readFile(routerSourcePath, "utf8");
  const { code: output } = await transform(source, { format: "esm", loader: "ts", target: "es2022" });
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("router provider preference defaults to Cursor and round-trips every provider", async () => {
  const router = await loadRouterModule();
  assert.deepEqual(router.ROUTER_PROVIDERS.map(({ id }) => id), ["cursor", "claude-code", "codex", "openrouter"]);
  assert.equal(router.parseRouterProviderPreference(null), "cursor");
  assert.equal(router.parseRouterProviderPreference("not-json"), "cursor");
  assert.equal(router.parseRouterProviderPreference(JSON.stringify({ schemaVersion: 1, provider: "unknown" })), "cursor");

  let stored = null;
  const persistence = {
    async read(key) {
      assert.equal(key, router.ROUTER_PROVIDER_PERSISTENCE_KEY);
      return stored;
    },
    async write(key, value) {
      assert.equal(key, router.ROUTER_PROVIDER_PERSISTENCE_KEY);
      stored = value;
    }
  };
  for (const provider of router.ROUTER_PROVIDERS) {
    await router.saveRouterProvider(persistence, provider.id);
    assert.equal(await router.loadRouterProvider(persistence), provider.id);
  }
});

test("settings registry exposes Router with the native settings icon contract", async () => {
  const source = await readFile(path.join(repoRoot, "frontend/src/recovered/features/settings/overlay/view.tsx"), "utf8");
  assert.match(source, /\{ id: "router", label: "Router", icon: "git-branch" \}/);
});

test("renderer transcript patch sorts chronology and preserves colliding message ids", () => {
  const source = 'const r=s?UIn(n):n,i=[];let o=null;const l=new Set;let c=null,u=!1;const d=e==null?t:null;let m=!1;for(const f of r){';
  const patched = patchOriginalTranscriptRows(source);
  assert.match(patched, /sort\(\(f,h\)=>\(f\.timestampMs\?\?0\)-\(h\.timestampMs\?\?0\)\)/);
  assert.match(patched, /RTranscriptIdCounts/);
  assert.match(patched, /id:f\.id\+"~"\+String\(f\.timestampMs\?\?h\)\+"~"\+v/);
  assert.doesNotMatch(patched, /p\.has\(f\.id\)/);
});

test("renderer settings panel patch keeps the muted Updates nav entry byte-valid", async () => {
  const assetsDir = path.join(repoRoot, "src/app/dist/renderer/assets");
  let source = null;
  for (const name of await readdir(assetsDir)) {
    if (!name.endsWith(".js")) continue;
    const text = await readFile(path.join(assetsDir, name), "utf8");
    if (text.includes("Rs.interactive,be&&We.navItemActive).className),")) {
      source = text;
      break;
    }
  }
  assert.ok(source !== null, "frozen settings panel chunk was not found");
  const patched = patchOriginalSettingsPanel(source);
  assert.match(patched, /className\+\(fe\.id==="beta"\?" sand-4b2ntj":""\)\),"data-active"/);
  assert.match(patched, /className:fe\.id==="beta"\?"sand-9f619 sand-4b2ntj":\(/);
  await assert.doesNotReject(transform(patched, { format: "esm", loader: "js", target: "chrome120" }));
});

test("renderer window chrome patch keeps the native caption controls on the overlay tone for Settings", async () => {
  const assetsDir = path.join(repoRoot, "src/app/dist/renderer/assets");
  const originalMount = "p.jsx(xPe,{isOverlayTone:c})";
  const originalOnboardingMount = "let Ft;e[110]!==Be?(Ft=p.jsx(Be,{}),e[110]=Be,e[111]=Ft):Ft=e[111];";
  const originalOnboardingMemo = "const e=he.c(131),{onComplete:t,presentation:s}=n";
  let source = null;
  for (const name of await readdir(assetsDir)) {
    if (!name.endsWith(".js")) continue;
    const text = await readFile(path.join(assetsDir, name), "utf8");
    if (text.includes(originalMount) && text.includes(originalOnboardingMount) && text.includes(originalOnboardingMemo)) {
      source = text;
      break;
    }
  }
  assert.ok(source !== null, "frozen window chrome chunk was not found");
  const patched = patchOriginalWindowChromeTone(source);
  assert.match(patched, /p\.jsx\(xPe,\{isOverlayTone:c\|\|r===na\.settings\}\)/);
  assert.match(patched, /p\.jsx\(Be,\{isOverlayTone:R!=null\}\)/);
  assert.match(patched, /e\[110\]!==Be\|\|e\[131\]!==R\?/);
  assert.match(patched, /const e=he\.c\(132\),\{onComplete:t,presentation:s\}=n/);
  assert.equal(patched.includes(originalMount), false);
  assert.equal(patched.includes(originalOnboardingMount), false);
  assert.equal(patched.includes("p.jsx(Be,{})"), false);
  const inserted = "||r===na.settings".length + "||e[131]!==R".length + "isOverlayTone:R!=null".length + ",e[131]=R".length;
  assert.equal(patched.length - source.length, inserted);
  await assert.doesNotReject(transform(patched, { format: "esm", loader: "js", target: "chrome120" }));
});
