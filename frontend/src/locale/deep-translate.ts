/**
 * Deep translation engine for the reconstructed renderer.
 *
 * React renders the vast majority of the UI, and several byte-injected surfaces
 * (think the Router settings panel) are not directly localizable in source. Rather
 * than editing every surface, this module translates the live DOM: every visible
 * text node (and select presentational attributes) recognized by the catalog is
 * replaced with its Simplified Chinese equivalent.
 *
 * The catalog is owned by `translate.ts`: a fixed dictionary plus anchored dynamic
 * rules, so runtime-composed copy ("Usage for <Provider>", "<n> replies") is
 * localizable without a per-variant key.
 *
 * Guardrails:
 *   - Only runs when the Electron system language is Simplified Chinese.
 *   - Only catalog matches (exact entries or full-string rules) are rewritten,
 *     which keeps user-authored transcript content untouched.
 *   - Nodes inside editable regions and code blocks are skipped.
 *   - A pre-paint boot mask hides the not-yet-translated DOM (Simplified Chinese
 *     only) so the first visible frame is already localized, with a self-releasing
 *     timeout that can never leave the window hidden.
 *   - A MutationObserver keeps dynamically mounted surfaces in sync, coalescing
 *     into a microtask so re-translation commits before the next paint.
 *   - Translation is idempotent (Simplified Chinese never matches the English
 *     catalog), so re-running on mutations is safe and stable.
 */
import { appLanguage } from "./locale";
import { translateCopy } from "./translate";

const TEXT_ATTRIBUTES = ["aria-label", "placeholder", "title"] as const;

/**
 * Returns true when the node sits inside a region whose content must never be
 * rewritten (editable regions and code blocks, plus form fields whose *value* is
 * user data).
 *
 * `ignoreSelfField` is used for presentational attribute translation: an
 * `<input>`/`<textarea>` uses `placeholder`/`title`/`aria-label` as its own UI
 * copy, so the field itself must not suppress translation of those attributes.
 */
function withinSkippedRegion(el: Element | null, ignoreSelfField = false): boolean {
  let current: Element | null = el;
  while (current != null) {
    if (current instanceof HTMLElement) {
      if (current.isContentEditable) return true;
      const tag = current.tagName;
      if (tag === "CODE" || tag === "PRE" || tag === "KBD" || tag === "SAMP") return true;
      if ((tag === "INPUT" || tag === "TEXTAREA") && !(ignoreSelfField && current === el)) return true;
    }
    current = current.parentElement;
  }
  return false;
}

function translateTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (parent == null || withinSkippedRegion(parent)) return false;
  const translated = translateCopy(node.data);
  if (translated == null) return false;
  node.data = translated;
  return true;
}

function translateAttributes(element: Element): void {
  if (withinSkippedRegion(element, true)) return;
  for (const attribute of TEXT_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value == null || value.length === 0) continue;
    const translated = translateCopy(value);
    if (translated != null) {
      element.setAttribute(attribute, translated);
    }
  }
}

export function translateSubtree(root: Node): number {
  if (appLanguage !== "zh") return 0;
  if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let cursor: Node | null = walker.nextNode();
  while (cursor != null) {
    textNodes.push(cursor as Text);
    cursor = walker.nextNode();
  }
  let rewritten = 0;
  for (const textNode of textNodes) {
    if (translateTextNode(textNode)) rewritten += 1;
  }
  if (root.nodeType === Node.ELEMENT_NODE) {
    for (const child of Array.from((root as Element).querySelectorAll("*"))) {
      translateAttributes(child as Element);
    }
  }
  return rewritten;
}

export interface DeepTranslationController {
  readonly language: "en" | "zh";
  readonly active: boolean;
  readonly disposal: () => void;
}

const BOOT_MASK_ATTRIBUTE = "data-locale-boot";
const BOOT_MASK_STYLE_ID = "locale-boot-mask-style";
const BOOT_MASK_TIMEOUT_MS = 2000;

let bootMaskTimer = 0;

/**
 * Hides the document before its first paint so the frozen English renderer can
 * never appear ahead of localization (Simplified Chinese only).
 *
 * This must run from a synchronous head script: the renderer bundle is deferred,
 * so a synchronous script executes first and the mask is in place before any
 * paint can happen.
 */
export function applyBootMask(): void {
  if (appLanguage !== "zh") return;
  const htmlElement = document.documentElement;
  if (htmlElement.hasAttribute(BOOT_MASK_ATTRIBUTE)) return;
  if (document.head != null && document.getElementById(BOOT_MASK_STYLE_ID) == null) {
    const style = document.createElement("style");
    style.id = BOOT_MASK_STYLE_ID;
    style.textContent = `html[${BOOT_MASK_ATTRIBUTE}]{opacity:0!important}`;
    document.head.appendChild(style);
  }
  htmlElement.setAttribute(BOOT_MASK_ATTRIBUTE, "");
  bootMaskTimer = window.setTimeout(releaseBootMask, BOOT_MASK_TIMEOUT_MS);
}

/**
 * Lifts the boot mask. Idempotent, and safe to call when no mask was applied; the
 * timeout armed by `applyBootMask` guarantees the window can never stay hidden.
 */
export function releaseBootMask(): void {
  if (bootMaskTimer !== 0) {
    window.clearTimeout(bootMaskTimer);
    bootMaskTimer = 0;
  }
  const htmlElement = document.documentElement;
  if (!htmlElement.hasAttribute(BOOT_MASK_ATTRIBUTE)) return;
  htmlElement.removeAttribute(BOOT_MASK_ATTRIBUTE);
  document.getElementById(BOOT_MASK_STYLE_ID)?.remove();
}

/**
 * Starts deep translation on `root`, re-translating as the renderer mounts new
 * surfaces. No-op (aside from setting the document language) when the Electron
 * system language is not Simplified Chinese.
 *
 * Mutation callbacks are coalesced into a microtask, so a dynamically mounted
 * surface is translated before the browser paints it. The boot mask is lifted as
 * soon as the first subtree actually yields translated copy.
 */
export function startDeepTranslation(root: HTMLElement): DeepTranslationController {
  const enabled = appLanguage === "zh";
  if (!enabled) {
    return { language: appLanguage, active: false, disposal: () => {} };
  }

  let scheduled = false;
  let revealed = false;
  const reveal = (): void => {
    if (revealed) return;
    revealed = true;
    releaseBootMask();
  };
  const flush = (): void => {
    scheduled = false;
    if (translateSubtree(root) > 0) reveal();
  };
  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  };

  flush();

  const observer = typeof MutationObserver === "function" ? new MutationObserver(schedule) : null;
  if (observer != null) {
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: Array.from(TEXT_ATTRIBUTES),
    });
  }

  if (!revealed) window.addEventListener("load", reveal, { once: true });

  return {
    language: appLanguage,
    active: true,
    disposal: () => {
      scheduled = false;
      window.removeEventListener("load", reveal);
      observer?.disconnect();
    },
  };
}
