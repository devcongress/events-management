<script setup lang="ts">
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
</script>

<template>
  <div class="text-center">
    <NaviiAvatar seed="loading-participant" title="" :size="128" class="mx-auto" />
    <p class="font-sans text-xs font-semibold uppercase tracking-[0.22em]">Live learning room</p>
    <h1 class="mt-4 text-4xl font-bold">YOU'RE IN</h1>
    <p class="mt-3 text-sm leading-6">Your avatar is fixed for this room. Keep the name below or change it before the presentation starts.</p>
    <div class="mt-7 rounded-lg border-2 border-dc-ink bg-dc-paper p-5 text-left shadow-[3px_3px_0_#111111]">
      <label class="block"><span class="editorial-label">Your room name</span><input class="editorial-input mt-2" value="Community participant" disabled /></label>
      <button type="button" class="editorial-action mt-4 w-full" disabled>Save name</button>
    </div>
    <p class="mt-5 font-sans">Waiting for the facilitator to start</p>
  </div>
</template>
