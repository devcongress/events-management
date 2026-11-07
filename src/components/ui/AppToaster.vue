<script setup lang="ts">
import 'vue-sonner/style.css';
import { Toaster } from 'vue-sonner';

defineProps<{ phoneFooter?: boolean }>();

const toastOptions = {
  closeButton: true,
  classes: {
    toast: 'app-toast',
    title: 'app-toast-title',
    description: 'app-toast-description',
    actionButton: 'app-toast-action',
    cancelButton: 'app-toast-cancel',
    closeButton: 'app-toast-close',
  },
};
</script>

<template>
  <Toaster
    id="app"
    class="app-toaster"
    theme="light"
    position="bottom-right"
    close-button
    expand
    :duration="4600"
    :gap="10"
    :visible-toasts="1"
    :offset="{ bottom: phoneFooter ? 'calc(8rem + env(safe-area-inset-bottom))' : '1rem', right: '1rem' }"
    :mobile-offset="{ bottom: phoneFooter ? '8rem' : '0.75rem', right: '0.75rem', left: '0.75rem' }"
    :swipe-directions="['right']"
    :toast-options="toastOptions"
    container-aria-label="DevCon notifications"
  />
</template>
