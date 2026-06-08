#!/usr/bin/env node
// Emits sitemap.xml (index + per-locale) and robots.txt into the Vite
// build output (`fe/dist/`). Runs after `vite build` so the directory
// already exists. Each XML artifact is written BOTH plain and gzipped
// (`*.xml` + `*.xml.gz`) so the server can hand crawlers the compressed
// variant.
//
// The generation is also imported by the dev server (see
// `sitemapDevServer` in vite.config.ts) so `/sitemap.xml`, the per-locale
// sitemaps and `/robots.txt` are reachable in dev too — they are NOT
// locale-prefixed and must never hit the SPA's locale normalizer.
//
// Only the marketing pages are indexable: the home page (`/`) gets a
// sitemap entry per locale + hreflang alternates; the imprint and
// data-policy URLs are deliberately omitted from the sitemap AND
// disallowed in robots.txt (defence in depth alongside their
// `<meta name="robots" content="noindex,nofollow">` tags).

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { gzipSync } from 'zlib'

const baseUrl = process.env.VITE_BASE_URL || 'https://my-fam-tree.eu'

// The public site is locale-PREFIXED (`/en`, `/de/imprint`, …), matching
// the routes vite-ssg prerenders. Only the home page is indexable; its
// per-locale URLs are real prefixed paths (`/en`, `/de`), not `?lang=`
// query hints, so crawlers index exactly what's served as static HTML.
const locales = ['en', 'de']

// Locale-agnostic suffixes of the indexable pages (home only). `''` = the
// locale root (`/en`, `/de`).
const indexableSuffixes = ['']

// Locale-agnostic suffixes that are explicitly NOT indexable — blocked at
// the robots.txt layer for EVERY locale prefix.
const disallowedSuffixes = ['/imprint', '/data-policy']

function localeUrl(locale, suffix) {
    return `${baseUrl}/${locale}${suffix}`
}

function buildSitemap(localePaths, today) {
    const entries = localePaths
        .map(({ url, alternates }) => {
            const altLinks = alternates
                .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`)
                .join('\n')
            return `  <url>
    <loc>${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
${altLinks}
  </url>`
        })
        .join('\n')
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`
}

function buildIndex(localeSitemaps, today) {
    const entries = localeSitemaps
        .map((s) => `  <sitemap><loc>${baseUrl}/${s}</loc><lastmod>${today}</lastmod></sitemap>`)
        .join('\n')
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`
}

function buildRobots() {
    // Disallow every locale prefix of each non-indexable suffix
    // (`/en/imprint`, `/de/imprint`, …).
    const disallowLines = disallowedSuffixes
        .flatMap((suffix) => locales.map((l) => `Disallow: /${l}${suffix}`))
        .join('\n')
    return `User-agent: *
Allow: /
${disallowLines}

Sitemap: ${baseUrl}/sitemap.xml
`
}

/**
 * Build every sitemap/robots artifact in memory, keyed by filename.
 * Pure (no filesystem) so both the build writer and the dev server can
 * use it. `today` is injected for deterministic output.
 */
export function buildSitemapArtifacts(today = new Date().toISOString().slice(0, 10)) {
    const artifacts = {}
    const localeSitemaps = []
    for (const locale of locales) {
        const localePaths = indexableSuffixes.map((suffix) => {
            const url = localeUrl(locale, suffix)
            const alternates = locales.map((l) => ({ hreflang: l, href: localeUrl(l, suffix) }))
            alternates.push({ hreflang: 'x-default', href: localeUrl('en', suffix) }) // x-default → English
            return { url, alternates }
        })
        const filename = `sitemap_${locale}.xml`
        artifacts[filename] = buildSitemap(localePaths, today)
        localeSitemaps.push(filename)
    }
    artifacts['sitemap.xml'] = buildIndex(localeSitemaps, today)
    artifacts['robots.txt'] = buildRobots()
    return artifacts
}

/** Content-Type for a generated artifact, by filename. */
export function sitemapContentType(filename) {
    return filename.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8'
}

async function main() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const outDir = path.join(path.resolve(__dirname, '..'), 'dist')
    await fs.mkdir(outDir, { recursive: true })

    const artifacts = buildSitemapArtifacts()
    for (const [filename, content] of Object.entries(artifacts)) {
        await fs.writeFile(path.join(outDir, filename), content, 'utf8')
        console.log(`  ${filename}`)
        // Gzip the XML artifacts as well (`*.xml.gz`); robots.txt stays plain.
        if (filename.endsWith('.xml')) {
            await fs.writeFile(path.join(outDir, `${filename}.gz`), gzipSync(Buffer.from(content, 'utf8')))
            console.log(`  ${filename}.gz`)
        }
    }
    console.log('Done.')
}

// Only run the writer when invoked as a script (not when imported).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main().catch((err) => {
        console.error('Sitemap generation failed:', err)
        process.exit(1)
    })
}
