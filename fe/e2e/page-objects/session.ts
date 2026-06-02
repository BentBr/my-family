import { type Page, expect } from '@playwright/test'

import { rewriteEmailLink } from '../fixtures/email-links.fixture'
import { clearMailpit, waitForEmail } from '../fixtures/mailpit.fixture'

import { LoginPage } from './login.page'

/**
 * Subjects the auth (magic-link) email can arrive with: the plain
 * sign-in copy for returning users and the welcome/onboarding copy for
 * brand-new accounts, each in EN + DE. e2e specs sign in with fresh
 * unique emails (→ new users → welcome) AND seeded/returning emails
 * (→ sign-in), so the matcher must accept all four.
 */
export const AUTH_EMAIL_SUBJECT =
    /Sign in to my-fam-tree|Anmeldung bei my-fam-tree|Welcome to my-fam-tree|Willkommen bei my-fam-tree/

/**
 * Wait for the auth email addressed to `email`, pull the single-use
 * `/auth/consume` link out of its body, and return it rewritten for the
 * in-network browser. Shared by every magic-link round-trip so the
 * subject matcher + link extraction live in exactly one place.
 */
export async function consumeLinkFromEmail(email: string): Promise<string> {
    const mail = await waitForEmail((s) => AUTH_EMAIL_SUBJECT.test(s), { recipient: email })
    const link = mail.text.match(/https?:\/\/\S+\/auth\/consume\?token=\S+/)?.[0]
    if (link === undefined) throw new Error('consume link not in email body')
    return rewriteEmailLink(link)
}

/**
 * Magic-link sign-in: request the link, pull it from Mailpit, consume it, and
 * land on the post-auth route. Shared by the e2e suite (previously inlined in
 * ~18 spec files).
 */
export async function signIn(page: Page, email: string): Promise<void> {
    await clearMailpit()
    const login = new LoginPage(page)
    await login.goto()
    await login.signIn(email)
    await expect(login.sent).toBeVisible()
    await page.goto(await consumeLinkFromEmail(email))
    // ConsumeView's redirect chain is POST /auth/consume → applyClaimsPayload
    // → router.replace → beforeEach guards (hydrate skipped, active-family
    // resolve, role check) → final URL. Under CI runner load this can take
    // well past Playwright's default 5 s `toHaveURL` poll window — the
    // debug-profile API serializes a heavy fixture (the big_family seed)
    // and a consume can queue behind it. 25 s leaves the redirect plenty
    // of room without masking a genuine hang (per-test timeout is 30 s).
    await expect(page).toHaveURL(/\/(tree|health|families\/create|families\/pick)$/, { timeout: 25_000 })
}

/**
 * Create a family (the caller becomes its owner) and return the new family id
 * (read from the active-family store). Callers that don't need the id can
 * ignore the return value.
 */
export async function createFamily(page: Page, name: string): Promise<string> {
    await page.goto('/families/create')
    await page.getByTestId('family-name').locator('input').fill(name)
    await page.getByTestId('family-create-submit').click()
    // Same redirect-chain bump as the consume helpers: form submit →
    // `useCreateFamily` mutation → `family.setActive` → `nextTick` →
    // router push to `/tree`. CI runners sometimes need >5 s for the
    // chain to land; 15 s leaves plenty of room without masking a hang.
    await expect(page).toHaveURL(/\/tree$/, { timeout: 15_000 })
    return page.evaluate(() => localStorage.getItem('my-fam-tree:activeFamily') ?? '')
}
