import { closeSync, constants, lstatSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { query as queryClaude, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchema, streamText, tool, type CoreMessage, type LanguageModelV1, type ToolSet } from "ai";
import { fetch as undiciFetch, ProxyAgent } from "undici";

import { BasePromptBuilder, BasePromptExecutor } from "../../../packages/chat-inference/base.js";
import type { SandInferenceProvider } from "../../../shared/inference-router.js";
import { resolveClaudeCodeCliPath } from "../../../shared/node/inference-router-local.js";
import { getSandRootDir } from "../../host-paths.js";
import { SandSettingsStore } from "../../../shared/node/settings/sand-settings-store.js";
import { getBoxSecretsStorePath } from "../secrets/secrets-service.js";
import { codexDirectInput, streamCodexDirectResponses, type CodexDirectTool, type CodexDirectToolCall } from "./codex-direct-responses.js";
import {
  streamOpenAiCompatible,
  streamOpenAiCompatibleModelStep,
  type OpenAiCompatibleTool,
} from "./openai-compatible-stream.js";
import type { CliProxyTurnConfig } from "../../../shared/cli-proxy.js";
import type { LabelMessage, PromptExecutor } from "./sand-labeling.js";
import { requireCliProxyCredentialLease } from "./cli-proxy-credential-lease.js";

type Loose = Record<string, any>;
interface ProviderMessage extends LabelMessage { role: string; content: string | readonly unknown[] }
type RoutedProvider = Exclude<SandInferenceProvider, "cursor">;
type UsageRecord = { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
type RoutedToolExecutor = (tool: Loose, args: unknown, toolCallId: string) => Promise<unknown>;

const GROK_ROUTER_SYSTEM_PROMPT = [
  "You are Grok Bot, a warm, concise desktop assistant.",
  "You are running inside Grok Bot, not inside Codex CLI or Claude Code.",
  "The tools supplied with this request are Grok Bot's core actions and already-connected plugins and accounts. Use them whenever they are relevant instead of claiming that a capability or plugin is unavailable.",
  "When the user asks you to operate the box or virtual-machine browser or desktop, use the offered Browser or Computer tool directly and verify the result. Do not tell the user to open the URL themselves when those tools are available.",
  "Use the fewest browser calls needed. After navigation and a snapshot confirm the requested URL and title, report the result; zero interactive refs is not a failure. Do not add screenshots or raw CDP diagnostics unless the user requests them or they are necessary to finish the task.",
  "Never ask for an API key for an already-connected plugin. Respond directly to the user in natural language after completing any necessary tool calls.",
].join("\n");

function recordRoutedUsage(provider: RoutedProvider, usage: UsageRecord): void {
  new SandSettingsStore(join(getSandRootDir(), "settings.json")).recordInferenceUsage(provider, usage);
}

function persistedSecrets(): Record<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(getBoxSecretsStorePath(), "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) return {};
    const secrets = (parsed as { secrets?: unknown }).secrets;
    if (typeof secrets !== "object" || secrets == null || Array.isArray(secrets)) return {};
    return Object.fromEntries(Object.entries(secrets).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch { return {}; }
}

function openRouterCredential(): string {
  const value = process.env.OPENROUTER_API_KEY?.trim() || persistedSecrets().OPENROUTER_API_KEY?.trim();
  if (value == null || value.length === 0) throw new Error("OpenRouter needs OPENROUTER_API_KEY. Add it in Settings → Router.");
  return value;
}

function providerPrompt(messages: readonly ProviderMessage[]): string {
  const rendered = messages.map(message => {
    const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
    return `${message.role.toUpperCase()}: ${content}`;
  }).join("\n\n");
  return `${GROK_ROUTER_SYSTEM_PROMPT}\n\nContinue this Grok Bot conversation.\n\n${rendered}`;
}

function deferred<T>() { return Promise.withResolvers<T>(); }

function response(text: string, id: string, modelId: string, toolCalls?: readonly CodexDirectToolCall[]) {
  const content: Loose[] = [];
  if (text.length > 0) content.push({ type: "text", text });
  for (const call of toolCalls ?? []) content.push({ type: "tool-call", ...call });
  return { id, modelId, timestamp: new Date(), headers: {}, messages: [{ role: "assistant", content }] };
}

type CodexCredentials = { accessToken: string; refreshToken: string; idToken: string; accountId: string; path: string; document: Loose };

function unescapeLinuxMountPath(value: string): string {
  return value.replace(/\\040/g, " ").replace(/\\011/g, "\t").replace(/\\012/g, "\n").replace(/\\134/g, "\\");
}

function isReadOnlyLocalAuthMount(path: string): boolean {
  if (process.env.SAND_LOCAL_AUTH_MOUNT !== "1" || process.platform !== "linux") return false;
  try {
    let best: { mountPoint: string; readOnly: boolean } | undefined;
    for (const line of readFileSync("/proc/self/mountinfo", "utf8").split("\n")) {
      const fields = line.split(" ");
      if (fields.length < 6) continue;
      const mountPoint = unescapeLinuxMountPath(fields[4]!);
      if (path !== mountPoint && !path.startsWith(`${mountPoint}/`)) continue;
      const readOnly = fields[5]!.split(",").includes("ro");
      if (best == null || mountPoint.length > best.mountPoint.length) best = { mountPoint, readOnly };
    }
    if (best?.readOnly === true) return true;
  } catch { /* Fall through to a kernel-enforced write-open check. */ }

  // Docker Desktop's 9p mount metadata can occasionally lag behind the mount
  // namespace used by the long-lived host process. Opening a file for append
  // without writing is a side-effect-free way to ask the kernel whether the
  // bind is actually read-only. Only EROFS is accepted; ordinary permissions
  // failures do not weaken the private-file requirement.
  try {
    const descriptor = openSync(path, constants.O_WRONLY | constants.O_APPEND);
    closeSync(descriptor);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EROFS";
  }
}

function codexCredentials(): CodexCredentials {
  const path = join(process.env.CODEX_HOME?.trim() || join(homedir(), ".codex"), "auth.json");
  const stat = lstatSync(path);
  // Node's POSIX mode bits on Windows are synthesized and do not represent the
  // file's NTFS ACL. Keep the direct-file and symlink checks there, and reserve
  // chmod-style privacy validation for platforms where those bits are real.
  const hasUnsafeUnixPermissions = process.platform !== "win32" && (stat.mode & 0o077) !== 0 && !isReadOnlyLocalAuthMount(path);
  if (!stat.isFile() || stat.isSymbolicLink() || hasUnsafeUnixPermissions) throw new Error("Codex login credentials must be a private direct regular file or an app-owned read-only local auth mount.");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Loose;
  const accessToken = parsed?.tokens?.access_token;
  const refreshToken = parsed?.tokens?.refresh_token;
  const idToken = parsed?.tokens?.id_token;
  const accountId = parsed?.tokens?.account_id;
  if (parsed?.auth_mode !== "chatgpt" || typeof accessToken !== "string" || accessToken.length === 0 || typeof refreshToken !== "string" || refreshToken.length === 0 || typeof idToken !== "string" || idToken.length === 0 || typeof accountId !== "string" || accountId.length === 0) {
    throw new Error("Codex is not signed in with ChatGPT. Run `codex login`, then reopen Grok Bot.");
  }
  return { accessToken, refreshToken, idToken, accountId, path, document: parsed };
}

function jwtAudience(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Loose;
    const audience = payload.aud;
    return typeof audience === "string" ? audience : Array.isArray(audience) ? audience.find((value): value is string => typeof value === "string") ?? null : null;
  } catch { return null; }
}

let codexProxy: { url: string; dispatcher: ProxyAgent } | undefined;
let storedWindowsProxy: string | null | undefined;

function normalizeProxyUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const entries = trimmed.split(";").map(entry => entry.trim()).filter(Boolean);
  const selected = entries.find(entry => /^https=/i.test(entry))?.replace(/^https=/i, "")
    || entries.find(entry => /^http=/i.test(entry))?.replace(/^http=/i, "")
    || entries[0]?.replace(/^[a-z]+=/i, "");
  if (!selected) return undefined;
  const candidate = /^[a-z]+:\/\//i.test(selected) ? selected : `http://${selected}`;
  try {
    const parsed = new URL(candidate);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0 && parsed.port.length > 0
      ? parsed.toString()
      : undefined;
  } catch { return undefined; }
}

function windowsStoredProxyUrl(): string | undefined {
  if (process.platform !== "win32") return undefined;
  if (storedWindowsProxy !== undefined) return storedWindowsProxy ?? undefined;
  try {
    const output = execFileSync("reg.exe", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"], { encoding: "utf8", windowsHide: true });
    const proxyValue = /^\s*ProxyServer\s+REG_SZ\s+(.+)$/im.exec(output)?.[1]?.trim();
    const enabled = /^\s*ProxyEnable\s+REG_DWORD\s+0x1\s*$/im.test(output);
    const normalized = normalizeProxyUrl(proxyValue);
    if (normalized == null) storedWindowsProxy = null;
    else {
      const hostname = new URL(normalized).hostname.toLowerCase();
      storedWindowsProxy = enabled || hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" ? normalized : null;
    }
  } catch { storedWindowsProxy = null; }
  return storedWindowsProxy ?? undefined;
}

function codexNetworkFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): ReturnType<typeof fetch> {
  const proxyUrl = normalizeProxyUrl(process.env.HTTPS_PROXY)
    || normalizeProxyUrl(process.env.https_proxy)
    || normalizeProxyUrl(process.env.HTTP_PROXY)
    || normalizeProxyUrl(process.env.http_proxy)
    || windowsStoredProxyUrl();
  if (!proxyUrl) return fetch(input, init);
  if (codexProxy?.url !== proxyUrl) codexProxy = { url: proxyUrl, dispatcher: new ProxyAgent(proxyUrl) };
  return undiciFetch(input as any, { ...(init as any), dispatcher: codexProxy.dispatcher }) as unknown as ReturnType<typeof fetch>;
}

const CODEX_TRANSIENT_NETWORK_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

function isTransientCodexNetworkError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current != null; depth += 1) {
    if (typeof current === "object") {
      const record = current as { code?: unknown; cause?: unknown; name?: unknown };
      if (typeof record.code === "string" && CODEX_TRANSIENT_NETWORK_CODES.has(record.code)) return true;
      if (record.name === "AbortError") return false;
      current = record.cause;
      continue;
    }
    break;
  }
  return error instanceof TypeError && error.message.toLowerCase() === "fetch failed";
}

