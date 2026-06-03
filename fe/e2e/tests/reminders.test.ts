import { expect, test } from '../fixtures/console.fixture'
import { clearMailpit, waitForEmail } from '../fixtures/mailpit.fixture'
import { seedPerson } from '../page-objects/seed'
import { signIn, createFamily } from '../page-objects/session'

// The worker exposes POST /__test/advance-clock only when built with
// `--features test-fixtures` (CI + `REMINDER_WORKER_FEATURES=test-fixtures`
// locally). In CI it listens on localhost:9091; under compose it's the
// `worker` service. Override via WORKER_TEST_URL.
const WORKER_URL = process.env['WORKER_TEST_URL'] ?? 'http://localhost:9091'

test('a daily digest email fires 7 days before a birthday when reminders are on', async ({ page }) => {
    const stamp = Date.now()
    const userEmail = `reminders-${stamp}@example.com`
    await signIn(page, userEmail)
    await createFamily(page, `Reminders-${stamp}`)

    const familyId = await page.evaluate(() => localStorage.getItem('my-fam-tree:activeFamily') ?? '')
    expect(familyId).not.toBe('')

    // Birthday 2026-06-15. With the worker clock advanced to 2026-06-08 (below)
    // and the default 7-day lead, the next occurrence (2026-06-15) is exactly
    // the target, so this person fires.
    await seedPerson(page.request, familyId, {
        given_name: 'Birthday',
        family_name: 'Person',
        birth_date: '1990-06-15',
    })

    // Smoke: the Account reminder panel mounts in the production build.
    await page.goto('/account')
    await expect(page.getByTestId('reminder-prefs')).toBeVisible()

    // Enable reminders via the API rather than driving the Vuetify switch: the
    // panel's save is covered by vitest, and this keeps the worker-pipeline
    // precondition deterministic (no race between the switch toggle and the
    // prefs query hydrating the form in the slower production build).
    const prefs = await page.request.put('/api/v1/reminder-preferences', {
        headers: { 'content-type': 'application/json' },
        data: {
            emails_enabled: true,
            remind_birthdays: true,
            remind_anniversaries: true,
            favourites_only: false,
            lead_days: 7,
        },
    })
    expect(prefs.ok(), 'enable reminders via API').toBeTruthy()

    // Fast-forward the worker to 06:00 Europe/Berlin on 2026-06-08
    // (= 04:00 UTC, CEST). The advance-clock endpoint runs one tick
    // immediately; the dispatcher then sends the queued digest.
    //
    // SCOPED time travel: the offset MUST be put back in the `finally`,
    // even when the digest assertion fails or the test retries. While the
    // worker clock sits days ahead, its janitor sweeps with a far-future
    // cutoff and DELETEs every still-unconsumed single-use token the api
    // mints at REAL time — so any later test's sign-in/invite races its
    // consume against the next sweep and intermittently 401s with "link
    // may have expired". (Verified live: a fresh token was inserted at
    // :20.73 and swept at :20.80, milliseconds later.) Resetting restores
    // one consistent "now" for everything that runs after this test.
    await clearMailpit()
    const advance = await page.request.post(`${WORKER_URL}/__test/advance-clock`, {
        headers: { 'content-type': 'application/json' },
        data: { to: '2026-06-08T04:00:00Z' },
    })
    expect(advance.ok(), 'worker advance-clock should succeed').toBeTruthy()

    try {
        // Within the dispatcher's poll window the digest email lands in
        // Mailpit. The digest is sent to the signed-in user. `timeoutMs` is
        // an option rather than the positional second arg (was `30_000`
        // before the recipient filter landed).
        const digest = await waitForEmail((s) => /In 7 days|In 7 Tagen|🎂/.test(s), {
            recipient: userEmail,
            timeoutMs: 30_000,
        })
        expect(digest.text).toMatch(/Birthday Person/)
    } finally {
        const reset = await page.request.post(`${WORKER_URL}/__test/advance-clock`, {
            headers: { 'content-type': 'application/json' },
            data: { to: new Date().toISOString() },
        })
        expect(reset.ok(), 'worker clock reset should succeed').toBeTruthy()
    }
})
