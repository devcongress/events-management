<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import EventsWorkspaceNav from '@/src/components/EventsWorkspaceNav.vue';
import { adminPath } from '@/src/admin-routes';

const route = useRoute();
const transitionName = ref('events-workspace-forward');
const submissionsPath = adminPath('events/submissions');

watch(() => route.path, (toPath) => {
  transitionName.value = toPath === submissionsPath
    ? 'events-workspace-forward'
    : 'events-workspace-back';
}, { flush: 'sync' });
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <EventsWorkspaceNav />
      <RouterView v-slot="{ Component, route: childRoute }">
        <Transition :name="transitionName" mode="out-in">
          <component :is="Component" :key="childRoute.name" />
        </Transition>
      </RouterView>
    </div>
  </div>
</template>