function waitForCodexRetry(delayMs: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted === true) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

async function refreshCodexCredentials(current: CodexCredentials): Promise<CodexCredentials> {
  const clientId = jwtAudience(current.idToken);
  if (clientId == null) throw new Error("Codex login expired and its refresh identity is invalid. Run `codex login` again.");
  const refresh = await fetch("https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: current.refreshToken, client_id: clientId }),
  });
  if (!refresh.ok) throw new Error("Codex login expired and could not be refreshed. Run `codex login` again.");
  const payload = await refresh.json() as Loose;
  if (typeof payload.access_token !== "string" || payload.access_token.length === 0) throw new Error("Codex returned an invalid refreshed login. Run `codex login` again.");
  const document = {
    ...current.document,
    tokens: {
      ...current.document.tokens,
      access_token: payload.access_token,
      refresh_token: typeof payload.refresh_token === "string" && payload.refresh_token.length > 0 ? payload.refresh_token : current.refreshToken,
      id_token: typeof payload.id_token === "string" && payload.id_token.length > 0 ? payload.id_token : current.idToken,
    },
    last_refresh: new Date().toISOString(),
  };
  const refreshed = {
    accessToken: document.tokens.access_token,
    refreshToken: document.tokens.refresh_token,
    idToken: document.tokens.id_token,
    accountId: current.accountId,
    path: current.path,
    document,
  };
  // The local VM receives the user's Codex profile as a read-only bind mount.
  // Refresh in memory there so a long-running turn can continue without ever
  // modifying, copying, or publishing the host's authentication file.
  if (isReadOnlyLocalAuthMount(current.path)) return refreshed;
  const temporary = `${current.path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  renameSync(temporary, current.path);
  return codexCredentials();
}

function codexAuthenticatedFetch(initial: CodexCredentials): typeof fetch {
  let credentials = initial;
  return async (input, init) => {
    const perform = () => {
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${credentials.accessToken}`);
      headers.set("ChatGPT-Account-Id", credentials.accountId);
      return codexNetworkFetch(input, { ...init, headers });
    };
    const performWithRetry = async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await perform();
        } catch (error) {
          if (attempt >= 2 || !isTransientCodexNetworkError(error)) throw error;
          await waitForCodexRetry(attempt === 0 ? 250 : 750, init?.signal);
        }
      }
    };
    let result = await performWithRetry();
    if (result.status !== 401) return result;
    credentials = await refreshCodexCredentials(credentials);
    result = await performWithRetry();
    return result;
  };
}

