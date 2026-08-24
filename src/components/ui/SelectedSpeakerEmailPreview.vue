<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

export type SelectedSpeakerEmailPreviewItem = {
  submission_id: string;
  link_id: string;
  speaker_name: string;
  speaker_email: string;
  talk_title: string;
  short_url: string;
  expires_at: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

const props = defineProps<{
  open: boolean;
  previews: SelectedSpeakerEmailPreviewItem[];
  busy?: boolean;
}>();
const emit = defineEmits<{ close: []; send: [] }>();
const activeSubmissionId = ref('');
const closeButton = ref<HTMLButtonElement | null>(null);
const activePreview = computed(() => (
  props.previews.find((preview) => preview.submission_id === activeSubmissionId.value)
  ?? props.previews[0]
  ?? null
));
const sendLabel = computed(() => {
  if (props.busy) return 'Sending…';
  const count = props.previews.length;
  return `Send ${count} email${count === 1 ? '' : 's'}`;
});

watch(() => [props.open, props.previews] as const, ([open, previews]) => {
  if (!open) return;
  if (!previews.some((preview) => preview.submission_id === activeSubmissionId.value)) {
    activeSubmissionId.value = previews[0]?.submission_id ?? '';
  }
  void nextTick(() => closeButton.value?.focus());
}, { deep: true });

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open && !props.busy) emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="speaker-email-preview">
      <div v-if="open" class="speaker-email-preview-backdrop" @click.self="!busy && emit('close')">
        <section class="speaker-email-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="speaker-email-preview-title">
          <header class="speaker-email-preview-header">
            <div>
              <p class="editorial-eyebrow">selected speaker email</p>
              <h2 id="speaker-email-preview-title">Review before sending</h2>
              <p>These emails are system-generated. Nothing is sent until you confirm below.</p>
            </div>
            <button ref="closeButton" type="button" class="speaker-email-preview-close" :disabled="busy" @click="emit('close')">Close</button>
          </header>

          <div v-if="activePreview" class="speaker-email-preview-body">
            <aside class="speaker-email-preview-recipients" aria-label="Selected speakers">
              <button
                v-for="preview in previews"
                :key="preview.submission_id"
                type="button"
                :class="{ 'is-active': activePreview.submission_id === preview.submission_id }"
                @click="activeSubmissionId = preview.submission_id"
              >
                <span>{{ preview.speaker_name }}</span>
                <small>{{ preview.talk_title }}</small>
              </button>
            </aside>

            <div class="speaker-email-preview-message">
              <dl class="speaker-email-preview-envelope">
                <div><dt>From</dt><dd>{{ activePreview.from }}</dd></div>
                <div><dt>To</dt><dd>{{ activePreview.to }}</dd></div>
                <div><dt>Subject</dt><dd>{{ activePreview.subject }}</dd></div>
              </dl>
              <iframe
                class="speaker-email-preview-frame"
                title="Rendered selected-speaker email"
                :srcdoc="activePreview.html"
                sandbox=""
              />
            </div>
          </div>

          <footer class="speaker-email-preview-actions">
            <p>{{ previews.length }} selected speaker{{ previews.length === 1 ? '' : 's' }} ready</p>
            <div>
              <button type="button" class="speaker-email-preview-secondary" :disabled="busy" @click="emit('close')">Cancel</button>
              <button type="button" class="speaker-email-preview-send" :disabled="busy || previews.length === 0" @click="emit('send')">{{ sendLabel }}</button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.speaker-email-preview-backdrop { position: fixed; inset: 0; z-index: 140; display: grid; place-items: center; overflow-y: auto; padding: 1.25rem; background: rgb(17 17 17 / 0.52); }
