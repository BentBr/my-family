import { useLocaleStore } from '@/stores/locale'

/**
 * Locale-prefixed path builder for template links: `/imprint` →
 * `/de/imprint`, `/` → `/de`. Every route lives under `/:lang(en|de)`,
 * and while the router's catch-all normalizer would fix a bare path
 * client-side, anchors in the PRERENDERED public pages are followed by
 * crawlers and no-JS clients that never run the router — those must
 * carry the active locale in the static HTML (and clicking them must
 * not cost a redirect hop). Reads the store inside the returned closure,
 * so render-time usage stays reactive to locale switches.
 */
export function useLocalizedPath(): (path: string) => string {
    const locale = useLocaleStore()
    return (path: string): string => `/${locale.locale}${path === '/' ? '' : path}`
}
