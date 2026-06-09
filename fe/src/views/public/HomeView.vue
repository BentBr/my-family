<script setup lang="ts">
/**
 * Public home page — `/`.
 *
 * Layout (top to bottom):
 *   1. Hero: sloth-family image + headline + lede + two CTAs.
 *   2. Feature row: three cards with icon + title + body.
 *   3. Screenshot slot: warm hatched `.ph-img` placeholder until a
 *      tree-view screenshot is dropped at `assets/landing/tree.png`.
 *   4. Footer CTA: bold "Create an account" call.
 *
 * Head metadata (title, description, OG/Twitter, canonical, hreflang)
 * is owned centrally by `useRouteMeta` (mounted in `App.vue`) via the
 * shared `usePageMeta` composable — the route's `meta` descriptor names
 * the i18n keys, so this view declares no head of its own.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useLocalizedPath } from '@/composables/useLocalizedPath'
import { currentResolvedTheme } from '@/composables/useThemeMode'
import { useUiStore } from '@/stores/ui'

// Importing the brand imagery from `@/assets/` lets Vite hash the
// resolved URLs (`/assets/sloth-family-960-[hash].webp`) at build time.
// A regenerated image lands at a new URL → browsers + CDNs fetch
// fresh on the next visit, no cache-control bypass needed.
import slothFamilyHero from '@/assets/brand/sloth-family-960.webp'
import treeExampleLight960 from '@/assets/brand/tree-example-light-960.webp'
import treeExampleLight1280 from '@/assets/brand/tree-example-light-1280.webp'
import treeExampleDark960 from '@/assets/brand/tree-example-dark-960.webp'
import treeExampleDark1280 from '@/assets/brand/tree-example-dark-1280.webp'

const { t } = useI18n()
const ui = useUiStore()
// CTA targets carry the active locale in the PRERENDERED HTML so
// crawlers / no-JS clients keep their language without a redirect hop.
const localized = useLocalizedPath()

// Tree-screenshot URL pair — swaps between the light and dark variants
// emitted by `pnpm generate:images` (the script reads
// `assets/example-light.png` / `example-dark.png` and writes
// `tree-example-{light,dark}-{960,1280}.webp` into src/assets/brand/).
// The variant follows the user's resolved theme so the screenshot's
// chrome matches the surrounding page, including the system→manual
// override toggle.
const treeExample = computed(() =>
    currentResolvedTheme(ui.theme) === 'dark'
        ? { src: treeExampleDark960, srcset: `${treeExampleDark960} 960w, ${treeExampleDark1280} 1280w` }
        : { src: treeExampleLight960, srcset: `${treeExampleLight960} 960w, ${treeExampleLight1280} 1280w` },
)

interface Feature {
    key: 'relations' | 'reminders' | 'privacy'
    icon: string
}
const features: Feature[] = [
    { key: 'relations', icon: 'network' },
    { key: 'reminders', icon: 'bell' },
    { key: 'privacy', icon: 'lock' },
]
</script>

<template>
    <article class="home" data-testid="public-home">
        <!-- Hero -->
        <section class="home__hero">
            <div class="home__hero-text">
                <p class="home__eyebrow">{{ t('public.home.hero.eyebrow') }}</p>
                <h1 class="home__title display">{{ t('public.home.hero.title') }}</h1>
                <p class="home__lede">{{ t('public.home.hero.lede') }}</p>
                <div class="home__cta">
                    <v-btn
                        color="primary"
                        variant="flat"
                        size="large"
                        :to="localized('/auth/sign-in')"
                        data-testid="home-cta-primary"
                    >
                        {{ t('public.home.hero.ctaPrimary') }}
                    </v-btn>
                    <v-btn
                        variant="text"
                        size="large"
                        :to="localized('/auth/sign-in')"
                        data-testid="home-cta-secondary"
                    >
                        {{ t('public.home.hero.ctaSecondary') }}
                    </v-btn>
                </div>
            </div>
            <div class="home__hero-image">
                <img
                    :src="slothFamilyHero"
                    width="960"
                    height="640"
                    loading="eager"
                    decoding="async"
                    :alt="t('public.home.hero.imageAlt')"
                />
            </div>
        </section>

        <!-- Features -->
        <section class="home__features">
            <div v-for="f in features" :key="f.key" class="home__feature">
                <v-icon :icon="f.icon" size="32" color="primary" />
                <h2 class="home__feature-title display">{{ t(`public.home.features.${f.key}.title`) }}</h2>
                <p class="home__feature-body">{{ t(`public.home.features.${f.key}.body`) }}</p>
            </div>
        </section>

        <!-- Real tree-view screenshot. Source PNGs live in
             `assets/example-{light,dark}.png` and are turned into the
             two WebP sets by `pnpm generate:images` (output under
             src/assets/brand/). `treeExample` above resolves to
             whichever variant matches the visitor's current theme, so
             the screenshot's UI chrome matches the surrounding page on
             both light + dark backgrounds. -->
        <section class="home__screenshot">
            <figure class="home__screenshot-figure">
                <img
                    :src="treeExample.src"
                    :srcset="treeExample.srcset"
                    sizes="(max-width: 768px) 100vw, 1100px"
                    width="1245"
                    height="732"
                    loading="lazy"
                    decoding="async"
                    :alt="t('public.home.screenshot.alt')"
                />
                <figcaption class="home__screenshot-caption">
                    {{ t('public.home.screenshot.caption') }}
                </figcaption>
            </figure>
        </section>

        <!-- Final CTA -->
        <section class="home__cta-footer">
            <h2 class="home__cta-title display">{{ t('public.home.cta.title') }}</h2>
            <v-btn
                color="primary"
                variant="flat"
                size="x-large"
                :to="localized('/auth/sign-in')"
                data-testid="home-cta-footer"
            >
                {{ t('public.home.cta.button') }}
            </v-btn>
        </section>
    </article>
</template>

<style scoped>
.home {
    display: flex;
    flex-direction: column;
    gap: clamp(48px, 8vw, 96px);
}

/* ---- Hero ---- */
.home__hero {
    display: grid;
    grid-template-columns: 1fr;
    gap: clamp(24px, 4vw, 48px);
    align-items: center;
}
@media (min-width: 768px) {
    .home__hero {
        grid-template-columns: 1.05fr 1fr;
    }
}
.home__eyebrow {
    color: var(--acc-strong);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 13px;
    margin: 0 0 12px;
}
.home__title {
    font-size: clamp(36px, 5vw, 56px);
    font-weight: 700;
    color: var(--text);
    line-height: 1.1;
    margin: 0 0 16px;
}
.home__lede {
    font-size: clamp(16px, 1.4vw, 18px);
    color: var(--text-2);
    line-height: 1.55;
    margin: 0 0 28px;
    max-width: 56ch;
}
.home__cta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}
.home__hero-image img {
    width: 100%;
    height: auto;
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-lg);
    display: block;
}

/* ---- Features ---- */
.home__features {
    display: grid;
    grid-template-columns: 1fr;
    gap: clamp(24px, 3vw, 32px);
}
@media (min-width: 768px) {
    .home__features {
        grid-template-columns: repeat(3, 1fr);
    }
}
.home__feature {
    padding: 24px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.home__feature-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    margin: 0;
}
.home__feature-body {
    color: var(--text-2);
    font-size: 14.5px;
    line-height: 1.55;
    margin: 0;
}

/* ---- Screenshot slot ---- */
.home__screenshot {
    display: flex;
    justify-content: center;
}
.home__screenshot-figure {
    margin: 0;
    width: 100%;
    max-width: 1100px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}
.home__screenshot-figure img {
    width: 100%;
    height: auto;
    border-radius: var(--r-lg);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    display: block;
}
.home__screenshot-caption {
    color: var(--text-3);
    font-size: 13px;
    text-align: center;
    max-width: 58ch;
}

/* ---- Footer CTA ---- */
.home__cta-footer {
    text-align: center;
    padding-block: clamp(32px, 5vw, 56px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
}
.home__cta-title {
    font-size: clamp(24px, 3.4vw, 36px);
    font-weight: 700;
    color: var(--text);
    margin: 0;
}
</style>
