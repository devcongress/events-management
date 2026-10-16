<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import AnnualConferenceRegistrationEmails from './AnnualConferenceRegistrationEmails.vue';
import type { ConferenceRegistrationGuest } from '@/src/lib/conference-guests';

const props = defineProps<{ year: string; guest: ConferenceRegistrationGuest | null }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
let previousFocus: HTMLElement | null = null;
let previousOverflow = '';

function unlock() {
  document.body.style.overflow = previousOverflow;
  previousFocus?.focus();
  previousFocus = null;
}

watch(() => props.guest, async (guest) => {
  if (guest) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousOverflow = document.body.style.overflow;
    await nextTick();
    if (!props.guest) return;
    dialog.value?.showModal();
    document.body.style.overflow = 'hidden';
  } else {
    dialog.value?.close();
    unlock();
  }
});

onBeforeUnmount(() => {
  if (props.guest) unlock();
});
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="guest-email-drawer" aria-labelledby="guest-email-title" @cancel.prevent="emit('close')" @click="(event) => { if (event.target === dialog) emit('close'); }">
      <template v-if="guest">
        <header class="flex items-start justify-between gap-4 border-b-2 border-dc-ink p-5">
          <div class="min-w-0">
            <p class="editorial-eyebrow">Guest email activity</p>
            <h2 id="guest-email-title" class="mt-1 break-words text-xl font-bold">{{ guest.name }}</h2>
            <p class="mt-1 break-all text-sm text-dc-gray">{{ guest.email }}</p>
            <p class="mt-2 text-sm capitalize">{{ guest.status }}{{ guest.is_test ? ' · Test registration' : '' }}</p>
          </div>
          <button type="button" class="editorial-action" autofocus @click="emit('close')">Close</button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-4"><AnnualConferenceRegistrationEmails :year="year" :registration-id="guest.id" /></div>
      </template>
    </dialog>
  </Teleport>
</template>

<style scoped>
.guest-email-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  width: min(100%, var(--organizer-detail-drawer-width, 620px));
  max-width: 100%;
  height: 100dvh;
  max-height: 100dvh;
  margin: 0;
  padding: 0;
  border: 0;
  border-left: 2px solid #111;
  background: var(--dc-paper, #f5f2e8);
  color: #111;
}

.guest-email-drawer[open] {
  display: flex;
  flex-direction: column;
}

.guest-email-drawer::backdrop {
  background: rgb(17 17 17 / 25%);
}
</style>
