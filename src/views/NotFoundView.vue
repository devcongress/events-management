<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { adminPath, isAdminPath } from '@/src/admin-routes';

const route = useRoute();

const missingPath = computed(() => route.fullPath);
const isOrganizerPath = computed(() => isAdminPath(route.path));

const primaryLink = computed(() => (isOrganizerPath.value ? adminPath('events') : '/'));
const primaryLabel = computed(() => (isOrganizerPath.value ? 'Organizer Console' : 'Back Home'));
</script>

<template>
  <div class="editorial-page">
    <section class="relative isolate flex min-h-[calc(100vh-104px)] items-center overflow-hidden border-b border-dc-yellow/10 px-4 py-14 sm:px-6 lg:px-8">
      <div
        class="absolute inset-0 -z-10 opacity-70"
        style="
          background-image:
            linear-gradient(rgba(249, 225, 94, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(249, 225, 94, 0.04) 1px, transparent 1px);
          background-size: 42px 42px;
        "
      />
      <div class="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <p class="editorial-eyebrow">route not found</p>
          <h1 class="mt-4 max-w-4xl text-6xl font-black leading-none tracking-tight text-white sm:text-7xl lg:text-8xl">
            This page missed the schedule.
          </h1>
          <p class="mt-6 max-w-2xl text-lg leading-8 text-dc-gray-light">
            The address does not match a public page, talk archive, quiz room, or organizer screen.
          </p>

          <div class="mt-6 max-w-2xl rounded-md border border-dc-yellow/10 bg-[#11110f] px-4 py-3 font-mono text-xs text-dc-gray-light">
            <span class="text-dc-yellow">Requested:</span>
            <span class="break-all">{{ missingPath }}</span>
          </div>

          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <RouterLink :to="primaryLink" class="editorial-action">
              {{ primaryLabel }}
            </RouterLink>
            <RouterLink to="/archive" class="editorial-secondary-action">
              Browse Archive
            </RouterLink>
            <RouterLink to="/leaderboard" class="editorial-secondary-action">
              Leaderboard
            </RouterLink>
          </div>
        </div>

        <aside class="editorial-panel relative overflow-hidden p-6">
          <div class="absolute right-4 top-4 font-mono text-8xl font-black leading-none text-dc-yellow/[0.06]">404</div>
          <div class="relative">
            <p class="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-dc-yellow">reconnect</p>
            <div class="mt-8 space-y-4">
              <RouterLink to="/archive" class="group block rounded-md border border-dc-yellow/10 bg-dc-yellow/[0.03] p-4 transition-colors hover:border-dc-yellow/35 hover:bg-dc-yellow/[0.07]">
                <p class="font-mono text-sm font-bold uppercase tracking-wide text-white group-hover:text-dc-yellow">Archive</p>
                <p class="mt-2 text-sm leading-6 text-dc-gray-light">Find published talks and slide decks.</p>
              </RouterLink>
              <RouterLink to="/my-talks" class="group block rounded-md border border-dc-yellow/10 bg-dc-yellow/[0.03] p-4 transition-colors hover:border-dc-yellow/35 hover:bg-dc-yellow/[0.07]">
                <p class="font-mono text-sm font-bold uppercase tracking-wide text-white group-hover:text-dc-yellow">My Talks</p>
                <p class="mt-2 text-sm leading-6 text-dc-gray-light">Check speaker submissions and uploads.</p>
              </RouterLink>
              <RouterLink to="/play" class="group block rounded-md border border-dc-yellow/10 bg-dc-yellow/[0.03] p-4 transition-colors hover:border-dc-yellow/35 hover:bg-dc-yellow/[0.07]">
                <p class="font-mono text-sm font-bold uppercase tracking-wide text-white group-hover:text-dc-yellow">Live Quiz</p>
                <p class="mt-2 text-sm leading-6 text-dc-gray-light">Join when a host opens a session.</p>
              </RouterLink>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
