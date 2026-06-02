import type { Page } from '@playwright/test'

import { expect, test } from '../fixtures/console.fixture'
import { clearMailpit } from '../fixtures/mailpit.fixture'
import { LoginPage } from '../page-objects/login.page'
import { consumeLinkFromEmail } from '../page-objects/session'

/**
 * Verifies the public-page account dropdown drives both auth paths:
 *
 *   1. "Register" lands an anonymous visitor on the magic-link form,
 *      they get the link from Mailpit, consume it, and the public
 *      home flips to an authenticated state (the account menu now
 *      offers Account / Sign out instead of Login / Register).
 *
 *   2. After signing out, "Login" runs the exact same flow with the
 *      same email and lands the SAME user back in.
 *
 * Both dropdown entries render through `/auth/sign-in`; the backend
 * sends the welcome email on the first (new-user) round-trip and the
 * plain sign-in email on the second (returning) one — `consumeLinkFromEmail`
 * accepts either. The test proves both entries reach the form (no
 * collision crash from a duplicate `to=` target) and that the round-trip
 * with one email works twice.
 */
async function consumeMagicLink(page: Page, email: string): Promise<void> {
    const login = new LoginPage(page)
    await expect(login.email).toBeVisible({ timeout: 5_000 })
    await login.signIn(email)
    await expect(login.sent).toBeVisible({ timeout: 10_000 })
    await page.goto(await consumeLinkFromEmail(email))
    await expect(page).toHaveURL(/\/(tree|health|families\/create|families\/pick)$/, { timeout: 25_000 })
}

// Two full signIn cycles + dropdown navigation cleanly overruns the
// 30 s per-test default in CI under runner load. Give it 90 s.
test.setTimeout(90_000)

test('account-menu Register flow signs a new user up; Login afterwards reauthenticates them', async ({ page }) => {
    const stamp = Date.now()
    const email = `account-menu-auth-${stamp}@example.com`

    // Start at the public home — anonymous, account dropdown shows the
    // orange user-silhouette icon as its activator.
    await page.goto('/')
    await expect(page.getByTestId('public-home')).toBeVisible()

    // -------- 1. Register from the dropdown ---------------------------
    await clearMailpit()
    await page.getByTestId('user-menu').click()
    const registerItem = page.getByTestId('account-register')
    await expect(registerItem).toBeVisible()
    await registerItem.click()
    await expect(page).toHaveURL(/\/auth\/sign-in$/, { timeout: 10_000 })
    await consumeMagicLink(page, email)

    // After consuming, the AccountControl now shows the authed shape:
    // the menu's first item is "Account" (= user-menu-account testid).
    await page.getByTestId('user-menu').click()
    await expect(page.getByTestId('user-menu-account')).toBeVisible()
    await expect(page.getByTestId('account-register')).toHaveCount(0)
    await page.keyboard.press('Escape')
    // Wait for the v-menu overlay to fully unmount before reopening.
    // Without this, Vuetify's close transition is still in flight when
    // the next click() opens the menu, and the list items mount/detach
    // in quick succession — Playwright's actionability check resolves
    // the pre-detach node, sees "not stable", retries, and on retry the
    // node has been replaced ("element was detached from the DOM").
    await expect(page.getByTestId('sign-out')).toHaveCount(0)

    // -------- 2. Sign out -------------------------------------------------
    await page.getByTestId('user-menu').click()
    const signOut = page.getByTestId('sign-out')
    await expect(signOut).toBeVisible()
    await signOut.click()
    await expect(page).toHaveURL(/\/auth\/sign-in$/, { timeout: 10_000 })

    // -------- 3. Visit /, then Login from the dropdown with the same email
    await page.goto('/')
    await expect(page.getByTestId('public-home')).toBeVisible()
    await clearMailpit()
    await page.getByTestId('user-menu').click()
    const loginItem = page.getByTestId('account-login')
    await expect(loginItem).toBeVisible()
    await loginItem.click()
    await expect(page).toHaveURL(/\/auth\/sign-in$/, { timeout: 10_000 })
    await consumeMagicLink(page, email)

    // Same user authenticated again — the menu carries Account, and the
    // back-end identity (email) is the one we signed up with.
    await page.getByTestId('user-menu').click()
    await expect(page.getByTestId('user-menu-account')).toBeVisible()
    await expect(page.getByTestId('user-menu').getAttribute('aria-label')).resolves.toBe(email)
})
