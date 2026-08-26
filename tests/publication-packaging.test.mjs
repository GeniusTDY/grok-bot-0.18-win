import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import createIgnore from "ignore";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("publication ignore rules retain reconstructed frontend source", async () => {
  const ignoreRules = await readFile(path.join(repoRoot, ".gitignore"), "utf8");
  assert.match(ignoreRules, /^\/recovered\/$/m);
  assert.doesNotMatch(ignoreRules, /^recovered\/$/m);
  const retained = "frontend/src/recovered/ui/sand-form-primitives.css";
  const matcher = createIgnore().add(ignoreRules);
  assert.equal(matcher.ignores(retained), false, `${retained} must remain addable in a fresh repository`);
  assert.equal(matcher.ignores("recovered/generated-output.txt"), true, "root recovery output must remain ignored");
  assert.equal(matcher.ignores(".env"), true, "local credentials must remain ignored");
  assert.equal(matcher.ignores(".env.local"), true, "environment variants must remain ignored");
  assert.equal(matcher.ignores(".env.example"), false, "placeholder-only environment documentation may be published");
  assert.equal(matcher.ignores("auth.json"), true, "local provider sessions must remain ignored");
  assert.equal(matcher.ignores(".codex/auth.json"), true, "local Codex profiles must remain ignored");
  assert.equal(matcher.ignores("codex-auth.json"), true, "Codex credential exports must remain ignored");
});

test("default packaging keeps the polished checksum-pinned renderer", async () => {
  const source = await readFile(path.join(repoRoot, "scripts", "package-windows.mjs"), "utf8");
  assert.match(source, /const \{ buildFidelityReconstructedAsar \} = await import\("\.\/clean-build\.mjs"\)/);
  assert.match(source, /await buildFidelityReconstructedAsar\(\)/);
});

test("the checksum-pinned renderer ships the injected Simplified Chinese locale runtime", async () => {
  const cleanBuild = await readFile(path.join(repoRoot, "scripts", "clean-build.mjs"), "utf8");
  const injection = await readFile(path.join(repoRoot, "scripts", "lib", "locale-runtime-injection.mjs"), "utf8");
  const verification = await readFile(path.join(repoRoot, "scripts", "lib", "windows-package-verification.mjs"), "utf8");
  const main = await readFile(path.join(repoRoot, "frontend", "src", "main.tsx"), "utf8");
  const install = await readFile(path.join(repoRoot, "frontend", "src", "locale", "install.ts"), "utf8");
  assert.match(cleanBuild, /import \{ buildLocaleRuntimeAsset \} from "\.\/lib\/locale-runtime-injection\.mjs"/);
  const patchIndex = cleanBuild.indexOf("await applyOriginalRendererRouterPatch({ stageRoot });");
  const localeIndex = cleanBuild.indexOf("await buildLocaleRuntimeAsset({ stageRoot });");
  const packIndex = cleanBuild.indexOf("await packStagedAppWithIntegrity({ stageRoot, archivePath, unpackedRoot });");
  assert.ok(patchIndex >= 0 && localeIndex > patchIndex && packIndex > localeIndex, "the locale runtime must be staged after the Router patch and before packing");
  assert.match(injection, /frontend\/src\/locale\/install/);
  assert.match(injection, /dist\/renderer-locale-extension\.json/);
  assert.match(injection, /platform: "browser"/);
  assert.match(injection, /format: "iife"/);
  assert.match(injection, /dist\/renderer\/assets\/\$\{localeAssetFile\}/);
  assert.match(injection, /"system-language-detection"/);
  assert.match(injection, /"simplified-chinese-deep-translation"/);
  assert.match(injection, /"english-default-fallback"/);
  assert.match(verification, /dist\/renderer-locale-extension\.json/);
  assert.match(verification, /locale runtime drifted from its embedded provenance/);
  assert.match(main, /installLocale\(mount\)/);
  assert.match(install, /export function installLocale\(root: HTMLElement\)/);
  assert.doesNotMatch(main, /startDeepTranslation/);
});

