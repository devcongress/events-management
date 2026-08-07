<template>
  <div class="app-shell app-shell--standalone public-app-shell flex flex-col overflow-hidden bg-dc-cream text-dc-ink">
    <main class="app-main page-transition-host min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <div class="page-route-stack">
        <RouterView v-slot="{ Component, route }">
          <Transition name="page">
            <component :is="Component" :key="route.fullPath" class="page-view" />
          </Transition>
        </RouterView>
      </div>
    </main>
    <AppToaster />
  </div>
</template>

<script setup lang="ts">
import AppToaster from './components/ui/AppToaster.vue';
</script>
