<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const panelRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
let previouslyFocused: HTMLElement | null = null;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';
let appWasInert = false;

function lockPage() {
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousBodyOverflow = document.body.style.overflow;
  previousDocumentOverflow = document.documentElement.style.overflow;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  const app = document.querySelector<HTMLElement>('#app');

  appWasInert = app?.hasAttribute('inert') ?? false;
  if (!appWasInert) app?.setAttribute('inert', '');
  document.addEventListener('keydown', handleKeydown);
}

function unlockPage() {
  document.body.style.overflow = previousBodyOverflow;
  document.documentElement.style.overflow = previousDocumentOverflow;
  const app = document.querySelector<HTMLElement>('#app');

  if (!appWasInert) app?.removeAttribute('inert');
  document.removeEventListener('keydown', handleKeydown);
  previouslyFocused?.focus();
  previouslyFocused = null;
}

function requestClose() {
  emit('close');
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    requestClose();

    return;
  }
  if (event.key !== 'Tab' || !panelRef.value) return;
  const focusable = [...panelRef.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];

  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1)!;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(() => props.open, async (open, wasOpen) => {
  if (open && !wasOpen) {
    lockPage();
    await nextTick();
    closeButtonRef.value?.focus();
  } else if (!open && wasOpen) {
    unlockPage();
  }
});

onUnmounted(() => {
  if (props.open) unlockPage();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="registration-email-drawer">
      <div v-if="open" class="fixed inset-0 z-[140] flex justify-end bg-black/30" role="presentation" @click.self="requestClose">
        <section ref="panelRef" class="registration-email-drawer flex h-full w-full max-w-[var(--organizer-detail-drawer-width)] flex-col border-l-2 border-dc-ink bg-dc-paper shadow-[-10px_0_0_rgba(17,17,17,0.14)]" role="dialog" aria-modal="true" aria-labelledby="registration-email-drawer-title" tabindex="-1">
          <header class="flex shrink-0 items-start justify-between gap-4 border-b-2 border-dc-ink bg-dc-paper-warm px-5 py-4 sm:px-6">
            <div>
              <p class="editorial-eyebrow">Registration</p>
              <h2 id="registration-email-drawer-title" class="mt-1 text-2xl font-bold text-dc-ink">Email details</h2>
            </div>
            <button ref="closeButtonRef" type="button" class="motion-press grid min-h-11 min-w-11 place-items-center rounded-md border-2 border-dc-ink bg-white text-lg font-semibold" aria-label="Close email details" @click="requestClose">×</button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6"><slot /></div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.registration-email-drawer-enter-active,
.registration-email-drawer-leave-active { transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1); }
.registration-email-drawer-enter-active .registration-email-drawer,
.registration-email-drawer-leave-active .registration-email-drawer { transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1); }
.registration-email-drawer-enter-from,
.registration-email-drawer-leave-to { opacity: 0; }
.registration-email-drawer-enter-from .registration-email-drawer,
.registration-email-drawer-leave-to .registration-email-drawer { transform: translate3d(100%, 0, 0); }
@media (prefers-reduced-motion: reduce) {
  .registration-email-drawer-enter-active,
  .registration-email-drawer-leave-active,
  .registration-email-drawer-enter-active .registration-email-drawer,
  .registration-email-drawer-leave-active .registration-email-drawer { transition: none; }
}
</style>
