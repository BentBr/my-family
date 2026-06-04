<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppBar from '@/components/layout/AppBar.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'

const route = useRoute()

// One coherent width system, driven by each route's `meta.width`
// (see the router's RouteMeta declaration). Defaults to `'reading'`
// so a new authenticated page is comfortably clamped + centered unless
// it opts into `'wide'` (data tables) or `'full'` (the tree canvas).
const width = computed<'full' | 'wide' | 'reading'>(() => route.meta.width ?? 'reading')
</script>

<template>
    <AppBar />
    <AppSidebar />
    <v-main>
        <v-container fluid class="fade-router-view page-container" :class="`page-container--${width}`">
            <router-view v-slot="{ Component, route: r }">
                <transition name="fade" mode="out-in" appear>
                    <!-- Key on `path`, not `fullPath`. Including the query
                         string here would unmount + remount the route
                         component on every `router.replace({ query })`
                         call — which is exactly what TreeView does to
                         strip a one-shot `?center=` param after capturing
                         it. Path-only is the standard pattern. -->
                    <component :is="Component" :key="r.path" />
                </transition>
            </router-view>
        </v-container>
    </v-main>
</template>

<style scoped>
/* Coherent page-width tiers. All three keep `width: 100%` so the container
 * never overflows its column; the md+ clamps below add a max + centre. The
 * base v-container padding is preserved everywhere except the full-bleed
 * tier, which the tree canvas wants edge-to-edge. */
.page-container {
    width: 100%;
}

/* Full-bleed: the tree fills the whole canvas — no reading clamp and no
 * outer scrollbar. Fill the height v-main hands us and let the tree manage
 * its own internal pan/scroll; the page itself must not produce a second
 * scrollbar on large screens (the regression that prompted this). */
.page-container--full {
    max-width: none;
    padding: 0;
    /* Exactly the viewport height minus the app bar (v-main already pads the
     * top by `--v-layout-top`), so the page total is one viewport — no outer
     * scrollbar. Flex column lets the tree page fill the remaining height. */
    height: calc(100dvh - var(--v-layout-top, 64px));
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

@media (min-width: 960px) {
    /* Forms + overview pages (account, family settings, health, …). */
    .page-container--reading {
        max-width: 960px;
        margin-left: auto;
        margin-right: auto;
    }
    /* Data tables (audit, members, invites, upcoming): roomy, but contained
     * so they don't sprawl edge-to-edge on ultrawide displays. */
    .page-container--wide {
        max-width: 1600px;
        margin-left: auto;
        margin-right: auto;
    }
}
</style>
