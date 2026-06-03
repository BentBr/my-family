<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useConfirmEmailChange } from '@/api/hooks/users'
import { safeReplace } from '@/router/safeReplace'
import { claimSingleUseToken } from '@/utils/singleUseToken'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const confirm = useConfirmEmailChange()
const status = ref<'pending' | 'ok' | 'error'>('pending')

// Single-use token guard. A component-scoped ref can't dedupe a CI route
// double-mount (each instance has its own), so both would burn the token and
// the 2nd's 401 would surface a spurious error. `claimSingleUseToken` is
// module-level + in-memory — shared across instances, immune to blocked
// storage. Same guard as ConsumeView / InviteAccept.
onMounted(async () => {
    const token = String(route.query['token'] ?? '')
    if (token === '') {
        status.value = 'error'
        return
    }
    if (!claimSingleUseToken(token)) {
        // A sibling mount already confirmed this token; converge on /account.
        status.value = 'ok'
        await safeReplace(router, '/account')
        return
    }
    try {
        await confirm.mutateAsync(token)
    } catch {
        status.value = 'error'
        return
    }
    // Email change succeeded — flip to success BEFORE the navigation,
    // and swallow benign router rejections (NavigationDuplicated, guard
    // redirects). The previous combined try/catch would flip the UI to
    // 'error' on any throw inside router.replace, leaving the user on
    // the consume URL with an error alert even though the email change
    // actually went through. Same shape as ConsumeView.
    status.value = 'ok'
    await safeReplace(router, '/account')
})
</script>

<template>
    <v-card class="pa-6 text-center" data-testid="email-change-card">
        <template v-if="status === 'pending'">
            <v-progress-circular indeterminate color="primary" data-testid="email-change-pending-spinner" />
            <p class="mt-4">{{ t('account.email.confirmPending') }}</p>
        </template>
        <v-alert v-else-if="status === 'error'" type="error" data-testid="email-change-error">
            {{ t('account.email.confirmError') }}
        </v-alert>
    </v-card>
</template>
