import { useMutation } from '@tanstack/vue-query'

import { useAuthStore } from '@/stores/auth'
import { useLocaleStore } from '@/stores/locale'

import { client } from '../client'
import { expectOk, unwrap } from '../request'

export function useRequestMagicLink() {
    const locale = useLocaleStore()
    // The "sent" envelope is ignored by callers (LoginView just shows the
    // check-inbox state regardless), so `expectOk` is the right shape —
    // it throws on error and resolves to void otherwise.
    //
    // We send the locale the FE resolved on the sign-in page (URL prefix →
    // store) so the backend can (a) seed a brand-new account's preference and
    // (b) locale-prefix the magic-link URL — the link then lands directly on
    // the right-language route instead of bouncing through a redirect. For a
    // returning user the backend keeps their stored account locale.
    return useMutation({
        mutationFn: (email: string) =>
            expectOk(client.POST('/api/v1/auth/magic-link', { body: { email, locale: locale.locale } })),
    })
}

export function useConsumeMagicLink() {
    const auth = useAuthStore()
    // Kept on raw `useMutation`: the consume response hydrates the auth
    // store, which must happen inside the mutation (not via a toast/
    // invalidate), so `useApiMutation` isn't the right fit. The network
    // call still routes through `unwrap()`.
    return useMutation({
        mutationFn: async (token: string) => {
            const claims = await unwrap(client.POST('/api/v1/auth/consume', { body: { token } }))
            auth.applyClaimsPayload(claims)
            return claims
        },
    })
}