function configuredCodexModel(): string {
  const selected = process.env.SAND_CODEX_MODEL?.trim();
  if (selected) return selected;
  try {
    const config = readFileSync(join(process.env.CODEX_HOME?.trim() || join(homedir(), ".codex"), "config.toml"), "utf8");
    return /^\s*model\s*=\s*["']([^"']+)["']/m.exec(config)?.[1]?.trim() || "gpt-5.4";
  } catch { return "gpt-5.4"; }
}

function configuredCodexReasoningEffort(): "minimal" | "low" | "medium" | "high" | "xhigh" | undefined {
  const selected = process.env.SAND_CODEX_REASONING_EFFORT?.trim();
  if (selected === "minimal" || selected === "low" || selected === "medium" || selected === "high" || selected === "xhigh") return selected;
  try {
    const config = readFileSync(join(process.env.CODEX_HOME?.trim() || join(homedir(), ".codex"), "config.toml"), "utf8");
    const value = /^\s*model_reasoning_effort\s*=\s*["']([^"']+)["']/m.exec(config)?.[1]?.trim();
    return value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh" ? value : undefined;
  } catch { return undefined; }
}

function routedToolParameters(source: Loose): unknown {
  const value = source.inputSchema ?? source.parameters;
  if (typeof value === "object" && value != null && !Array.isArray(value) && "jsonSchema" in value) {
    return (value as Loose).jsonSchema;
  }
  return value;
}

