<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { restrictedConferencePlaces } from '@/src/annual-conference';
import { fetchRestrictedConferenceAccess, queryKeys } from '@/src/lib/api';

const access = useQuery({
  queryKey: queryKeys.restrictedConferenceAccess,
  queryFn: fetchRestrictedConferenceAccess,
  refetchOnWindowFocus: 'always',
});
</script>

<template>
  <main class="editorial-page">
    <div class="editorial-wrap">
      <header class="mb-6">
        <p class="editorial-eyebrow">Annual Conference</p>
        <h1 class="mt-2 text-3xl font-bold text-dc-ink">Your conference access</h1>
        <p class="mt-2 text-sm text-dc-gray">Open a workspace assigned to you for a conference edition.</p>
      </header>

      <p v-if="access.isPending.value" role="status" class="text-sm text-dc-gray">Checking your access…</p>
      <div v-else-if="access.isError.value" class="editorial-panel p-5" role="alert">
        <p>We couldn’t load your conference access.</p>
        <button type="button" class="editorial-action mt-3" @click="access.refetch()">Try again</button>
      </div>
      <div v-else-if="!access.data.value?.editions.length" class="editorial-panel p-5">
        <h2 class="font-semibold text-dc-ink">No workspaces assigned yet</h2>
        <p class="mt-1 text-sm text-dc-gray">Ask an EMS owner to grant access to the places you need.</p>
      </div>
      <section v-for="edition in access.data.value?.editions ?? []" v-else :key="edition.year" class="editorial-panel mb-4 p-5">
        <h2 class="font-semibold text-dc-ink">{{ edition.label }}</h2>
        <ul class="mt-3 divide-y divide-dc-border">
          <li v-for="place in restrictedConferencePlaces(String(edition.year), edition.capabilities)" :key="place.href">
            <RouterLink :to="place.href" class="motion-press flex min-h-11 items-center justify-between gap-4 rounded-md px-2 text-sm font-semibold text-dc-ink hover:bg-dc-paper-warm focus-visible:outline-dc-pink">
              {{ place.label }}
              <span aria-hidden="true">→</span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>
