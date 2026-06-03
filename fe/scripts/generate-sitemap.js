#!/usr/bin/env node
// Emits sitemap.xml (index + per-locale) and robots.txt into the Vite
// build output (`fe/dist/`). Runs after `vite build` so the directory
// already exists.
//
// Only the marketing pages are indexable: the home page (`/`) gets a
// sitemap entry per locale + hreflang alternates; the imprint and
// data-policy URLs are deliberately omitted from the sitemap AND
// disallowed in robots.txt (defence in depth alongside their
// `<meta name="robots" content="noindex,nofollow">` tags).

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const feRoot = path.resolve(__dirname, '..')
const outDir = path.join(feRoot, 'dist')

const baseUrl = process.env.VITE_BASE_URL || 'https://my-fam-tree.eu'
const today = new Date().toISOString().slice(0, 10)

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

function buildSitemap(localePaths) {
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

function buildIndex(localeSitemaps) {
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

async function main() {
    await fs.mkdir(outDir, { recursive: true })

    const localeSitemaps = []
    for (const locale of locales) {
        const localePaths = indexableSuffixes.map((suffix) => {
            const url = localeUrl(locale, suffix)
            const alternates = locales.map((l) => ({
                hreflang: l,
                href: localeUrl(l, suffix),
            }))
            // x-default → English variant.
            alternates.push({ hreflang: 'x-default', href: localeUrl('en', suffix) })
            return { url, alternates }
        })
        const xml = buildSitemap(localePaths)
        const filename = `sitemap_${locale}.xml`
        await fs.writeFile(path.join(outDir, filename), xml, 'utf8')
        console.log(`  ${filename}`)
        localeSitemaps.push(filename)
    }

    const index = buildIndex(localeSitemaps)
    await fs.writeFile(path.join(outDir, 'sitemap.xml'), index, 'utf8')
    console.log('  sitemap.xml')

    const robots = buildRobots()
    await fs.writeFile(path.join(outDir, 'robots.txt'), robots, 'utf8')
    console.log('  robots.txt')

    console.log('Done.')
}

main().catch((err) => {
    console.error('Sitemap generation failed:', err)
    process.exit(1)
})
