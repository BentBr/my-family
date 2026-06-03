<script lang="ts">
// MODULE scope (shared across every component instance, unlike `<script
// setup>` which re-runs per mount): tokens whose consume this page load has
// already fired. A route double-mount in CI creates a SECOND instance; it
// reads this set and short-circuits instead of re-POSTing the single-use
// token. In-memory so it can't be defeated by blocked/partitioned storage.
const consumingTokens = new Set<string>()
</script>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useConsumeMagicLink } from '@/api/hooks/auth'
import { safeReplace } from '@/router/safeReplace'
import { useAuthStore } from '@/stores/auth'
import { safeSession } from '@/utils/safeStorage'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const mutation = useConsumeMagicLink()
const auth = useAuthStore()
const status = ref<'pending' | 'ok' | 'error'>('pending')

// Single-use tokens MUST only be consumed once, but the same token can fire
// the consume TWICE — Vite dev HMR re-mounts in dev, and in CI the route
// double-mounts. We guard at three layers, strongest first:
//
//   1. `consumingTokens` (module-level, declared above) — set synchronously
//      before the POST. Survives a re-mount within the same page load and,
//      unlike `sessionStorage`, can't be silently defeated when storage is
//      blocked/partitioned (observed at the in-network `:5173` origin in CI,
//      where the storage-only dedup let BOTH mounts POST → the 2nd got a 401
//      "already consumed" that clobbered the 1st's success with the error card).
//   2. `sessionStorage` — persists across a full reload (cleared on logout).
//   3. The catch below treats an error as benign when the auth store is
//      already authenticated (a racing fire's 200 hydrated it).

onMounted(async () => {
    const token = String(route.query['token'] ?? '')
    if (token === '') {
        status.value = 'error'
        return
    }
    const dedupeKey = `my-fam-tree:consumed:${token}`
    if (consumingTokens.has(token) || safeSession.get(dedupeKey) !== null) {
        // A sibling mount already fired this token's consume; finish the
        // redirect here rather than re-firing the now-single-use POST.
        status.value = 'ok'
        await safeReplace(router, '/tree')
        return
    }
    consumingTokens.add(token)
    safeSession.set(dedupeKey, '1')
    try {
        await mutation.mutateAsync(token)
    } catch {
        // A concurrent mount may have already consumed this token (its 200
        // hydrated the auth store); our 401 is then benign — we ARE signed
        // in — so fall through to the success redirect rather than showing
        // the error card. Only a genuine failure (no prior success) is an
        // error; roll back the storage marker so a manual refresh can retry.
        if (auth.status !== 'authenticated') {
            safeSession.remove(dedupeKey)
            status.value = 'error'
            return
        }
    }
    // Auth is established — flip to success BEFORE attempting the
    // post-consume navigation. If a route guard redirects the push
    // (e.g., the family-active guard bounces the user to
    // `/families/create`), router.replace returns a NavigationFailure
    // rather than throwing; keep the success state and let the router
    // land where it lands.
    status.value = 'ok'
    await safeReplace(router, '/tree')
})
</script>

<template>
    <v-card class="pa-6 text-center" data-testid="consume-card">
        <v-progress-circular v-if="status === 'pending'" indeterminate color="primary" data-testid="consume-pending" />
        <p v-if="status === 'pending'" class="mt-4">{{ t('auth.consume.pending') }}</p>

        <v-alert v-else-if="status === 'error'" type="error" data-testid="consume-error">
            {{ t('auth.consume.error') }}
            <template #append>
                <v-btn to="/auth/sign-in" variant="text">{{ t('auth.consume.tryAgain') }}</v-btn>
            </template>
        </v-alert>
    </v-card>
</template>