function plainToolParameters(source: Loose): Loose | undefined {
  const raw = source.inputSchema ?? source.parameters;
  if (typeof raw !== "object" || raw == null || Array.isArray(raw)) return undefined;
  const wrapped = raw as Loose;
  const candidate = Object.prototype.hasOwnProperty.call(wrapped, "jsonSchema")
    ? wrapped.jsonSchema
    : raw;
  if (typeof candidate !== "object" || candidate == null || Array.isArray(candidate)) return undefined;
  try {
    const parsed = JSON.parse(JSON.stringify(candidate)) as unknown;
    return typeof parsed === "object" && parsed != null && !Array.isArray(parsed)
      ? parsed as Loose
      : undefined;
  } catch {
    return undefined;
  }
}

function codexTools(definitions: readonly Loose[] | undefined): CodexDirectTool[] | undefined {
  if (definitions == null) return undefined;
  const tools = definitions.flatMap((source): CodexDirectTool[] => {
    const parameters = routedToolParameters(source);
    return typeof source.name === "string" && source.name.length > 0 && parameters != null ? [{
      name: source.name,
      ...(typeof source.description === "string" ? { description: source.description } : {}),
      parameters,
      source,
    }] : [];
  });
  return tools.length === 0 ? undefined : tools;
}

function codexExecutor(messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void) {
  const credentials = codexCredentials();
  const usage = deferred<{ promptTokens: number; completionTokens: number; totalTokens: number }>();
  const extendedUsage = deferred<{ inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; maxTokens: number }>();
  const resultResponse = deferred<ReturnType<typeof response>>();
  const metadata = deferred<Record<string, unknown>>();
  const model = configuredCodexModel();
  const tools = codexTools(definitions);
  const fullStream = (async function* () {
    let text = "";
    try {
      for await (const event of streamCodexDirectResponses({
        fetch: codexAuthenticatedFetch(credentials),
        endpoint: "https://chatgpt.com/backend-api/codex/responses",
        model,
        ...(configuredCodexReasoningEffort() == null ? {} : { reasoningEffort: configuredCodexReasoningEffort()! }),
        instructions: GROK_ROUTER_SYSTEM_PROMPT,
        input: codexDirectInput(messages),
        ...(tools == null ? {} : { tools }),
        ...(executeTool == null ? {} : { executeTool: async (selected, args, toolCallId) => await executeTool(selected.source, args, toolCallId) }),
        maxSteps: tools == null ? 1 : 8,
      })) {
        if (event.type === "text-delta") { text += event.delta; yield { type: "text-delta" as const, textDelta: event.delta }; continue; }
        if (event.type === "tool-call") { yield event; continue; }
        const basic = { promptTokens: event.usage.inputTokens, completionTokens: event.usage.outputTokens, totalTokens: event.usage.inputTokens + event.usage.outputTokens };
        const extended = { ...event.usage, maxTokens: 0 };
        onUsage?.(event.usage);
        usage.resolve(basic);
        extendedUsage.resolve(extended);
        metadata.resolve({ openai: { responseId: event.responseId, direct: true } });
        resultResponse.resolve(response(text, invocationId, model, event.toolCalls));
      }
    } catch (error) { usage.reject(error); extendedUsage.reject(error); metadata.reject(error); resultResponse.reject(error); throw error; }
  })();
  return { fullStream, response: resultResponse.promise, usage: usage.promise, extendedUsage: extendedUsage.promise, providerMetadata: metadata.promise, invocationId: Promise.resolve(invocationId) };
}

