<template>
  <div class="app-shell app-shell--standalone public-app-shell flex flex-col overflow-hidden bg-dc-cream text-dc-ink">
    <main class="app-main page-transition-host min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <div class="page-route-stack">
        <RouterView v-slot="{ Component, route }">
          <Transition name="page">
            <PublicFormRouteFrame
              v-if="isPublicFormRouteName(route.name)"
              :key="route.fullPath"
            >
              <component :is="Component" class="page-view" />
            </PublicFormRouteFrame>
            <component v-else :is="Component" :key="route.fullPath" class="page-view" />
          </Transition>
        </RouterView>
      </div>
    </main>
    <AppToaster />
  </div>
</template>

<script setup lang="ts">
import AppToaster from './components/ui/AppToaster.vue';
import PublicFormRouteFrame from './components/PublicFormRouteFrame.vue';
import { isPublicFormRouteName } from './public-form-routes';
</script>
