<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  mobileSheet?: boolean;
}>(), {
  confirmLabel: 'Confirm',
  busyLabel: 'Working...',
  cancelLabel: 'Cancel',
  busy: false,
  danger: false,
  mobileSheet: false,
});

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const panel = ref<HTMLElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
let previouslyFocusedElement: HTMLElement | null = null;

function cancel() {
  if (props.busy) return;
  emit('cancel');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
    return;
  }

  if (event.key !== 'Tab' || !panel.value) return;
  const focusable = Array.from(panel.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(() => props.open, async (open) => {
  if (open) {
    previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    await nextTick();
    cancelButton.value?.focus();
    return;
  }

  previouslyFocusedElement?.focus();
  previouslyFocusedElement = null;
});

onBeforeUnmount(() => {
  previouslyFocusedElement?.focus();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog">
      <div
        v-if="open"
        class="confirm-dialog-shell fixed inset-0 z-[120] flex bg-black/35"
        :class="mobileSheet ? 'items-end p-0 sm:items-center sm:justify-center sm:px-4 sm:py-6' : 'items-center justify-center px-4 py-6'"
        role="presentation"
        @click.self="cancel"
        @keydown="handleKeydown"
      >
        <section
          ref="panel"
          class="confirm-dialog-panel w-full border-2 border-dc-ink bg-white p-5 shadow-[6px_6px_0_#111111]"
          :class="mobileSheet ? 'confirm-dialog-panel--mobile-sheet' : 'max-w-md rounded-lg'"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-title`"
        >
          <div v-if="mobileSheet" class="confirm-dialog-handle sm:hidden" aria-hidden="true" />
          <h2 :id="`${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-title`" class="text-2xl font-bold leading-tight text-dc-ink">
            {{ title }}
          </h2>
          <p class="mt-3 text-sm leading-6 text-dc-gray">{{ message }}</p>
          <div v-if="$slots.default" class="mt-4">
            <slot />
          </div>
          <div class="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              ref="cancelButton"
              type="button"
              class="motion-press rounded-md border-2 border-dc-ink bg-white px-4 py-3 font-mono text-xs font-semibold uppercase tracking-wide text-dc-ink disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="busy"
              @click="cancel"
            >
              {{ cancelLabel }}
            </button>
            <button
              type="button"
              class="motion-press rounded-md border-2 border-dc-ink px-4 py-3 font-mono text-xs font-semibold uppercase tracking-wide text-white shadow-[3px_3px_0_#111111] disabled:cursor-not-allowed disabled:opacity-60"
              :class="danger ? 'bg-red-600' : 'bg-dc-pink'"
              :disabled="busy"
              @click="emit('confirm')"
            >
              {{ busy ? busyLabel : confirmLabel }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-dialog-panel--mobile-sheet {
  max-width: none;
  border-right: 0;
  border-bottom: 0;
  border-left: 0;
  border-radius: 12px 12px 0 0;
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
  box-shadow: 0 -8px 30px rgb(17 17 17 / 18%);
}

.confirm-dialog-handle {
  width: 2.75rem;
  height: .25rem;
  margin: -.25rem auto 1rem;
  border-radius: 999px;
  background: #c9c5bc;
}

.confirm-dialog-enter-active,
.confirm-dialog-leave-active {
  transition: opacity 180ms cubic-bezier(.4, 0, .2, 1);
}

.confirm-dialog-enter-active .confirm-dialog-panel,
.confirm-dialog-leave-active .confirm-dialog-panel {
  transition: transform 250ms cubic-bezier(.16, 1, .3, 1), opacity 180ms cubic-bezier(.4, 0, .2, 1);
}

.confirm-dialog-enter-from,
.confirm-dialog-leave-to {
  opacity: 0;
}

.confirm-dialog-enter-from .confirm-dialog-panel,
.confirm-dialog-leave-to .confirm-dialog-panel {
  opacity: 0;
  transform: translateY(.75rem) scale(.98);
}

.confirm-dialog-enter-from .confirm-dialog-panel--mobile-sheet,
.confirm-dialog-leave-to .confirm-dialog-panel--mobile-sheet {
  opacity: 1;
  transform: translateY(100%);
}

@media (min-width: 640px) {
  .confirm-dialog-panel--mobile-sheet {
    max-width: 28rem;
    border: 2px solid #111;
    border-radius: 8px;
    padding-bottom: 1.25rem;
    box-shadow: 6px 6px 0 #111;
  }

  .confirm-dialog-enter-from .confirm-dialog-panel--mobile-sheet,
  .confirm-dialog-leave-to .confirm-dialog-panel--mobile-sheet {
    opacity: 0;
    transform: translateY(.75rem) scale(.98);
  }
}

@media (prefers-reduced-motion: reduce) {
  .confirm-dialog-enter-active,
  .confirm-dialog-leave-active,
  .confirm-dialog-enter-active .confirm-dialog-panel,
  .confirm-dialog-leave-active .confirm-dialog-panel {
    transition-duration: 0.01ms;
  }

  .confirm-dialog-enter-from .confirm-dialog-panel,
  .confirm-dialog-leave-to .confirm-dialog-panel {
    transform: none;
  }
}
</style>
