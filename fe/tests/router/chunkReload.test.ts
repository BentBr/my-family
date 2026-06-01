import { describe, expect, it } from 'vitest'

import { isChunkLoadError, shouldTriggerReload } from '@/router/chunkReload'

// Minimal in-memory Storage stand-in for the loop-guard tests.
function memStore(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
    const map = new Map<string, string>(Object.entries(initial))
    return {
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => {
            map.set(k, v)
        },
    }
}

describe('shouldTriggerReload (loop guard)', () => {
    it('reloads on the first chunk error (no prior timestamp) and records it', () => {
        const store = memStore()
        expect(shouldTriggerReload(store, 1_000_000)).toBe(true)
        // The timestamp was persisted so the next call can gate on it.
        expect(store.getItem('mft:chunk-reload-at')).toBe('1000000')
    })

    it('does NOT reload again within the cooldown window (prevents loops)', () => {
        const store = memStore({ 'mft:chunk-reload-at': '1000000' })
        // 5s later — still inside the 10s cooldown → no second reload.
        expect(shouldTriggerReload(store, 1_005_000)).toBe(false)
    })

    it('reloads again once the cooldown has elapsed', () => {
        const store = memStore({ 'mft:chunk-reload-at': '1000000' })
        // 11s later — past the cooldown → a fresh chunk error may reload.
        expect(shouldTriggerReload(store, 1_011_000)).toBe(true)
    })

    it('does NOT reload when the store cannot be written (unguardable → fail safe)', () => {
        const store: Pick<Storage, 'getItem' | 'setItem'> = {
            getItem: () => null,
            setItem: () => {
                throw new Error('storage disabled')
            },
        }
        expect(shouldTriggerReload(store, 1_000_000)).toBe(false)
    })

    it('does NOT reload when the store cannot be read (unguardable → fail safe)', () => {
        const store: Pick<Storage, 'getItem' | 'setItem'> = {
            getItem: () => {
                throw new Error('storage blocked')
            },
            setItem: () => undefined,
        }
        expect(shouldTriggerReload(store, 1_000_000)).toBe(false)
    })
})

describe('isChunkLoadError (precision: only chunk-load failures)', () => {
    it('matches the browser dynamic-import failure messages', () => {
        expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/x-abc.js'))).toBe(true)
        expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true)
        expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    })

    it('does NOT match ordinary in-app errors', () => {
        expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
        expect(isChunkLoadError(new Error('Navigation aborted'))).toBe(false)
        expect(isChunkLoadError('some string')).toBe(false)
        expect(isChunkLoadError(null)).toBe(false)
    })
})
