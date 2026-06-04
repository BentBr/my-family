import { useRoute, useRouter } from 'vue-router'

import { useUpdateMe } from '@/api/hooks/users'
import { useAuthStore } from '@/stores/auth'
import { useLocaleStore, type SupportedLocale } from '@/stores/locale'

/**
 * THE locale-switch behaviour, shared by every language picker (the
 * desktop `LanguageMenu` and the mobile fold-in inside `AccountControl`):
 *
 *   1. flip the locale store (drives i18n + persists via the bound watcher),
 *   2. swap the live route's `/en`|`/de` prefix in place — the URL is the
 *      locale's source of truth, so leaving it stale would snap the UI
 *      back on the next navigation,
 *   3. write the preference through to `/users/me` for signed-in users.
 *
 * Extracted so the two pickers can't drift apart again (the mobile menu
 * used to update only the store: stale URL, no backend persistence).
 */
export function useLocaleSwitch(): (next: SupportedLocale) => void {
    const locale = useLocaleStore()
    const auth = useAuthStore()
    const route = useRoute()
    const router = useRouter()
    const update = useUpdateMe()

    return (next: SupportedLocale): void => {
        if (next === locale.locale) return
        locale.set(next)
        void router.replace({
            params: { ...route.params, lang: next },
            query: route.query,
            hash: route.hash,
        })
        if (auth.status === 'authenticated') {
            update.mutate({ locale: next })
        }
    }
}
