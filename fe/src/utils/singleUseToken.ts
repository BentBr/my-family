// Cross-instance dedup for single-use-token "consume" views (magic-link
// sign-in, invite accept, email-change confirm).
//
// The problem: each of those views POSTs a single-use token once on mount and
// redirects. In CI the route can DOUBLE-MOUNT (two component instances in the
// same page load), so a component-scoped `const processed = ref(false)` guard
// is useless — each instance has its own ref, so BOTH fire the POST. The
// second hits the now-consumed token, gets a 401, and its error handler
// clobbers the first's success → the page sticks on the consume URL.
//
// sessionStorage isn't a reliable fix either: at the in-network e2e origin
// (`http://localhost:5173`) storage can be partitioned/blocked, silently
// defeating a storage-based marker.
//
// This module-level (in-memory, shared across every instance in the page load)
// claim set is the deterministic guard: the FIRST mount claims the token and
// POSTs; any concurrent re-mount sees the claim and short-circuits to the
// success redirect instead of re-POSTing. A full page reload resets the module
// (fresh load → fresh attempt), which is the desired behaviour for a manual
// retry.
const claimed = new Set<string>()

/**
 * Claim `token` for consuming. Returns `true` the FIRST time it's called for a
 * given token in this page load (caller should proceed with the POST), `false`
 * on every subsequent call (caller should short-circuit — a sibling mount is
 * already handling it).
 */
export function claimSingleUseToken(token: string): boolean {
    if (claimed.has(token)) return false
    claimed.add(token)
    return true
}

/**
 * Release a previously-claimed token so it can be consumed again in this page
 * load. Only needed for deliberate re-attempts (e.g. invite-accept's
 * "sign out and retry with the same token"), NOT on a normal failure — a
 * genuinely-bad token is retried via a fresh page load.
 */
export function releaseSingleUseToken(token: string): void {
    claimed.delete(token)
}
