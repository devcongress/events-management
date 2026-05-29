<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

interface NavLink {
  href: string;
  label: string;
  accent?: boolean;
}

const route = useRoute();

const publicLinks: NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/archive', label: 'Archive' },
  { href: '/leaderboard', label: 'Leaderboard' },
];

const speakerLinks: NavLink[] = [
  { href: '/my-talks', label: 'My Talks' },
];

const playLinks: NavLink[] = [
  { href: '/play', label: 'Play', accent: true },
];

const adminLinks: NavLink[] = [
  { href: '/admin/events', label: 'Admin' },
];

const isAdminRoute = computed(() => route.path.startsWith('/admin'));
const primaryLinks = computed(() => (isAdminRoute.value ? adminLinks : publicLinks));

function isActive(href: string) {
  if (href === '/') return route.path === '/';
  return route.path === href || route.path.startsWith(`${href}/`);
}

function linkClass(link: NavLink) {
  if (isActive(link.href)) {
    return 'bg-dc-yellow text-dc-dark';
  }

  if (link.accent) {
    return 'border-dc-yellow/30 text-dc-yellow hover:bg-dc-yellow hover:text-dc-dark';
  }

  return 'border-transparent text-dc-gray-light hover:border-dc-yellow/25 hover:text-white';
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-dc-dark text-white">
    <header class="sticky top-0 z-50 border-b border-dc-yellow/30 bg-dc-dark/95 backdrop-blur-sm">
      <div class="mx-auto flex min-h-16 max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between gap-4">
          <RouterLink to="/" class="group flex items-center font-mono text-xl font-bold tracking-tight">
            <span class="text-white">DEV</span>
            <span class="text-dc-yellow">::</span>
            <span class="text-white">CON</span>
            <span class="text-dc-gray transition-colors group-hover:text-dc-yellow">[]</span>
          </RouterLink>

          <div class="hidden items-center gap-2 md:flex">
            <span class="border border-dc-yellow/20 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-dc-gray-light">
              {{ isAdminRoute ? 'Organizer' : 'Community' }}
            </span>
          </div>
        </div>

        <nav class="flex gap-2 overflow-x-auto pb-1 font-mono text-xs font-semibold uppercase tracking-wide">
          <RouterLink
            v-for="link in primaryLinks"
            :key="link.href"
            :to="link.href"
            class="shrink-0 border px-3 py-2 transition-all"
            :class="linkClass(link)"
          >
            {{ link.label }}
          </RouterLink>

          <span class="mx-1 hidden h-9 w-px shrink-0 bg-dc-yellow/15 sm:block" />

          <RouterLink
            v-for="link in speakerLinks"
            :key="link.href"
            :to="link.href"
            class="shrink-0 border px-3 py-2 transition-all"
            :class="linkClass(link)"
          >
            {{ link.label }}
          </RouterLink>

          <RouterLink
            v-for="link in playLinks"
            :key="link.href"
            :to="link.href"
            class="shrink-0 border px-3 py-2 transition-all"
            :class="linkClass(link)"
          >
            {{ link.label }}
          </RouterLink>
        </nav>
      </div>
    </header>

    <main class="flex-1 overflow-auto">
      <RouterView v-slot="{ Component, route }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>
