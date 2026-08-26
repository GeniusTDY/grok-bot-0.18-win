/**
 * Dynamic translation rules for the locale runtime.
 *
 * `dictionary.ts` only covers *fixed* English copy. Real UI text is frequently
 * composed at runtime — counts, provider names, agent names — so a key-only
 * catalog can never reach it (e.g. "Usage for <provider>", "<n> replies").
 * Rules describe the shape of such copy with `{placeholder}` markers and rebuild
 * the Simplified Chinese sentence from the captured values, so one rule replaces
 * an unbounded family of hardcoded keys.
 *
 * Safety property (shared with the dictionary): every rule is an *anchored
 * full-string* match. English copy is only rewritten when it matches a rule in
 * full, so user-authored transcript content is never mutated.
 *
 * Idempotency: Simplified Chinese output never matches the English templates, so
 * re-running the engine on DOM mutations is stable.
 */

export interface TranslationRule {
  /** English template; `{name}` marks a captured value. */
  readonly template: string;
  /** Simplified Chinese template; the same `{name}` placeholders are substituted. */
  readonly translation: string;
}

export const ZH_RULES: readonly TranslationRule[] = [
  // Router settings: collapses the per-provider "Usage for <Provider>" keys.
  { template: "Usage for {provider}", translation: "{provider} 用量" },

  // Conversation surfaces.
  { template: "{count} replies", translation: "{count} 条回复" },
  { template: "{count} files changed", translation: "{count} 个文件已更改" },
  { template: "{count} file changed", translation: "{count} 个文件已更改" },

  // Computer update confirmation.
  {
    template:
      "{name} is working right now. Waiting lets its current turn finish. Updating now recreates the computer and interrupts it. Files and logins are kept either way.",
    translation:
      "{name} 正在工作。等待可以让它先完成当前回合；现在更新会重建电脑并中断它。无论哪种方式，文件和登录信息都会保留。",
  },
  { template: "{count} other agents", translation: "另有 {count} 个智能体" },
  { template: "{count} other agent", translation: "另有 {count} 个智能体" },

  // Plugin fetch notice.
  {
    template:
      "{count} installed plugins can't be fetched until Grok Bot's computer can read their source repository.",
    translation: "在 Grok Bot 的电脑能够读取其源仓库之前，{count} 个已安装插件无法获取。",
  },
  {
    template:
      "{count} installed plugin can't be fetched until Grok Bot's computer can read their source repository.",
    translation: "在 Grok Bot 的电脑能够读取其源仓库之前，{count} 个已安装插件无法获取。",
  },

  // Spreadsheet viewer sheet tabs.
  { template: "Sheet {index}", translation: "工作表 {index}" },

  // Usage footer.
  { template: "Resets in {days} days", translation: "{days} 天后重置" },
  { template: "Resets in {days} day", translation: "{days} 天后重置" },

  // Shared-room header trigger with a pending join-request count.
  {
    template: "Manage shared room, {count} pending join request",
    translation: "管理共享房间，{count} 个待处理加入请求",
  },
  {
    template: "Manage shared room, {count} pending join requests",
    translation: "管理共享房间，{count} 个待处理加入请求",
  },

  // Local 9Router workspace readiness footer.
  { template: "{count} setup items remain.", translation: "还有 {count} 项设置待完成。" },
];

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

function escapeLiteral(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface CompiledRule {
  readonly regex: RegExp;
  readonly names: readonly string[];
  readonly translation: string;
}

function compileRule(rule: TranslationRule): CompiledRule {
  const names: string[] = [];
  let source = "";
  let cursor = 0;
  for (const match of rule.template.matchAll(PLACEHOLDER)) {
    const index = match.index ?? 0;
    source += escapeLiteral(rule.template.slice(cursor, index));
    source += "(.+?)";
    names.push(match[1]);
    cursor = index + match[0].length;
  }
  source += escapeLiteral(rule.template.slice(cursor));
  return { regex: new RegExp(`^${source}$`), names, translation: rule.translation };
}

const COMPILED_RULES: readonly CompiledRule[] = ZH_RULES.map(compileRule);

function render(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) => values[name] ?? placeholder);
}

/**
 * Returns the Simplified Chinese rendering of `text` when it matches a rule in
 * full, otherwise `null`.
 */
export function matchRule(text: string): string | null {
  for (const rule of COMPILED_RULES) {
    const match = rule.regex.exec(text);
    if (match == null) continue;
    const values: Record<string, string> = {};
    rule.names.forEach((name, index) => {
      values[name] = match[index + 1];
    });
    const translated = render(rule.translation, values);
    if (translated !== text) return translated;
  }
  return null;
}
