import { createI18n } from 'vue-i18n'

// Each locale's catalogue is split by concern so the prerendered public
// pages, the SEO metadata, and the app proper evolve independently:
//   - `meta.json`   — SEO/OG strings (`meta.*`) used by `usePageMeta`
//   - `public.json` — marketing/legal copy (`public.*`) on the prerendered pages
//   - `app.json`    — everything the authenticated app shows
// The namespaces are disjoint at the top level, so a plain spread
// reassembles the exact message tree the single-file catalogue had.
import deApp from './de/app.json'
import deMeta from './de/meta.json'
import dePublic from './de/public.json'
import enApp from './en/app.json'
import enMeta from './en/meta.json'
import enPublic from './en/public.json'

/**
 * Build a fresh i18n instance. The vite-ssg prerender renders the locale
 * variants CONCURRENTLY in one Node process — sharing a singleton there
 * lets one page's locale bleed into another's rendered head/body (the
 * race that titled `en.html` in German). `main.ts` therefore creates one
 * instance per SSR render, exactly like the per-render Pinia.
 */
// Inferred return type on purpose: vue-i18n's `createI18n` resolves a
// deeply-generic `I18n<…, false>` from the options object; spelling it
// out collapses the composer surface (`global.t` stops being callable).
export function createAppI18n() {
    return createI18n({
        legacy: false,
        locale: 'en',
        fallbackLocale: 'en',
        messages: {
            en: { ...enApp, ...enMeta, ...enPublic },
            de: { ...deApp, ...deMeta, ...dePublic },
        },
    })
}

// Client/browser singleton — module-level consumers (`api/client.ts`'s
// error translator, unit tests) resolve translations through this. In the
// browser there is exactly one app, so singleton === app instance.
export const i18n = createAppI18n()
