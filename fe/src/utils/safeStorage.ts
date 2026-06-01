// Crash-safe Web Storage wrappers.
//
// `localStorage` / `sessionStorage` can throw on ACCESS (not just use) in
// some environments — Safari Private Browsing historically threw a
// QuotaExceededError the moment you touched `localStorage`, and embedded
// webviews can disable storage entirely. Reading/writing directly (as the
// stores + the consume flow did) therefore risks an uncaught exception
// that breaks an otherwise-working page. These helpers degrade
// gracefully: a failed read returns `null` (callers fall back to their
// default), a failed write/remove is a silent no-op.

function safeStore(pick: () => Storage): Storage | null {
    try {
        return pick()
    } catch {
        return null
    }
}

function make(pick: () => Storage): {
    get: (key: string) => string | null
    set: (key: string, value: string) => void
    remove: (key: string) => void
} {
    return {
        get(key: string): string | null {
            try {
                return safeStore(pick)?.getItem(key) ?? null
            } catch {
                return null
            }
        },
        set(key: string, value: string): void {
            try {
                safeStore(pick)?.setItem(key, value)
            } catch {
                // unavailable / quota exceeded — drop the write silently.
            }
        },
        remove(key: string): void {
            try {
                safeStore(pick)?.removeItem(key)
            } catch {
                // unavailable — nothing to remove.
            }
        },
    }
}

/** Crash-safe `localStorage`. */
export const safeLocal = make(() => globalThis.localStorage)
/** Crash-safe `sessionStorage`. */
export const safeSession = make(() => globalThis.sessionStorage)