function claudeExecutor(messages: readonly ProviderMessage[], invocationId: string, onUsage?: (usage: UsageRecord) => void, mcpServerUrl?: string) {
  const executable = resolveClaudeCodeCliPath();
  if (executable == null) throw new Error("Claude Code is not installed. Install and sign in to Claude Code, then reopen Grok Bot.");
  const usage = deferred<{ promptTokens: number; completionTokens: number; totalTokens: number }>();
  const extendedUsage = deferred<{ inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; maxTokens: number }>();
  const resultResponse = deferred<ReturnType<typeof response>>();
  const metadata = deferred<Record<string, unknown>>();
  const fullStream = (async function* () {
    try {
      let final: SDKResultMessage | undefined;
      const selectedModel = process.env.SAND_CLAUDE_MODEL?.trim();
      for await (const message of queryClaude({ prompt: providerPrompt(messages), options: { pathToClaudeCodeExecutable: executable, cwd: getSandRootDir(), tools: mcpServerUrl == null ? [] : ["mcp__grok_bot_plugins__*"], ...(mcpServerUrl == null ? {} : { mcpServers: { grok_bot_plugins: { type: "http" as const, url: mcpServerUrl } }, strictMcpConfig: true }), permissionMode: "default", maxTurns: mcpServerUrl == null ? 1 : 8, persistSession: false, ...(selectedModel == null || selectedModel.length === 0 ? {} : { model: selectedModel }) } })) if (message.type === "result") final = message;
      if (final == null) throw new Error("Claude Code ended without a result.");
      if (final.subtype !== "success") throw new Error(final.errors.join("\n") || `Claude Code failed (${final.subtype}).`);
      const text = final.result;
      if (text.length > 0) yield { type: "text-delta" as const, textDelta: text };
      const input = final.usage.input_tokens, output = final.usage.output_tokens, cacheRead = final.usage.cache_read_input_tokens ?? 0, cacheWrite = final.usage.cache_creation_input_tokens ?? 0;
      onUsage?.({ inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite });
      usage.resolve({ promptTokens: input, completionTokens: output, totalTokens: input + output });
      extendedUsage.resolve({ inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, maxTokens: 0 });
      metadata.resolve({ anthropic: { sessionId: final.session_id, totalCostUsd: final.total_cost_usd } });
      resultResponse.resolve(response(text, invocationId, "claude-code"));
    } catch (error) { usage.reject(error); extendedUsage.reject(error); metadata.reject(error); resultResponse.reject(error); throw error; }
  })();
  return { fullStream, response: resultResponse.promise, usage: usage.promise, extendedUsage: extendedUsage.promise, providerMetadata: metadata.promise, invocationId: Promise.resolve(invocationId) };
}

