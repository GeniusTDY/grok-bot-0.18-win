/**
 * Single installation entry for the app locale.
 *
 * Both renderer paths share this module:
 *   - the clean-source renderer (built from `frontend/src/main.tsx`), and
 *   - the checksum-pinned upstream renderer, whose bytes are preserved and only
 *     extended by the injected locale runtime bundle.
 *
 * Sharing one function guarantees the byte-preserved renderer and the
 * source-composed renderer install identical localization behavior.
 */
import { HTML_LANG, appLanguage } from "./locale";
import { startDeepTranslation, type DeepTranslationController } from "./deep-translate";

export { applyBootMask, releaseBootMask } from "./deep-translate";

export function installLocale(root: HTMLElement): DeepTranslationController {
  document.documentElement.setAttribute("lang", HTML_LANG[appLanguage]);
  return startDeepTranslation(root);
}
