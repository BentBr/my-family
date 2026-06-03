<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useConsumeMagicLink } from '@/api/hooks/auth'
import { safeReplace } from '@/router/safeReplace'
import { useAuthStore } from '@/stores/auth'
import { claimSingleUseToken } from '@/utils/singleUseToken'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const mutation = useConsumeMagicLink()
const auth = useAuthStore()
const status = ref<'pending' | 'ok' | 'error'>('pending')

// Single-use tokens MUST only be consumed once, but the same token can fire
// the consume TWICE (Vite dev HMR re-mount; CI route double-mount). Guarded
// two ways:
//   1. `claimSingleUseToken` — module-level, in-memory, shared across
//      instances; the first mount claims + POSTs, a racing re-mount
//      short-circuits. Can't be defeated by blocked storage (the magic-link
//      flow consumes at the in-network `:5173` origin where sessionStorage is
//      partitioned — a storage-only guard let BOTH mounts POST, and the 2nd's
//      401 clobbered the 1st's success with the error card).
//   2. The catch treats an error as benign when the auth store is already
//      authenticated — i.e. a racing fire's 200 hydrated it (safe here because
//      magic-link sign-in only authenticates ON success: pre-consume the user
//      is anonymous, so `authenticated` can only mean a sibling fire won).

onMounted(async () => {
    const token = String(route.query['token'] ?? '')
    if (token === '') {
        status.value = 'error'
        return
    }
    if (!claimSingleUseToken(token)) {
        // A sibling mount already fired this token's consume; finish the
        // redirect here rather than re-firing the now-single-use POST.
        status.value = 'ok'
        await safeReplace(router, '/tree')
        return
    }
    try {
        await mutation.mutateAsync(token)
    } catch {
        // A concurrent mount may have already consumed this token (its 200
        // hydrated the auth store); our 401 is then benign — we ARE signed
        // in — so fall through to the success redirect rather than showing
        // the error card. Only a genuine failure (still anonymous) is an error.
        if (auth.status !== 'authenticated') {
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