export function toToolSet(definitions: readonly Loose[] | undefined, executeTool?: RoutedToolExecutor): ToolSet | undefined {
  if (definitions == null || definitions.length === 0) return undefined;
  const tools: ToolSet = {};
  for (const definition of definitions) {
    if (typeof definition.name !== "string" || definition.name.length === 0) continue;
    const parameters = routedToolParameters(definition);
    if (parameters == null) continue;
    const routedTool: any = {
      ...(typeof definition.description === "string" ? { description: definition.description } : {}),
      parameters: jsonSchema(parameters),
    };
    if (executeTool != null) routedTool.execute = async (args: unknown, options: { toolCallId: string }) => await executeTool(definition, args, options.toolCallId);
    tools[definition.name] = tool(routedTool);
  }
  return Object.keys(tools).length === 0 ? undefined : tools;
}

function openRouterExecutor(messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void) {
  const id = process.env.SAND_OPENROUTER_MODEL?.trim() || "openai/gpt-5.2";
  const model: LanguageModelV1 = createOpenAI({ apiKey: openRouterCredential(), baseURL: "https://openrouter.ai/api/v1", compatibility: "compatible", name: "openrouter", headers: { "HTTP-Referer": "https://github.com/grok-bot-reconstructed", "X-Title": "Grok Bot Reconstructed" } }).chat(id as any);
  const tools = toToolSet(definitions, executeTool);
  const result = streamText({ model, system: GROK_ROUTER_SYSTEM_PROMPT, messages: messages as CoreMessage[], ...(tools === undefined ? {} : { tools }), toolCallStreaming: true, maxSteps: tools === undefined ? 1 : 8 });
  const extendedUsage = result.usage.then(value => ({ inputTokens: value.promptTokens, outputTokens: value.completionTokens, cacheReadTokens: 0, cacheWriteTokens: 0, maxTokens: 0 }));
  if (onUsage != null) void extendedUsage.then(onUsage);
  return { fullStream: result.fullStream, response: result.response, usage: result.usage, extendedUsage, providerMetadata: result.providerMetadata, invocationId: Promise.resolve(invocationId) };
}

