import { type Page, expect } from '@playwright/test'

import { rewriteEmailLink } from '../fixtures/email-links.fixture'
import { clearMailpit, waitForEmail } from '../fixtures/mailpit.fixture'

/**
 * Subjects the family-invite email arrives with (EN + DE). The EN subject
 * embeds the family name (`Join the <name> family on My Family Tree`), so we
 * match the stable head/tail rather than the whole line.
 */
export const INVITE_EMAIL_SUBJECT = /Join the .+ family on My Family Tree|Einladung zur Familie/

/**
 * Wait for the invite email addressed to `email`, pull the single-use
 * `/invite/accept` link from its body, navigate `page` to it (rewritten for
 * the in-network browser), and assert the accept landing. Mirrors
 * `consumeLinkFromEmail` for the magic-link flow.
 */
export async function acceptInviteFromEmail(page: Page, email: string): Promise<void> {
    const mail = await waitForEmail((s) => INVITE_EMAIL_SUBJECT.test(s), { recipient: email })
    const link = mail.text.match(/https?:\/\/\S+\/invite\/accept\?token=\S+/)?.[0]
    if (link === undefined) throw new Error('invite link not in email body')
    await page.goto(rewriteEmailLink(link))
    await expect(page).toHaveURL(/\/(tree|invite\/accept)/)
}

/**
 * Owner (`ownerPage`) invites `inviteeEmail` at `role`, then the invitee
 * (`inviteePage`) accepts via the emailed link. Clears Mailpit first so the
 * invite email is the only one in the box. Previously copy-pasted verbatim
 * into every multi-member spec.
 */
export async function inviteAndAccept(
    ownerPage: Page,
    inviteePage: Page,
    familyId: string,
    inviteeEmail: string,
    role: 'user' | 'admin',
): Promise<void> {
    await clearMailpit()
    const res = await ownerPage.request.post(`/api/v1/families/${familyId}/invites`, {
        headers: { 'X-Family-Id': familyId },
        data: { email: inviteeEmail, role },
    })
    expect(res.ok()).toBeTruthy()
    await acceptInviteFromEmail(inviteePage, inviteeEmail)
}
