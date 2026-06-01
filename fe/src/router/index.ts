import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { useActiveFamilyStore } from '@/stores/activeFamily'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
    interface RouteMeta {
        layout?: 'login' | 'main' | 'public'
        /**
         * Drives `AppSidebar`'s visible variant. `'main'` shows the
         * tree-side nav, `'admin'` shows the admin items, `'none'`
         * hides the drawer entirely. Defaults to `'none'` so any
         * unmarked route gets the chromeless behaviour by accident
         * rather than a half-rendered sidebar.
         */
        sidebar?: 'main' | 'admin' | 'none'
        /**
         * Session requirement. The auth guard lets anonymous visitors
         * stay only on routes that are `public` OR explicitly
         * `requiresAuth: false` (the auth-flow pages that handle the
         * anonymous case themselves). Every other route — including any
         * route that omits this flag — needs a session.
         */
        requiresAuth?: boolean
        /**
         * Active-family requirement. Only routes flagged
         * `requiresFamily` bounce a family-less (but authenticated) user
         * to `/families/create` or `/families/pick`. Family-optional
         * authed pages (account, health, the family picker itself) omit
         * it. `requiresAdmin` implies `requiresFamily` (a role lives in a
         * family), so admin routes set both.
         */
        requiresFamily?: boolean
        requiresAdmin?: boolean
        /**
         * Marks a route as part of the unauthenticated public site.
         * Guards skip the sign-in bounce; the layout dispatcher picks
         * `PublicLayout`; signed-in users can still reach `/` (it's
         * informational, not a sign-in shortcut).
         */
        public?: boolean
    }
}

const routes: RouteRecordRaw[] = [
    {
        path: '/',
        name: 'home',
        component: () => import('@/views/public/HomeView.vue'),
        meta: { layout: 'public', public: true },
    },
    {
        path: '/imprint',
        name: 'imprint',
        component: () => import('@/views/public/ImprintView.vue'),
        meta: { layout: 'public', public: true },
    },
    {
        path: '/data-policy',
        name: 'data-policy',
        component: () => import('@/views/public/DataPolicyView.vue'),
        meta: { layout: 'public', public: true },
    },
    {
        path: '/auth/sign-in',
        name: 'sign-in',
        component: () => import('@/views/auth/LoginView.vue'),
        meta: { layout: 'login', requiresAuth: false },
    },
    {
        path: '/auth/consume',
        name: 'consume',
        component: () => import('@/views/auth/ConsumeView.vue'),
        meta: { layout: 'login', requiresAuth: false },
    },
    {
        path: '/families/create',
        name: 'family-create',
        component: () => import('@/views/families/FamilyCreate.vue'),
        meta: { layout: 'main', sidebar: 'main', requiresAuth: true },
    },
    {
        path: '/families/pick',
        name: 'family-pick',
        component: () => import('@/views/families/FamilyPicker.vue'),
        meta: { layout: 'main', sidebar: 'main', requiresAuth: true },
    },
    {
        path: '/invite/accept',
        name: 'invite-accept',
        component: () => import('@/views/auth/InviteAccept.vue'),
        meta: { layout: 'login', requiresAuth: false },
    },
    {
        path: '/health',
        name: 'health',
        component: () => import('@/views/HealthView.vue'),
        // Authenticated status page (renders in the main chrome and is the
        // post-login landing). Family-optional: no `requiresFamily`.
        meta: { layout: 'main', sidebar: 'main', requiresAuth: true },
    },
    {
        path: '/account',
        name: 'account',
        component: () => import('@/views/account/AccountView.vue'),
        meta: { layout: 'main', sidebar: 'main', requiresAuth: true },
    },
    {
        path: '/account/email-change/consume',
        name: 'email-change-consume',
        component: () => import('@/views/account/EmailChangeConsumeView.vue'),
        meta: { layout: 'main', sidebar: 'main', requiresAuth: true },
    },
    {
        path: '/account/owner-transfer/confirm',
        name: 'owner-transfer-confirm',
        component: () => import('@/views/account/OwnerTransferConfirm.vue'),
        meta: { layout: 'main', sidebar: 'main', requiresAuth: true },
    },
    {
        path: '/tree',
        name: 'tree',
        component: () => import('@/views/tree/TreeView.vue'),
        meta: { layout: 'main', sidebar: 'main', requiresAuth: true, requiresFamily: true },
    },
    {
        path: '/upcoming',
        name: 'upcoming',
        component: () => import('@/views/upcoming/UpcomingView.vue'),
        meta: { layout: 'main', sidebar: 'main', requiresAuth: true, requiresFamily: true },
    },
    {
        path: '/admin',
        redirect: '/admin/family',
    },
    {
        path: '/admin/family',
        name: 'admin-family',
        component: () => import('@/views/admin/AdminFamily.vue'),
        meta: { layout: 'main', sidebar: 'admin', requiresAuth: true, requiresFamily: true, requiresAdmin: true },
    },
    {
        path: '/admin/audit',
        name: 'admin-audit',
        component: () => import('@/views/admin/AdminAudit.vue'),
        meta: { layout: 'main', sidebar: 'admin', requiresAuth: true, requiresFamily: true, requiresAdmin: true },
    },
    {
        path: '/admin/members',
        name: 'admin-members',
        component: () => import('@/views/admin/AdminMembers.vue'),
        meta: { layout: 'main', sidebar: 'admin', requiresAuth: true, requiresFamily: true, requiresAdmin: true },
    },
    {
        path: '/admin/invites',
        name: 'admin-invites',
        component: () => import('@/views/admin/AdminInvites.vue'),
        meta: { layout: 'main', sidebar: 'admin', requiresAuth: true, requiresFamily: true, requiresAdmin: true },
    },
    // /reminders/* etc. are added in Phase 4b.
]

