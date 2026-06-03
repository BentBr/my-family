import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { usePageMeta } from './usePageMeta'
import type { PageMetaDescriptor } from './usePageMeta'

/**
 * Per-route SEO descriptors — the single map that says, for every route,
 * which i18n keys feed its `<title>` / `<meta description>` / OG block.
 *
 * Keyed by the route's `name`. This is the "small per-route-meta-key map"
 * the spec calls for: views don't hand-roll `useHead`; they declare
 * intent here once, and the dispatcher in `App.vue` resolves it through
 * the shared `usePageMeta` composable. Adding SEO to a new page = one
 * entry here + two i18n keys (en + de).
 *
 * Title/description copy lives under the `meta.<route>.*` i18n namespace
 * in BOTH locale files. The public home additionally reuses the existing
 * hero copy so the marketing headline doubles as the OG title.
 */
const ROUTE_META: Record<string, PageMetaDescriptor> = {
    // ---- Public, indexable ----
    // No `canonicalPath`: the home page is locale-prefixed (`/en`, `/de`),
    // so `usePageMeta` derives the canonical + hreflang from the live route
    // path — each variant self-canonicalises and cross-links its alternate.
    home: {
        titleKey: 'public.home.hero.title',
        descriptionKey: 'public.home.hero.lede',
        hreflang: true,
    },
    // ---- Public, legal (noindex: minimal title + robots only) ----
    imprint: { titleKey: 'public.imprint.title', noindex: true },
    'data-policy': { titleKey: 'public.dataPolicy.title', noindex: true },

    // ---- Auth flow (not crawled, still get a translated title + OG) ----
    'sign-in': { titleKey: 'meta.signIn.title', descriptionKey: 'meta.signIn.description' },
    consume: { titleKey: 'meta.consume.title', descriptionKey: 'meta.consume.description' },
    'invite-accept': { titleKey: 'meta.inviteAccept.title', descriptionKey: 'meta.inviteAccept.description' },

    // ---- Authenticated app ----
    health: { titleKey: 'meta.health.title', descriptionKey: 'meta.health.description' },
    account: { titleKey: 'meta.account.title', descriptionKey: 'meta.account.description' },
    'email-change-consume': { titleKey: 'meta.account.title', descriptionKey: 'meta.account.description' },
    'owner-transfer-confirm': { titleKey: 'meta.account.title', descriptionKey: 'meta.account.description' },
    'family-create': { titleKey: 'meta.familyCreate.title', descriptionKey: 'meta.familyCreate.description' },
    'family-pick': { titleKey: 'meta.familyPick.title', descriptionKey: 'meta.familyPick.description' },
    tree: { titleKey: 'meta.tree.title', descriptionKey: 'meta.tree.description' },
    upcoming: { titleKey: 'meta.upcoming.title', descriptionKey: 'meta.upcoming.description' },
    'admin-family': { titleKey: 'meta.adminFamily.title', descriptionKey: 'meta.adminFamily.description' },
    'admin-audit': { titleKey: 'meta.adminAudit.title', descriptionKey: 'meta.adminAudit.description' },
    'admin-members': { titleKey: 'meta.adminMembers.title', descriptionKey: 'meta.adminMembers.description' },
    'admin-invites': { titleKey: 'meta.adminInvites.title', descriptionKey: 'meta.adminInvites.description' },
}

// Fallback for any route without an explicit entry — keeps the tab title
// + a generic description sane rather than leaving the head un-set.
const DEFAULT_META: PageMetaDescriptor = {
    titleKey: 'meta.default.title',
    descriptionKey: 'meta.default.description',
}

/**
 * Resolve the active route's descriptor and feed it to `usePageMeta`.
 *
 * Mounted ONCE, at the root (`App.vue`), so every navigation re-targets
 * the document head without any per-view wiring. We hand `usePageMeta` a
 * getter, so it registers a single reactive `useHead`; swapping the
 * descriptor on navigation (and `t()` re-running on locale switch) is all
 * it takes to keep the head correct — no stacking head entries.
 */
export function useRouteMeta(): void {
    const route = useRoute()

    const descriptor = computed<PageMetaDescriptor>(() => {
        const name = typeof route.name === 'string' ? route.name : ''
        const base = ROUTE_META[name] ?? DEFAULT_META
        // hreflang pages (the locale-prefixed public home) let `usePageMeta`
        // derive their canonical + alternates from the live `/en`|`/de`
        // path — don't pin one. Every other page self-canonicalises to its
        // own route path unless it already pins one explicitly.
        if (base.hreflang === true || base.canonicalPath !== undefined) return base
        return { ...base, canonicalPath: route.path }
    })

    usePageMeta(() => descriptor.value)
}
