import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vuetify from 'vite-plugin-vuetify'

// vite-ssg reads `ssgOptions` off the Vite config. `ssgOptions.includedRoutes`
// is typed via module augmentation that ships with vite-ssg; `defineConfig`
// accepts the extra key. We only prerender the PUBLIC, locale-prefixed routes —
// the authenticated app stays a client-rendered SPA.
const PRERENDER_ROUTES = ['/en', '/de', '/en/imprint', '/de/imprint', '/en/data-policy', '/de/data-policy']

export default defineConfig({
    plugins: [vue(), vuetify({ autoImport: true })],
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
        // Strip the template's baked SEO fallback BEFORE the SSR head is
        // injected: unhead dedupes into existing tags in place, so a
        // post-render strip would delete the freshly injected ones with
        // the block. For indexable pages unhead then writes the full
        // correct-locale set into a clean head; the legal pages
        // deliberately end up with ONLY title + robots-noindex. The block
        // stays in the SPA shell (`dist/index.html`), where it is the
        // only thing a non-JS scraper sees on app routes.
        onBeforePageRender: (_route: string, indexHTML: string) =>
            indexHTML.replace(/<!--seo-fallback-->[\s\S]*?<!--\/seo-fallback-->/, ''),
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