function cliProxyTools(definitions: readonly Loose[] | undefined): OpenAiCompatibleTool[] | undefined {
  if (definitions == null || definitions.length === 0) return undefined;
  const tools = definitions.flatMap((source): OpenAiCompatibleTool[] => {
    const parameters = plainToolParameters(source);
    return typeof source.name === "string" && source.name.length > 0 && parameters != null ? [{ name: source.name, ...(typeof source.description === "string" ? { description: source.description } : {}), parameters, source }] : [];
  });
  return tools.length === 0 ? undefined : tools;
}

function cliProxyExecutor(config: CliProxyTurnConfig, messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void) {
  const usage = deferred<{ promptTokens: number; completionTokens: number; totalTokens: number }>();
  const extendedUsage = deferred<{ inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; maxTokens: number }>();
  const resultResponse = deferred<ReturnType<typeof response>>();
  const metadata = deferred<Record<string, unknown>>();
  const tools = cliProxyTools(definitions);
  const fullStream = (async function* () {
    let text = "";
    try {
      for await (const event of streamOpenAiCompatible({
        config,
        instructions: GROK_ROUTER_SYSTEM_PROMPT,
        messages,
        ...(tools == null ? {} : { tools }),
        ...(executeTool == null ? {} : { executeTool: async (selected, args, toolCallId) => executeTool(selected.source, args, toolCallId) }),
        maxSteps: tools == null ? 1 : 8,
      })) {
        if (event.type === "text-delta") { text += event.delta; yield { type: "text-delta" as const, textDelta: event.delta }; continue; }
        const basic = { promptTokens: event.usage.inputTokens, completionTokens: event.usage.outputTokens, totalTokens: event.usage.inputTokens + event.usage.outputTokens };
        const extended = { ...event.usage, maxTokens: 0 };
        onUsage?.(event.usage);
        usage.resolve(basic); extendedUsage.resolve(extended);
        metadata.resolve({ openai: { responseId: event.responseId, protocol: event.protocol, compatible: true } });
        resultResponse.resolve(response(text, invocationId, config.model));
      }
    } catch (error) { usage.reject(error); extendedUsage.reject(error); metadata.reject(error); resultResponse.reject(error); throw error; }
  })();
  return { fullStream, response: resultResponse.promise, usage: usage.promise, extendedUsage: extendedUsage.promise, providerMetadata: metadata.promise, invocationId: Promise.resolve(invocationId) };
}

function cliProxyNativeExecutor(
  config: CliProxyTurnConfig,
  messages: readonly ProviderMessage[],
  invocationId: string,
  definitions?: readonly Loose[],
  signal?: AbortSignal,
  onUsage?: (usage: UsageRecord) => void,
) {
  const usage = deferred<{ promptTokens: number; completionTokens: number; totalTokens: number }>();
  const extendedUsage = deferred<{ inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; maxTokens: number }>();
  const resultResponse = deferred<Loose>();
  const metadata = deferred<Record<string, unknown>>();
  const tools = cliProxyTools(definitions);
  const fullStream = (async function* () {
    try {
      for await (const event of streamOpenAiCompatibleModelStep({
        config,
        instructions: GROK_ROUTER_SYSTEM_PROMPT,
        messages,
        ...(tools == null ? {} : { tools }),
        ...(signal == null ? {} : { signal }),
      })) {
        if (event.type !== "done") {
          yield event;
          continue;
        }
        const basic = {
          promptTokens: event.usage.inputTokens,
          completionTokens: event.usage.outputTokens,
          totalTokens: event.usage.inputTokens + event.usage.outputTokens,
        };
        const extended = { ...event.usage, maxTokens: 0 };
        onUsage?.(event.usage);
        usage.resolve(basic);
        extendedUsage.resolve(extended);
        metadata.resolve({ openai: { responseId: event.responseId, protocol: event.protocol, compatible: true, nativeTools: true } });
        resultResponse.resolve({
          id: event.responseId || invocationId,
          modelId: config.model,
          timestamp: new Date(),
          headers: {},
          messages: [{ role: "assistant", content: event.content }],
        });
      }
    } catch (error) {
      usage.reject(error);
      extendedUsage.reject(error);
      metadata.reject(error);
      resultResponse.reject(error);
      throw error;
    }
  })();
  return { fullStream, response: resultResponse.promise, usage: usage.promise, extendedUsage: extendedUsage.promise, providerMetadata: metadata.promise, invocationId: Promise.resolve(invocationId) };
}

