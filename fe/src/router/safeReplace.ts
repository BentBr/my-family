import { type Router, isNavigationFailure } from 'vue-router'

// Shared post-action navigation helper for the single-use-token flows
// (magic-link consume, invite accept, email-change confirm). After the
// server action succeeds we replace to the landing route, but the
// navigation can legitimately NOT land there — a route guard may redirect
// it (e.g. the active-family guard sending a family-less user to
// `/families/create`), or it may be aborted/duplicated. Those are
// `NavigationFailure`s and are expected: the action already succeeded, so
// we let the router land wherever the guards send it.
//
// What we must NOT do is swallow EVERY error: a genuinely thrown
// navigation error (a guard throwing, or a failed lazy route-chunk import
// — the stale-deploy case the chunk-reloader handles) was previously
// hidden, leaving the user on a dead page with no signal. We now report
// the unexpected ones so they surface for diagnostics + the global
// `router.onError` (chunk-reload) hook can still act on them.

/**
 * `router.replace(to)`, tolerating expected navigation outcomes
 * (guard-redirect / abort / duplicate) and reporting anything else.
 */
export async function safeReplace(router: Router, to: string): Promise<void> {
    try {
        await router.replace(to)
    } catch (e) {
        if (isNavigationFailure(e)) return // redirected / aborted / duplicated — fine
        // Unexpected throw (a guard error, or a failed route-chunk import).
        // Don't hide it: log so it's diagnosable. `router.onError` (the
        // chunk-reload hook) also receives chunk-import failures.
        console.error('[router] post-action navigation failed', e)
    }
}
