import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLocaleCoverage,
  collectRendererCopy,
  createEngineLookup,
  extractQuotedRuns,
} from "../scripts/lib/locale-coverage.mjs";

test("quoted-run extraction survives unbalanced local quote parity in minified bundles", () => {
  const source =
    'const a={as:"p",id:r,size:"lg",weight:"medium",children:"Something went wrong"};' +
    'const b=\'a " stray quote\';' +
    'const c="Reload";';

  const runs = extractQuotedRuns(source, '"');
  assert.ok(runs.includes("Something went wrong"));
  assert.ok(runs.includes("Reload"));

  const legacy = new Set([...source.matchAll(/"((?:[^"\\\n]|\\.){3,120})"/g)].map((match) => match[1]));
  assert.ok(
    !legacy.has("Something went wrong"),
    "the pairing extractor this test guards against must still be blind to the literal",
  );
});

test("render-error surface copy is translated by the injected engine", async () => {
  const translateCopy = await createEngineLookup();
  assert.equal(translateCopy("Something went wrong"), "出错了");
  assert.equal(translateCopy("Reload"), "重新加载");
  assert.equal(
    translateCopy("Grok Bot hit an unexpected error while rendering. Reloading usually fixes it."),
    "Grok Bot 在渲染时遇到了意外错误。重新加载通常即可解决。",
  );
  assert.equal(translateCopy("Copy error"), "复制错误");
  assert.equal(translateCopy("Copied"), "已复制");
});

test("the injected catalog covers every first-party renderer string", async () => {
  const report = await assertLocaleCoverage();
  assert.equal(report.uncovered.length, 0);

  const rendererCopy = await collectRendererCopy();
  assert.ok(rendererCopy.has("Something went wrong"));
  assert.ok(
    rendererCopy.has("Grok Bot hit an unexpected error while rendering. Reloading usually fixes it."),
  );
});
