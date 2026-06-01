// Auto-reload a stale tab that survives a deploy.
//
// Server caching already guarantees that any fresh page load pulls the
// newest hashed chunks (immutable /assets/* + no-cache index.html). The
// one gap the server can't close is a tab left OPEN across a deploy: it
// keeps running the chunks it loaded earlier. The only moment that
// actually breaks is when such a tab navigates to a route whose lazy
// chunk filename no longer exists on the server (new deploy → new
// hashes) — the dynamic `import()` 404s.
//
// We listen for exactly that failure and reload ONCE. Safety properties:
//   - Precision: we react only to chunk/preload load failures (Vite's
//     dedicated `vite:preloadError` event + a message-matched router
//     error), never to ordinary in-app errors — a real bug never
//     triggers a reload.
//   - No loops: a sessionStorage timestamp gates reloads to at most one
//     per cooldown window. If a second chunk error arrives right after a
//     reload, the reload clearly didn't fix it (offline / genuinely
//     broken deploy), so we STOP and let the error surface normally
//     instead of spinning.
//   - Fail-safe: if sessionStorage is unavailable (private mode), we do
//     NOT reload — a stale tab is the lesser evil versus an unguardable
//     loop. SSR / non-browser contexts are no-ops.

import type { Router } from 'vue-router'

/** sessionStorage key holding the epoch-ms of the last auto-reload. */
const RELOAD_FLAG = 'mft:chunk-reload-at'
/** Minimum gap between auto-reloads; a closer repeat means the reload
 *  didn't help, so we stop rather than loop. */
const COOLDOWN_MS = 10_000

/**
 * Whether a chunk-load failure should trigger a reload right now, given
 * the persisted last-reload timestamp in `store`. Writes the new
 * timestamp (and returns true) only when a reload is warranted. Pure
 * apart from that single `store` write, so the loop guard is unit
 * testable without touching `location`.
 *
 * Returns false (no reload) when: we reloaded within the cooldown, or
 * the store can't be read/written (can't guard a loop → don't risk one).
 */
export function shouldTriggerReload(store: Pick<Storage, 'getItem' | 'setItem'>, now: number): boolean {
    let last = 0
    try {
        last = Number(store.getItem(RELOAD_FLAG) ?? '0')
    } catch {
        return false
    }
    if (Number.isFinite(last) && last > 0 && now - last < COOLDOWN_MS) return false
    try {
        store.setItem(RELOAD_FLAG, String(now))
    } catch {
        return false
    }
    return true
}

/**
 * Whether `error` is a failed dynamic-import (lazy route chunk) load —
 * the stale-deploy signature — as opposed to an error thrown from inside
 * a successfully-loaded component. Matches the messages browsers use for
 * a rejected module `import()`.
 */
export function isChunkLoadError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error)
    return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|dynamically imported module|failed to load module script|expected a javascript module script/i.test(
        msg,
    )
}

/**
 * Reload the page once if the loop guard permits. Returns whether a
 * reload was actually triggered, so callers can decide whether to
 * suppress the underlying error (only suppress when we're recovering).
 */
function reloadOnceForStaleChunks(): boolean {
    if (typeof window === 'undefined') return false
    let store: Storage
    try {
        store = window.sessionStorage
    } catch {
        return false // no guardable store → don't risk a reload loop
    }
    if (shouldTriggerReload(store, Date.now())) {
        window.location.reload()
        return true
    }
    return false
}

/**
 * Wire the stale-chunk auto-reload. Call once at app bootstrap with the
 * router instance. Idempotent enough for a single call site (main.ts).
 */
export function installChunkReload(router: Router): void {
    if (typeof window !== 'undefined') {
        // Vite's dedicated signal: a dynamically-imported chunk failed to
        // load (404 after a deploy rotated the hashes). Only call
        // preventDefault — which suppresses Vite's default rethrow — when
        // we ACTUALLY reload. If the loop guard or blocked storage
        // declines the reload, let the error propagate so the user gets a
        // real failure signal instead of a silently-swallowed dead page.
        window.addEventListener('vite:preloadError', ((event: Event) => {
            if (reloadOnceForStaleChunks()) event.preventDefault()
        }) as EventListener)
    }
    // Belt-and-braces: a lazy route component import that rejects also
    // surfaces through the router error hook. Guard on the message so a
    // genuine in-component error never triggers a reload.
    router.onError((error) => {
        if (isChunkLoadError(error)) reloadOnceForStaleChunks()
    })
}