.speaker-email-preview-dialog { width: min(100%, 68rem); max-height: calc(100vh - 2.5rem); overflow: hidden; border: 2px solid #111111; border-radius: 12px; background: #ffffff; box-shadow: 8px 8px 0 #111111; }
.speaker-email-preview-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5rem; border-bottom: 1px solid #d6d2c8; padding: 1.25rem 1.5rem; }
.speaker-email-preview-header h2 { margin-top: .25rem; color: #111111; font-size: 1.5rem; font-weight: 800; letter-spacing: -.02em; }
.speaker-email-preview-header p:last-child { margin-top: .35rem; color: #666666; font-size: .875rem; }
.speaker-email-preview-close,
.speaker-email-preview-secondary,
.speaker-email-preview-send { min-height: 2.75rem; border: 2px solid #111111; border-radius: 6px; padding: .5rem .875rem; font-family: var(--font-mono), monospace; font-size: .6875rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; transition: transform 100ms cubic-bezier(.4, 0, .2, 1), background-color 150ms cubic-bezier(.4, 0, .2, 1), opacity 150ms cubic-bezier(.4, 0, .2, 1); }
.speaker-email-preview-close { border-color: #d6d2c8; color: #555555; }
.speaker-email-preview-body { display: grid; grid-template-columns: minmax(12rem, 17rem) minmax(0, 1fr); min-height: 0; max-height: min(68vh, 46rem); }
.speaker-email-preview-recipients { overflow-y: auto; border-right: 1px solid #d6d2c8; background: #fbf8ef; padding: .75rem; }
.speaker-email-preview-recipients button { width: 100%; border: 1px solid transparent; border-radius: 8px; padding: .8rem; text-align: left; transition: transform 100ms cubic-bezier(.4, 0, .2, 1), background-color 150ms cubic-bezier(.4, 0, .2, 1), border-color 150ms cubic-bezier(.4, 0, .2, 1); }
.speaker-email-preview-recipients button + button { margin-top: .35rem; }
.speaker-email-preview-recipients button.is-active { border-color: #111111; background: #f5e642; box-shadow: 2px 2px 0 #111111; }
.speaker-email-preview-recipients span { display: block; color: #111111; font-size: .875rem; font-weight: 800; }
.speaker-email-preview-recipients small { display: block; margin-top: .25rem; overflow: hidden; color: #666666; font-size: .75rem; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.speaker-email-preview-message { min-width: 0; overflow-y: auto; background: #f5f2e8; }
.speaker-email-preview-envelope { border-bottom: 1px solid #d6d2c8; background: #ffffff; padding: .85rem 1rem; }
.speaker-email-preview-envelope div { display: grid; grid-template-columns: 4rem minmax(0, 1fr); gap: .5rem; font-size: .75rem; line-height: 1.5; }
.speaker-email-preview-envelope div + div { margin-top: .25rem; }
.speaker-email-preview-envelope dt { color: #77736a; font-family: var(--font-mono), monospace; font-size: .625rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.speaker-email-preview-envelope dd { min-width: 0; overflow-wrap: anywhere; color: #111111; }
.speaker-email-preview-frame { display: block; width: 100%; min-height: 38rem; border: 0; background: #f5f2e8; }
.speaker-email-preview-actions { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border-top: 1px solid #d6d2c8; padding: 1rem 1.5rem; }
.speaker-email-preview-actions p { color: #666666; font-family: var(--font-mono), monospace; font-size: .6875rem; font-weight: 700; text-transform: uppercase; }
.speaker-email-preview-actions > div { display: flex; gap: .75rem; }
.speaker-email-preview-secondary { background: #ffffff; color: #111111; }
.speaker-email-preview-send { background: #e8117f; color: #ffffff; box-shadow: 3px 3px 0 #111111; }
.speaker-email-preview-close:active,
.speaker-email-preview-secondary:active,
.speaker-email-preview-send:active,
.speaker-email-preview-recipients button:active { transform: scale(.97); }
.speaker-email-preview-close:disabled,
.speaker-email-preview-secondary:disabled,
.speaker-email-preview-send:disabled { cursor: not-allowed; opacity: .55; }
.speaker-email-preview-enter-active,
.speaker-email-preview-leave-active { transition: opacity 180ms cubic-bezier(.16, 1, .3, 1); }
.speaker-email-preview-enter-active .speaker-email-preview-dialog,
.speaker-email-preview-leave-active .speaker-email-preview-dialog { transition: opacity 180ms cubic-bezier(.16, 1, .3, 1), transform 220ms cubic-bezier(.16, 1, .3, 1); }
.speaker-email-preview-enter-from,
.speaker-email-preview-leave-to { opacity: 0; }
.speaker-email-preview-enter-from .speaker-email-preview-dialog,
.speaker-email-preview-leave-to .speaker-email-preview-dialog { opacity: 0; transform: translate3d(0, .75rem, 0) scale(.98); }
@media (hover: hover) and (pointer: fine) {
  .speaker-email-preview-close:hover,
  .speaker-email-preview-secondary:hover { background: #f5f2e8; }
  .speaker-email-preview-recipients button:hover:not(.is-active) { border-color: #d6d2c8; background: #ffffff; }
}
@media (max-width: 699px) {
  .speaker-email-preview-backdrop { padding: .5rem; }
  .speaker-email-preview-dialog { max-height: calc(100vh - 1rem); box-shadow: 4px 4px 0 #111111; }
  .speaker-email-preview-header { padding: 1rem; }
  .speaker-email-preview-header p:last-child { display: none; }
  .speaker-email-preview-body { grid-template-columns: 1fr; max-height: calc(100vh - 12rem); }
  .speaker-email-preview-recipients { display: flex; gap: .5rem; overflow-x: auto; border-right: 0; border-bottom: 1px solid #d6d2c8; }
  .speaker-email-preview-recipients button { min-width: 11rem; }
  .speaker-email-preview-recipients button + button { margin-top: 0; }
  .speaker-email-preview-frame { min-height: 32rem; }
  .speaker-email-preview-actions { padding: .8rem 1rem; }
  .speaker-email-preview-actions p { display: none; }
  .speaker-email-preview-actions > div { width: 100%; }
  .speaker-email-preview-secondary,
  .speaker-email-preview-send { flex: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .speaker-email-preview-close,
  .speaker-email-preview-secondary,
  .speaker-email-preview-send,
  .speaker-email-preview-recipients button,
  .speaker-email-preview-enter-active,
  .speaker-email-preview-leave-active,
  .speaker-email-preview-enter-active .speaker-email-preview-dialog,
  .speaker-email-preview-leave-active .speaker-email-preview-dialog { transition: none; }
  .speaker-email-preview-close:active,
  .speaker-email-preview-secondary:active,
  .speaker-email-preview-send:active,
  .speaker-email-preview-recipients button:active,
  .speaker-email-preview-enter-from .speaker-email-preview-dialog,
  .speaker-email-preview-leave-to .speaker-email-preview-dialog { transform: none; }
}
</style>