class ProviderPromptExecutor extends BasePromptExecutor<ProviderMessage> {
  constructor(readonly provider: RoutedProvider, initialMessages?: readonly ProviderMessage[], readonly onUsage?: (usage: UsageRecord) => void) { super(new BasePromptBuilder(initialMessages)); }
  stream(ctx: unknown, invocationId = crypto.randomUUID(), definitions?: readonly Loose[]) {
    if (this.provider === "codex") return codexExecutor(this.getMessages(), invocationId, definitions, undefined, this.onUsage);
    if (this.provider === "claude-code") return claudeExecutor(this.getMessages(), invocationId, this.onUsage);
    if (this.provider === "cli-proxy") {
      // Re-check the short-lived lease before every native model step. The
      // executor deliberately does not retain a key across tool execution.
      const cliProxyConfig = requireCliProxyCredentialLease();
      const signal = typeof ctx === "object" && ctx != null && Reflect.get(ctx, "signal") instanceof AbortSignal
        ? Reflect.get(ctx, "signal") as AbortSignal
        : undefined;
      return cliProxyNativeExecutor(cliProxyConfig, this.getMessages(), invocationId, definitions, signal, this.onUsage);
    }
    return openRouterExecutor(this.getMessages(), invocationId, definitions, undefined, this.onUsage);
  }
}

export function createProviderPromptSession(provider: RoutedProvider): { getModelId(): string; getExecutor(state?: unknown): PromptExecutor } {
  const cliProxyModel = provider === "cli-proxy" ? requireCliProxyCredentialLease().model : undefined;
  const modelId = provider === "codex" ? configuredCodexModel() : provider === "claude-code" ? "claude-code" : provider === "cli-proxy" ? cliProxyModel! : process.env.SAND_OPENROUTER_MODEL?.trim() || "openai/gpt-5.2";
  return { getModelId: () => modelId, getExecutor: state => new ProviderPromptExecutor(provider, Array.isArray(state) ? state as ProviderMessage[] : undefined, usage => recordRoutedUsage(provider, usage)) };
}

export async function runRoutedProviderText(provider: RoutedProvider, messages: readonly ProviderMessage[], options?: {
  readonly mcpServerUrl?: string;
  readonly tools?: readonly Loose[];
  readonly executeTool?: RoutedToolExecutor;
  readonly cliProxyConfig?: CliProxyTurnConfig;
  readonly onTextDelta?: (delta: string, accumulated: string) => void;
}): Promise<string> {
  const invocationId = crypto.randomUUID();
  const onUsage = (usage: UsageRecord) => recordRoutedUsage(provider, usage);
  const result = provider === "codex"
    ? codexExecutor(messages, invocationId, options?.tools, options?.executeTool, onUsage)
    : provider === "claude-code"
      ? claudeExecutor(messages, invocationId, onUsage, options?.mcpServerUrl)
      : provider === "cli-proxy"
        ? options?.cliProxyConfig == null
          ? (() => { throw new Error("9Router is not configured. Open Settings → Router."); })()
          : cliProxyExecutor(options.cliProxyConfig, messages, invocationId, options?.tools, options?.executeTool, onUsage)
        : openRouterExecutor(messages, invocationId, options?.tools, options?.executeTool, onUsage);
  let text = "";
  for await (const event of result.fullStream) {
    if (event.type === "text-delta" && typeof event.textDelta === "string") {
      text += event.textDelta;
      options?.onTextDelta?.(event.textDelta, text);
    }
  }
  await result.response;
  return text;
}