export const router = createRouter({
    history: createWebHistory(),
    routes,
})

router.beforeEach(async (to) => {
    const auth = useAuthStore()
    if (auth.status === 'anonymous') {
        try {
            await auth.hydrate()
        } catch (e) {
            // `hydrate()` already maps a 401 to "anonymous" and returns; if
            // we land here it's an UNEXPECTED failure (network down, 5xx).
            // Don't swallow it silently — log for diagnostics. We still
            // fall through to the anonymous bounce below: rethrowing from a
            // guard would abort navigation and strand the user with no
            // route, which is worse than a sign-in bounce.
            console.error('[router] unexpected auth hydrate failure', e)
        }
    }
    // Anonymous visitors may remain only on:
    //   - `meta.public` routes — marketing + legal pages, also browsable
    //     while signed in;
    //   - `meta.requiresAuth === false` routes — the auth-flow pages
    //     (sign-in / consume / invite-accept) that handle the anonymous
    //     case themselves (e.g. InviteAccept stashes its token and bounces
    //     to sign-in; bouncing here first would drop the token from the URL).
    // Any other route — including one that omits the flag — needs a session.
    const anonymousAllowed = to.meta.public === true || to.meta.requiresAuth === false
    if (auth.status === 'anonymous' && !anonymousAllowed) {
        return '/auth/sign-in'
    }
    if (auth.status === 'authenticated' && to.path === '/auth/sign-in') {
        // Don't keep showing the sign-in page once we're logged in.
        return '/health'
    }
    return true
})

router.beforeEach((to) => {
    const auth = useAuthStore()
    const family = useActiveFamilyStore()
    if (auth.status !== 'authenticated') return true
    // Reconcile stale active-family BEFORE the requires-family check:
    // localStorage may carry an `activeFamilyId` from a previous session
    // whose membership no longer exists in `auth.families` (the user got
    // removed, the family was deleted, or the run signed in as a
    // different identity on the same browser). Letting the tree query
    // fire with that stale id triggers a 422 X-Family-Id validation on
    // the API, surfacing as the toast "Validation failed" — and the
    // switcher shows the raw UUID because no item title matches. Wipe
    // it here so even family-optional routes (e.g. `/account`, `/health`)
    // don't leak the stale id into their FamilySwitcher render.
    if (family.activeFamilyId !== null && !auth.families.some((f) => f.id === family.activeFamilyId)) {
        family.clearOnLogout()
    }
    // Auto-select-when-sole-family runs for every authed route (not just
    // the family-required ones) so the AppBar's FamilySwitcher reflects
    // the user's family on /account / /health renders too.
    if (family.activeFamilyId === null && auth.families.length === 1) {
        const sole = auth.families[0]
        if (sole !== undefined) {
            family.setActive(sole.id)
        }
    }
    // Only routes that declare `meta.requiresFamily` enforce an active
    // family. Family-optional authed pages (account*, health, the family
    // picker/create themselves, auth + invite flows, public pages) omit
    // the flag and pass through — driven by the route declaration rather
    // than a duplicated path-prefix allowlist.
    if (to.meta.requiresFamily !== true) return true
    if (family.activeFamilyId !== null) return true
    // Non-exempt routes need an active family. A zero-family user falls
    // through to /families/create; the multi-family case sends them to
    // the picker. The sole-family auto-select above already handled the
    // common single-family path.
    return auth.families.length === 0 ? '/families/create' : '/families/pick'
})

// Admin-only role gate. Runs after the auth + active-family guards so by
// the time we reach it we know there's a session and an active family.
// Non-admin / non-owner roles are bounced to /tree; this matches the
// pattern Vue Router expects for a "redirect when condition fails"
// guard (return a path).
router.beforeEach((to) => {
    if (to.meta.requiresAdmin !== true) return true
    const family = useActiveFamilyStore()
    const role = family.activeFamily?.role ?? null
    if (role === 'admin' || role === 'owner') return true
    return '/tree'
})
