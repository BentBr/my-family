import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import vuetify from 'vite-plugin-vuetify'

// Drop every HTML comment from the production `index.html` shell. The
// template carries explanatory prose (favicon stack, theme-color, fonts,
// the SEO fallback rationale) that is useful in dev but must not ship to
// users' DOM. `apply: 'build'` keeps the comments in the dev server. The
// prerendered pages are handled separately (their template is this same
// stripped shell, and the SSR body has no comments — Vue drops template
// comments in production).
const HTML_COMMENT = /<!--[\s\S]*?-->/g
function stripHtmlComments(): Plugin {
    return {
        name: 'strip-html-comments',
        apply: 'build',
        enforce: 'post',
        transformIndexHtml: {
            order: 'post',
            handler: (html: string): string => html.replace(HTML_COMMENT, ''),
        },
    }
}

// The baked SEO/OG tags in `index.html` are an English fallback for the
// SPA shell on non-prerendered (app) routes. On the PRERENDERED public
// pages they must be removed so `@unhead/vue` can inject the correct
// per-locale set without duplicates / wrong-locale leakage. Matched by
// tag shape (not comment markers) so the comment stripper above can run
// freely. Runs on the template BEFORE the SSR head is injected.
const SEO_FALLBACK_TAGS = [
    /<meta\s+name="description"[^>]*>/gi,
    /<meta\s+name="robots"[^>]*>/gi,
    /<meta\s+property="og:[^"]*"[^>]*>/gi,
    /<meta\s+name="twitter:[^"]*"[^>]*>/gi,
    /<link\s+rel="canonical"[^>]*>/gi,
    /<link\s+rel="alternate"\s+hreflang[^>]*>/gi,
]
function stripSeoFallback(html: string): string {
    return SEO_FALLBACK_TAGS.reduce((acc, re) => acc.replace(re, ''), html)
}

// vite-ssg reads `ssgOptions` off the Vite config. `ssgOptions.includedRoutes`
// is typed via module augmentation that ships with vite-ssg; `defineConfig`
// accepts the extra key. We only prerender the PUBLIC, locale-prefixed routes —
// the authenticated app stays a client-rendered SPA.
const PRERENDER_ROUTES = ['/en', '/de', '/en/imprint', '/de/imprint', '/en/data-policy', '/de/data-policy']

export default defineConfig({
    plugins: [vue(), vuetify({ autoImport: true }), stripHtmlComments()],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // Bundle Vuetify (and its deps) into the SSR build so the Node-side
    // prerender doesn't choke on Vuetify's CSS/ESM-only entry points.
    ssr: {
        noExternal: ['vuetify'],
    },
    // vite-ssg static-generation options. Only the public marketing/legal
    // pages are prerendered (each locale variant → its own HTML file with
    // correct-locale head tags); everything else is served from the SPA
    // shell. `mock: true` runs the prerender in happy-dom (jsdom-like) so
    // browser globals exist.
    ssgOptions: {
        includedRoutes: () => PRERENDER_ROUTES,
        mock: true,
        formatting: 'minify',
        // Strip the template's baked SEO fallback tags BEFORE the SSR head
        // is injected: unhead dedupes into existing tags in place, so a
        // post-render strip would delete the freshly injected ones too. For
        // indexable pages unhead then writes the full correct-locale set
        // into a clean head; the legal pages deliberately end up with ONLY
        // title + robots-noindex. The tags stay in the SPA shell
        // (`dist/index.html`), the only thing a non-JS scraper sees on app
        // routes.
        onBeforePageRender: (_route: string, indexHTML: string) => stripSeoFallback(indexHTML),
        onPageRendered: (route: string, html: string) => {
            console.log(`  prerendered: ${route}`)
            return html
        },
    },
    server: {
        port: 5173,
        host: '0.0.0.0',
        strictPort: true,
        // Vite blocks requests whose Host header doesn't match the dev server.
        // Dinghy proxies `*.my-fam-tree.docker` to this container, so we have to
        // allow those hostnames explicitly. `localhost` covers host-side runs.
        allowedHosts: ['my-fam-tree.docker', 'app.my-fam-tree.docker', 'localhost'],
        proxy: {
            // Inside the `fe` compose container the API is reachable via the FQDN
            // alias `api.my-fam-tree.docker`. On a host-side `pnpm dev` it defaults
            // to localhost:8080. Set VITE_API_PROXY_TARGET to override.
            '/api': {
                target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
                changeOrigin: true,
            },
        },
    },
})
