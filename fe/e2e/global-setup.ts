// Drain the Redis instance shared by the api so each E2E run starts from a
// clean rate-limiter state. Without this, repeated runs against the same
// emails (`gate-test@example.com`, `profile@example.com`, etc.) eventually
// trip `MAGIC_LINK_RATE_PER_EMAIL_PER_HOUR=5` and the magic-link send returns
// 429 — the page never reaches its "Check your inbox" state and every signIn
// helper fails. Mailpit is cleared per-test by `clearMailpit()`.
//
// The same FLUSHDB helper is invoked per-test from
// `fixtures/console.fixture.ts` so the BE's per-IP rate caps (120/hour at
// `auth/consume`, `auth/refresh`, `invite/accept`, `owner-transfer/confirm`)
// don't accumulate across the 62-test suite when everything shares
// 127.0.0.1 in CI.

import { flushRedis } from './fixtures/redis.fixture'

/**
 * Warm the API's Postgres connection pool before the timed tests run.
 *
 * The e2e API is built in the DEBUG profile (release would add minutes to
 * CI). On a cold debug binary the FIRST few requests pay the lazy
 * connection-pool warm-up tax — each new pooled connection does a TCP +
 * auth handshake to Postgres, and the first query of each shape compiles
 * a plan. Under runner load (the `big_family` fixture seeds ~95 rows
 * mid-run) that cold tax pushed the first `auth/consume` round-trip past
 * the signIn helper's redirect budget, which showed up as the recurring
 * cold-start flake on the alphabetically-early specs.
 *
 * Firing a burst of concurrent `/health` probes forces the pool to open
 * several connections AND exercises a real DB round-trip (the health
 * handler measures `db_latency_ms`, so it queries Postgres) — so by the
 * time the first test's consume lands, the pool is hot. Read-only, no
 * persisted rows, no rate-limit buckets, so it can't pollute test state.
 * Best-effort: any failure (API not up yet locally) is swallowed so it
 * never blocks the suite.
 */
async function warmApiPool(): Promise<void> {
    const apiBase = process.env['E2E_API_BASE_URL'] ?? 'http://localhost:8080'
    const url = `${apiBase}/api/v1/health`
    const burst = 8
    const probe = async (): Promise<void> => {
        try {
            const ctrl = new AbortController()
            const t = setTimeout(() => ctrl.abort(), 10_000)
            await fetch(url, { signal: ctrl.signal }).catch(() => undefined)
            clearTimeout(t)
        } catch {
            // best-effort warm-up; ignore.
        }
    }
    await Promise.all(Array.from({ length: burst }, () => probe()))
}

export default async function globalSetup(): Promise<void> {
    if (process.env['CI'] === 'true' || process.env['E2E_FLUSH_REDIS'] === 'true') {
        await flushRedis()
        console.log('[E2E Setup] flushed redis (rate-limit buckets cleared)')
        await warmApiPool()
        console.log('[E2E Setup] warmed API connection pool')
    } else {
        console.log('[E2E Setup] skipping redis flush (set CI=true or E2E_FLUSH_REDIS=true to enable)')
    }
}