test("deep translation rewrites field-presentational attributes and covers the reported settings surfaces", async () => {
  const deepTranslate = await readFile(path.join(repoRoot, "frontend", "src", "locale", "deep-translate.ts"), "utf8");
  const dictionary = await readFile(path.join(repoRoot, "frontend", "src", "locale", "dictionary.ts"), "utf8");
  assert.match(
    deepTranslate,
    /if \(withinSkippedRegion\(element, true\)\) return;/,
    "attribute translation must not be suppressed by the input/textarea that owns the placeholder/title/aria-label"
  );
  for (const key of [
    "e.g. reply to emails for me",
    "Always allow",
    "Ask every time",
    "Never allow",
    "Usage for Cursor",
    "Usage for Claude Code",
    "Usage for Codex",
    "Usage for OpenRouter",
    "Grok Bot's Computer",
    "Update Grok Bot's Computer",
    "Reset Grok Bot's Computer",
    "Updates the computer your assistants share. Your files and logins stay. All assistants update together.",
    "Open an agent to reset the shared computer",
  ]) {
    assert.ok(dictionary.includes(`${JSON.stringify(key)}:`), `dictionary must translate: ${key}`);
  }
});

test("the locale engine covers every first-party renderer string and gates the build on drift", async () => {
  const engine = await readFile(path.join(repoRoot, "frontend", "src", "locale", "translate.ts"), "utf8");
  const rules = await readFile(path.join(repoRoot, "frontend", "src", "locale", "patterns.ts"), "utf8");
  const injection = await readFile(path.join(repoRoot, "scripts", "lib", "locale-runtime-injection.mjs"), "utf8");
  const gate = await readFile(path.join(repoRoot, "scripts", "lib", "locale-coverage.mjs"), "utf8");
  const verification = await readFile(path.join(repoRoot, "scripts", "lib", "windows-package-verification.mjs"), "utf8");

  assert.match(engine, /const exact = ZH_TRANSLATIONS\[text\]/);
  assert.match(engine, /return matchRule\(text\)/);
  assert.match(rules, /template: "Usage for \{provider\}"/);
  assert.match(rules, /template: "\{count\} replies"/);
  assert.match(rules, /new RegExp\(`\^\$\{source\}\$`\)/);
  assert.match(injection, /await assertLocaleCoverage\(\)/);
  assert.match(injection, /"template-rule-catalog"/);
  assert.match(injection, /frontend\/src\/locale\/patterns\.ts/);
  assert.match(injection, /coverage: \{/);
  assert.match(gate, /export async function assertLocaleCoverage\(\)/);
  assert.match(gate, /translateCopy\(value\) != null/);
  assert.match(verification, /localeCoverage\.uncovered !== 0/);

  const { assertLocaleCoverage } = await import("../scripts/lib/locale-coverage.mjs");
  const report = await assertLocaleCoverage();
  assert.equal(report.uncovered.length, 0, "no first-party renderer string may ship untranslated");
  assert.ok(report.covered.length > 300, "the catalog must cover the bulk of first-party renderer copy");
});

test("working-tree publication export refuses to copy back into the source repository", async () => {
  const source = await readFile(path.join(repoRoot, "scripts", "export-publication-working-tree.mjs"), "utf8");
  assert.match(source, /ls-files", "--cached", "--others", "--exclude-standard", "-z"/);
  assert.match(source, /destination must be outside the source repository/);
  assert.match(source, /destination is not empty/);
});

test("Router settings use the trusted backend and display recorded inference usage", async () => {
  const rendererPatch = await readFile(path.join(repoRoot, "scripts", "lib", "router-renderer-patch.mjs"), "utf8");
  const preload = await readFile(path.join(repoRoot, "source", "electron-preload", "preload.ts"), "utf8");
  const mainEdge = await readFile(path.join(repoRoot, "source", "electron-main", "main-edge.ts"), "utf8");
  const inference = await readFile(path.join(repoRoot, "source", "host", "extensions", "inference", "inference-service.ts"), "utf8");
  const cursorSession = await readFile(path.join(repoRoot, "source", "host", "extensions", "inference", "cursor-session.ts"), "utf8");
  const cursorBackend = await readFile(path.join(repoRoot, "source", "shared", "node", "cursor-backend", "cursor-inference.ts"), "utf8");
  const providers = await readFile(path.join(repoRoot, "source", "host", "extensions", "inference", "provider-session.ts"), "utf8");
  const codexDirect = await readFile(path.join(repoRoot, "source", "host", "extensions", "inference", "codex-direct-responses.ts"), "utf8");
  const turnShell = await readFile(path.join(repoRoot, "source", "host", "runner", "turn-run-shell.ts"), "utf8");
  const coordinator = await readFile(path.join(repoRoot, "source", "node-agent-coordinator", "inference-router.ts"), "utf8");
  const coordinatorMain = await readFile(path.join(repoRoot, "source", "node-agent-coordinator", "main.ts"), "utf8");
  const mcpBridge = await readFile(path.join(repoRoot, "source", "node-agent-coordinator", "routed-mcp-bridge.ts"), "utf8");
  const localDocker = await readFile(path.join(repoRoot, "source", "electron-main", "box", "local-docker-host-connector.ts"), "utf8");
  const hostRunner = await readFile(path.join(repoRoot, "source", "host", "host-runner-composition.ts"), "utf8");
  assert.match(rendererPatch, /desktop\.agent\.getInferenceRouter\(\)/);
  assert.match(rendererPatch, /desktop\.agent\.setInferenceRouter\(n\)/);
  assert.match(rendererPatch, /desktop\.agent\.getBoxRuntime\(\)/);
  assert.match(rendererPatch, /desktop\.agent\.setBoxRuntime\(r\)/);
  assert.match(rendererPatch, /role:"switch"/);
  assert.match(rendererPatch, /Use local Docker VM/);
  assert.match(rendererPatch, /onValueChange:l=>\{if\(l!==null\)void e\(l\)\}/);
  assert.match(rendererPatch, /desktop\.secrets\.upsert/);
  assert.doesNotMatch(rendererPatch, /settings\.router-provider\.v1/);
  assert.match(rendererPatch, /Usage for /);
  assert.match(rendererPatch, /Requests/);
  assert.match(rendererPatch, /Input tokens/);
  assert.match(rendererPatch, /Last used/);
  assert.match(rendererPatch, /Tracked activity/);
  assert.match(rendererPatch, /RRouterProviders\.filter/);
  assert.match(preload, /getInferenceRouter: \(\) => edge\("getInferenceRouter"\)/);
  assert.match(preload, /getBoxRuntime: \(\) => edge\("getBoxRuntime"\)/);
  assert.match(preload, /setBoxRuntime: \(mode: string\) => edge\("setBoxRuntime", \{ mode \}\)/);
  assert.match(mainEdge, /syncHostSettingsToBox\(\{ inferenceProvider: provider \}\)/);
  assert.match(mainEdge, /invoke\(deps\.settingsStore, "setInferenceProvider", provider\)/);
  assert.match(mainEdge, /return \{ provider, usage:/);
  assert.match(mainEdge, /invoke\(deps\.boxRecovery, "restartCoordinator"\)/);
  assert.match(mainEdge, /mode === "local-docker"\) await startLocalDockerBox\(settingsPath\); else await stopLocalDockerBox\(\)/);
  assert.match(mainEdge, /setBoxRuntime", mode === "local-docker" \? "remote" : "local-docker"/);
  assert.match(localDocker, /public\.ecr\.aws\/k0i0n2g5\/cursorenvironments\/universal:sand-box-latest/);
  assert.match(localDocker, /"127\.0\.0\.1:1340:1340"/);
  assert.match(localDocker, /SAND_BOX_AUTO_UPDATE=0/);
  assert.match(localDocker, /dst=\/home\/box\/sand-host\/host-main\.cjs,readonly/);
  assert.match(localDocker, /\.getBoxRuntime\(\) === "local-docker" \? await localConnect\(\) : await remote\.connect\(\)/);
  assert.match(hostRunner, /isComputerUseSubagent: true/);
  assert.match(hostRunner, /isBrowserUseSubagent: true/);
  assert.match(providers, /use the offered Browser or Computer tool directly/);
  assert.match(inference, /recordInferenceUsage\(provider/);
  assert.match(inference, /routerSettings\.getInferenceProvider\(\)/);
  assert.match(inference, /typeof extendedUsage\.then === "function"/);
  assert.match(inference, /createProviderPromptSession\(provider\)/);
  assert.match(providers, /https:\/\/chatgpt\.com\/backend-api\/codex/);
  assert.match(providers, /headers\.set\("ChatGPT-Account-Id", credentials\.accountId\)/);
  assert.match(providers, /streamCodexDirectResponses/);
  assert.match(providers, /"jsonSchema" in value/);
  assert.match(providers, /routedToolParameters\(source\)/);
  assert.doesNotMatch(providers, /provider\.responses\(configuredCodexModel\(\)\)/);
  assert.match(codexDirect, /store: false/);
  assert.match(codexDirect, /response\.output_text\.delta/);
  assert.match(codexDirect, /type: "function_call_output"/);
  assert.match(providers, /parameters: jsonSchema\(parameters\)/);
  assert.match(providers, /You are Grok Bot, a warm, concise desktop assistant/);
  assert.match(providers, /mcpServers: \{ grok_bot_plugins:/);
  assert.match(providers, /recordRoutedUsage\(provider, usage\)/);
  assert.match(providers, /queryClaude/);
  assert.match(providers, /tools: mcpServerUrl == null \? \[\] : \["mcp__grok_bot_plugins__\*"\]/);
  assert.match(providers, /https:\/\/openrouter\.ai\/api\/v1/);
  assert.match(providers, /OpenRouter needs OPENROUTER_API_KEY/);
  assert.match(cursorSession, /routedProvider !== "cursor"/);
  assert.match(cursorSession, /createProviderPromptSession\(routedProvider\)/);
  assert.match(cursorBackend, /routedProvider !== "cursor"/);
  assert.match(cursorBackend, /createProviderPromptSession\(routedProvider\)/);
  assert.doesNotMatch(rendererPatch, /ANTHROPIC_API_KEY|OPENAI_API_KEY/);
  assert.match(turnShell, /inferenceProvider === "cursor"/);
  assert.match(turnShell, /createProviderPromptSession\(inferenceProvider\)/);
  assert.match(coordinator, /method !== "sendPrompt" \|\| provider === "cursor" \|\| provider === "codex"/);
  assert.match(coordinator, /executeTool: async \(definition, toolArgs, toolCallId\)/);
  assert.match(coordinatorMain, /command\(commands, "listRoutedMcpTools", args\)/);
  assert.match(coordinator, /inference-router-transcript\.json/);
  assert.match(mcpBridge, /openWorldHint: !readOnly/);
  assert.match(coordinator, /schemaVersion: 2/);
  assert.match(coordinator, /\["getAgentTranscriptTail", "openAgentTail", "getAgentTranscriptWindow"\]/);
  assert.match(coordinator, /\.map\(projectInferenceRouterTranscriptEntry\)/);
  assert.match(coordinator, /readonly richText\?: string/);
  assert.match(coordinator, /richText: entry\.richText/);
  assert.match(coordinator, /setTimeout\(resolve, 1_200\)/);
  assert.match(coordinator, /method === "reactToMessage"/);
  assert.match(coordinator, /reaction\.by === "me"/);
  assert.match(coordinator, /currentActivity: \{ kind: "thinking" \}/);
  assert.match(coordinator, /onTextDelta/);
  assert.match(coordinator, /streaming/);
  assert.match(coordinator, /postEvent\("agents"/);
  assert.match(coordinator, /createRoutedMcpBridge/);
  assert.match(coordinator, /listRoutedMcpTools/);
  assert.match(coordinator, /executeRoutedMcpTool/);
  assert.match(mcpBridge, /server\.listen\(0, "127\.0\.0\.1"/);
  assert.match(mcpBridge, /readOnlyHint: readOnly/);
  assert.match(mcpBridge, /request\.url !== `\/mcp\/\$\{secret\}`/);
  assert.match(coordinator, /kind: "send-message"/);
  assert.match(coordinatorMain, /createCoordinatorInferenceRouter/);
  assert.match(coordinatorMain, /routed\.handled/);
});
