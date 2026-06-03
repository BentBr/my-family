import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

const mutateAsync = vi.fn()
vi.mock('@/api/hooks/users', () => ({
    useConfirmEmailChange: () => ({ mutateAsync }),
}))

import EmailChangeConsumeView from '@/views/account/EmailChangeConsumeView.vue'
import { i18n } from '@/i18n'

function makeRouter(): Router {
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/account/email-change/consume', component: { template: '<div />' } },
            { path: '/account', component: { template: '<div />' } },
        ],
    })
}

async function mountView(query: string): Promise<ReturnType<typeof mount>> {
    const router = makeRouter()
    await router.push(`/account/email-change/consume${query.length ? '?' + query : ''}`)
    await router.isReady()
    return mount(EmailChangeConsumeView, {
        global: {
            plugins: [i18n, router],
            stubs: {
                'v-card': { template: '<div><slot /></div>' },
                'v-progress-circular': { template: '<div class="spinner" />' },
                'v-alert': { template: '<div :data-testid="$attrs[\'data-testid\']"><slot /></div>' },
            },
        },
    })
}

describe('EmailChangeConsumeView', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        mutateAsync.mockReset()
    })

    it('error state when token query is missing', async () => {
        const w = await mountView('')
        await flushPromises()
        expect(w.find('[data-testid="email-change-error"]').exists()).toBe(true)
        expect(mutateAsync).not.toHaveBeenCalled()
    })

    it('calls confirm with token on mount', async () => {
        mutateAsync.mockResolvedValueOnce({})
        await mountView('token=ok')
        await flushPromises()
        expect(mutateAsync).toHaveBeenCalledWith('ok')
    })

    it('shows error when confirm rejects', async () => {
        mutateAsync.mockRejectedValueOnce(new Error('bad'))
        const w = await mountView('token=x')
        await flushPromises()
        expect(w.find('[data-testid="email-change-error"]').exists()).toBe(true)
    })

    it('a second mount of the same token does not re-POST (module dedup)', async () => {
        // Guards the CI route double-mount: a component-scoped ref can't dedupe
        // across instances, so both would burn the token and the 2nd's 401
        // would surface a spurious error.
        mutateAsync.mockResolvedValueOnce({})
        await mountView('token=ec-double')
        await flushPromises()
        expect(mutateAsync).toHaveBeenCalledTimes(1)
        const second = await mountView('token=ec-double')
        await flushPromises()
        expect(mutateAsync).toHaveBeenCalledTimes(1)
        expect(second.find('[data-testid="email-change-error"]').exists()).toBe(false)
    })
})
