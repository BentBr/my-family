<script setup lang="ts">
/**
 * Language switcher — flag-chip activator + two-item menu (EN, DE).
 *
 * Replaces the older `LangSwitcher.vue` v-select. Uses the same
 * underlying `useLocaleStore.set(…)` so the persistence + i18n
 * mirroring logic stays in one place; mutates the BE's `/users/me`
 * only when the caller is authenticated (anonymous users keep the
 * choice locally until they sign in).
 *
 * Always mounted in the AppBar — public + authenticated routes share
 * this atom.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useUpdateMe } from '@/api/hooks/users'
import { useAuthStore } from '@/stores/auth'
import { useLocaleStore, type SupportedLocale } from '@/stores/locale'

const locale = useLocaleStore()
const auth = useAuthStore()
const update = useUpdateMe()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

interface Choice {
    value: SupportedLocale
    label: string
    flag: string
}
const choices: Choice[] = [
    { value: 'en', label: 'English', flag: '🇬🇧' },
    { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
]

const active = computed(() => choices.find((c) => c.value === locale.locale) ?? choices[0])

function pick(next: SupportedLocale): void {
    if (next === locale.locale) return
    locale.set(next)
    // The URL is the source of truth for the display locale (every route
    // carries a `/en`/`/de` prefix and the router's seeding guard syncs
    // the store FROM it). Swap the prefix in place so the next navigation
    // doesn't snap the UI back to the URL's old locale.
    void router.replace({
        params: { ...route.params, lang: next },
        query: route.query,
        hash: route.hash,
    })
    if (auth.status === 'authenticated') {
        update.mutate({ locale: next })
    }
}
</script>

<template>
    <v-menu location="bottom end" :close-on-content-click="true">
        <template #activator="{ props: activatorProps }">
            <v-btn
                variant="tonal"
                size="small"
                rounded="md"
                color="primary"
                :aria-label="t('chrome.language.label')"
                :title="t('chrome.language.label')"
                data-testid="language-menu"
                v-bind="activatorProps"
            >
                <span class="lang-chip">{{ active?.flag }}</span>
            </v-btn>
        </template>
        <v-list density="comfortable" data-testid="language-menu-list">
            <v-list-item
                v-for="c in choices"
                :key="c.value"
                :title="c.label"
                :active="locale.locale === c.value"
                :data-testid="`language-menu-${c.value}`"
                color="primary"
                @click="pick(c.value)"
            >
                <template #prepend>
                    <span class="lang-chip" aria-hidden="true">{{ c.flag }}</span>
                </template>
            </v-list-item>
        </v-list>
    </v-menu>
</template>

<style scoped>
.lang-chip {
    /* Emoji flags render at body font-size; the chip control wants them
       a touch larger. Line-height is locked so the v-btn keeps its
       compact 32px shape. */
    font-size: 18px;
    line-height: 1;
    display: inline-block;
}

/* `v-list-item #prepend` doesn't apply the standard icon gutter when
   the slot contains plain markup (only `prepend-icon` triggers it).
   Push the flag away from the title text by hand so EN/DE rows read
   as "🇬🇧 English" instead of "🇬🇧English". */
:deep(.v-list-item__prepend .lang-chip) {
    margin-inline-end: 14px;
}
</style>
