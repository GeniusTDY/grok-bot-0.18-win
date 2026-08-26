/**
 * Copy lookup for the deep translation engine.
 *
 * Resolution order:
 *   1. exact dictionary entry (`dictionary.ts`) — fast path for fixed copy,
 *   2. dynamic rule match (`patterns.ts`) — runtime-composed copy.
 *
 * Returning `null` for everything else is the guardrail that keeps user-authored
 * transcript content untouched: only copy the app itself renders (a known phrase
 * or a known sentence shape) is ever rewritten.
 */
import { ZH_TRANSLATIONS } from "./dictionary";
import { matchRule } from "./patterns";

export function translateCopy(text: string): string | null {
  const exact = ZH_TRANSLATIONS[text];
  if (exact != null && exact !== text) return exact;
  return matchRule(text);
}
