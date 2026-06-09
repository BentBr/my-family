import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { WritableComputedRef } from 'vue'

import { safeLocal } from '@/utils/safeStorage'

const STORAGE_KEY = 'my-fam-tree:locale'
export type SupportedLocale = 'en' | 'de'

// Structural shape covering both the I18n root and the Composer it exposes via
// `.global` in non-legacy mode. Typing what we actually touch (a writable
// `locale` ref) avoids invariance pitfalls with vue-i18n 11's deeply-generic
// `I18n` / `Composer` interfaces and keeps us off `any` / `@ts-expect-error`.
interface I18nLike {
    global: {
        locale: WritableComputedRef<string> | { value: string }
    }
}

/**
 * Resolve the visitor's preferred locale for a path that carries NO locale
 * prefix (bare `/`, `/imprint`, …). Precedence, highest first:
 *
 *   1. URL locale prefix — handled by the caller BEFORE this runs (a
 *      prefixed path never reaches the bare-path normalizer), so it's the
 *      true top priority; this function covers everything below it.
 *   2. Explicit preference in localStorage — written by `set()` from the
 *      language menu, the account form, AND the account locale applied on
 *      sign-in, so the signed-in user's account choice is captured here.
 *   3. Browser `navigator.language`.
 *   4. English fallback.
 *
 * Exported so the router's bare-path redirects (`/` → `/de`) pick the same
 * locale the store would. SSR-safe: `safeLocal` swallows storage errors and
 * `navigator` is guarded, so a prerender falls back to English.
 */
export function detectInitialLocale(): SupportedLocale {
    const stored = safeLocal.get(STORAGE_KEY)
    if (stored === 'en' || stored === 'de') return stored
    const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : ''
    if (nav.startsWith('de')) return 'de'
    return 'en'
}

export const useLocaleStore = defineStore('locale', () => {
    const locale = ref<SupportedLocale>(detectInitialLocale())

    function bindToI18n(i18n: I18nLike): void {
        i18n.global.locale.value = locale.value
        // Sync the i18n active locale on ANY change. Persistence is NOT done
        // here — only an explicit preference (`set`) writes localStorage, so
        // merely displaying a `/en` URL never clobbers a stored `de` choice.
        watch(locale, (v) => {
            i18n.global.locale.value = v
        })
    }

    /**
     * Record an EXPLICIT locale preference: the user picked it (language menu,
     * account form) or it came from their account on sign-in. Updates the
     * display locale AND persists to localStorage so it survives reloads and
     * wins for bare-path (`/`) resolution.
     */
    function set(next: SupportedLocale): void {
        locale.value = next
        safeLocal.set(STORAGE_KEY, next)
    }

    /**
     * Apply the locale carried by the current URL prefix (`/en`, `/de`). This
     * drives the DISPLAY locale only and does NOT persist — the URL is the
     * highest-priority source for the page being viewed, but navigating to or
     * following a localized link is not an explicit preference change, so it
     * must not overwrite the stored `set()` choice.
     */
    function applyFromUrl(next: SupportedLocale): void {
        locale.value = next
    }

    return { locale, bindToI18n, set, applyFromUrl }
})
