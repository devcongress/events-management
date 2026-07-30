<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { eventBlastEmail } from '@/lib/email/templates/event-blast';

const props = defineProps<{
  open: boolean;
  subject: string;
  body: string;
  actionLabel: string;
  busy?: boolean;
}>();

const emit = defineEmits<{ close: []; confirm: [] }>();
const emailMarkup = computed(() => eventBlastEmail({
  subject: props.subject,
  body: props.body,
  unsubscribeUrl: '#',
}).html);

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="blast-preview">
      <div
        v-if="open"
        class="blast-preview-backdrop"
        role="presentation"
        @click.self="emit('close')"
      >
        <section
          class="blast-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="blast-preview-title"
        >
          <header class="blast-preview-header">
            <div>
              <p class="editorial-eyebrow">email preview</p>
              <h2 id="blast-preview-title">What guests will receive</h2>
            </div>
            <button type="button" class="blast-preview-close" aria-label="Close email preview" @click="emit('close')">Close</button>
          </header>
          <div class="blast-preview-canvas" aria-label="Rendered email preview" v-html="emailMarkup" />
          <footer class="blast-preview-actions">
            <button type="button" class="blast-preview-edit" :disabled="busy" @click="emit('close')">Keep editing</button>
            <button type="button" class="blast-preview-send" :disabled="busy" @click="emit('confirm')">
              {{ busy ? 'SENDING…' : actionLabel }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.blast-preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  place-items: center;
  overflow-y: auto;
  background: rgb(17 17 17 / 0.46);
  padding: 1.25rem;
}

.blast-preview-dialog {
  width: min(100%, 44rem);
  overflow: hidden;
  border: 2px solid #111111;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 8px 8px 0 #111111;
}

.blast-preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid #d6d2c8;
  padding: 1.25rem 1.5rem;
}

.blast-preview-header h2 {
  margin-top: 0.25rem;
  color: #111111;
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.blast-preview-close {
  min-height: 2.75rem;
  border: 1px solid #d6d2c8;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  color: #555555;
  font-family: var(--font-mono), monospace;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: transform 100ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.blast-preview-close:active { transform: scale(0.97); }

.blast-preview-canvas {
  max-height: min(68vh, 46rem);
  overflow-y: auto;
  background: #f5f2e8;
}

.blast-preview-actions {
  display: flex;
  flex-wrap: wrap-reverse;
  justify-content: flex-end;
  gap: 0.75rem;
  border-top: 1px solid #d6d2c8;
  padding: 1rem 1.5rem;
}

.blast-preview-edit,
.blast-preview-send {
  min-height: 2.75rem;
  border: 2px solid #111111;
  border-radius: 6px;
  padding: 0.5rem 0.875rem;
  font-family: var(--font-mono), monospace;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: transform 100ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.blast-preview-edit { background: #ffffff; color: #111111; }
.blast-preview-send { background: #e8117f; color: #ffffff; box-shadow: 3px 3px 0 #111111; }
.blast-preview-edit:active,
.blast-preview-send:active { transform: scale(0.97); }
.blast-preview-edit:disabled,
.blast-preview-send:disabled { cursor: not-allowed; opacity: 0.6; }

.blast-preview-enter-active,
.blast-preview-leave-active { transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1); }
.blast-preview-enter-active .blast-preview-dialog,
.blast-preview-leave-active .blast-preview-dialog { transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1); }
.blast-preview-enter-from,
.blast-preview-leave-to { opacity: 0; }
.blast-preview-enter-from .blast-preview-dialog,
.blast-preview-leave-to .blast-preview-dialog { opacity: 0; transform: translate3d(0, 0.75rem, 0) scale(0.98); }

@media (hover: hover) and (pointer: fine) {
  .blast-preview-close:hover { background: #f5f2e8; }
}

@media (max-width: 639px) {
  .blast-preview-backdrop { padding: 0.75rem; }
  .blast-preview-header { padding: 1rem; }
  .blast-preview-actions { padding: 1rem; }
  .blast-preview-dialog { box-shadow: 4px 4px 0 #111111; }
}

@media (prefers-reduced-motion: reduce) {
  .blast-preview-close,
  .blast-preview-edit,
  .blast-preview-send,
  .blast-preview-enter-active,
  .blast-preview-leave-active,
  .blast-preview-enter-active .blast-preview-dialog,
  .blast-preview-leave-active .blast-preview-dialog { transition: none; }
  .blast-preview-close:active,
  .blast-preview-edit:active,
  .blast-preview-send:active,
  .blast-preview-enter-from .blast-preview-dialog,
  .blast-preview-leave-to .blast-preview-dialog { transform: none; }
}
</style>
