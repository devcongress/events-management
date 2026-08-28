<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';

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
  error?: string | null;
}>();
const emit = defineEmits<{ close: []; send: [] }>();
const activeSubmissionId = ref('');
const panel = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
let previouslyFocused: HTMLElement | null = null;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';
let appWasInert = false;

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

function lockPage() {
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousBodyOverflow = document.body.style.overflow;
  previousDocumentOverflow = document.documentElement.style.overflow;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';

  const app = document.querySelector<HTMLElement>('#app');
  appWasInert = app?.hasAttribute('inert') ?? false;
  if (!appWasInert) app?.setAttribute('inert', '');
  document.addEventListener('keydown', onKeydown);
}

function unlockPage() {
  document.body.style.overflow = previousBodyOverflow;
  document.documentElement.style.overflow = previousDocumentOverflow;
  const app = document.querySelector<HTMLElement>('#app');
  if (!appWasInert) app?.removeAttribute('inert');
  document.removeEventListener('keydown', onKeydown);
  previouslyFocused?.focus();
  previouslyFocused = null;
}

function requestClose() {
  if (!props.busy) emit('close');
}

function onKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    requestClose();
    return;
  }
  if (event.key !== 'Tab' || !panel.value) return;

  const focusable = [...panel.value.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];
  if (!focusable.length) {
    event.preventDefault();
    panel.value.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1)!;
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const activeIndex = activeElement ? focusable.indexOf(activeElement) : -1;
  if (!activeElement || !panel.value.contains(activeElement) || activeIndex === -1) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(() => props.previews, (previews) => {
  if (!previews.some((preview) => preview.submission_id === activeSubmissionId.value)) {
    activeSubmissionId.value = previews[0]?.submission_id ?? '';
  }
}, { deep: true, immediate: true });

watch(() => props.open, async (open, wasOpen) => {
  if (open && !wasOpen) {
    lockPage();
    await nextTick();
    closeButton.value?.focus();
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
    <Transition name="speaker-email-preview">
      <div v-if="open" class="speaker-email-preview-backdrop" role="presentation" @click.self="requestClose">
        <aside
          ref="panel"
          class="speaker-email-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="speaker-email-preview-title"
          aria-describedby="speaker-email-preview-description"
          tabindex="-1"
        >
          <header class="speaker-email-preview-header">
            <div>
              <p class="editorial-eyebrow">selected speaker email</p>
              <h2 id="speaker-email-preview-title">Review and send</h2>
              <p id="speaker-email-preview-description" class="speaker-email-preview-description">Check the generated message. The branded email is only sent after you confirm.</p>
            </div>
            <button ref="closeButton" type="button" class="speaker-email-preview-close" :disabled="busy" aria-label="Close email review" @click="requestClose">×</button>
          </header>

          <div v-if="activePreview" class="speaker-email-preview-body">
            <nav v-if="previews.length > 1" class="speaker-email-preview-recipients" aria-label="Selected speakers">
              <p>Recipients</p>
              <div>
                <button
                  v-for="preview in previews"
                  :key="preview.submission_id"
                  type="button"
                  :class="{ 'is-active': activePreview.submission_id === preview.submission_id }"
                  :aria-pressed="activePreview.submission_id === preview.submission_id"
                  @click="activeSubmissionId = preview.submission_id"
                >
                  <span>{{ preview.speaker_name }}</span>
                  <small>{{ preview.talk_title }}</small>
                </button>
              </div>
            </nav>

            <section class="speaker-email-preview-message" aria-label="Generated email message">
              <dl class="speaker-email-preview-envelope">
                <div><dt>From</dt><dd>{{ activePreview.from }}</dd></div>
                <div><dt>To</dt><dd>{{ activePreview.to }}</dd></div>
                <div><dt>Subject</dt><dd>{{ activePreview.subject }}</dd></div>
              </dl>
              <div class="speaker-email-preview-copy">
                <p>Message</p>
                <pre>{{ activePreview.text }}</pre>
              </div>
            </section>
          </div>

          <div v-else class="speaker-email-preview-empty">
            <p>No generated message is ready.</p>
          </div>

          <p v-if="error" class="speaker-email-preview-error" role="alert">{{ error }}</p>

          <footer class="speaker-email-preview-actions">
            <p>{{ previews.length }} selected speaker{{ previews.length === 1 ? '' : 's' }} ready</p>
            <div>
              <button type="button" class="speaker-email-preview-secondary" :disabled="busy" @click="requestClose">Cancel</button>
              <button type="button" class="speaker-email-preview-send" :disabled="busy || previews.length === 0" @click="emit('send')">{{ sendLabel }}</button>
            </div>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.speaker-email-preview-backdrop { position: fixed; inset: 0; z-index: 140; display: flex; justify-content: flex-end; background: rgb(17 17 17 / 0.48); }
.speaker-email-preview-dialog { display: flex; width: min(100%, 46rem); height: 100dvh; flex-direction: column; overflow: hidden; border-left: 2px solid #111111; background: #ffffff; box-shadow: -10px 0 0 rgb(17 17 17 / 0.14); }
.speaker-email-preview-header { display: flex; flex-shrink: 0; align-items: flex-start; justify-content: space-between; gap: 1.5rem; border-bottom: 2px solid #111111; background: #f5e642; padding: max(1.25rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right)) 1.25rem max(1.5rem, env(safe-area-inset-left)); }
.speaker-email-preview-header h2 { margin-top: .25rem; color: #111111; font-size: 1.5rem; font-weight: 800; letter-spacing: -.02em; }
.speaker-email-preview-description { margin-top: .35rem; max-width: 34rem; color: #555555; font-size: .875rem; line-height: 1.5; }
.speaker-email-preview-close,
.speaker-email-preview-secondary,
.speaker-email-preview-send { min-height: 2.75rem; border: 2px solid #111111; border-radius: 6px; padding: .5rem .875rem; font-family: var(--font-mono), monospace; font-size: .6875rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; transition: transform 100ms cubic-bezier(.4, 0, .2, 1), background-color 150ms cubic-bezier(.4, 0, .2, 1), opacity 150ms cubic-bezier(.4, 0, .2, 1); }
.speaker-email-preview-close { display: grid; min-width: 2.75rem; place-items: center; background: #ffffff; color: #111111; font-size: 1.1rem; }
.speaker-email-preview-body { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; background: #f5f2e8; padding-inline: env(safe-area-inset-left) env(safe-area-inset-right); }
.speaker-email-preview-recipients { border-bottom: 1px solid #d6d2c8; background: #fffdf7; padding: 1rem 1.25rem; }
.speaker-email-preview-recipients > p,
.speaker-email-preview-copy > p { color: #77736a; font-family: var(--font-mono), monospace; font-size: .625rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.speaker-email-preview-recipients > div { display: flex; gap: .5rem; margin-top: .65rem; overflow-x: auto; padding: 0 2px 3px; }
.speaker-email-preview-recipients button { min-width: 11rem; max-width: 15rem; border: 1px solid #d6d2c8; border-radius: 8px; background: #ffffff; padding: .75rem; text-align: left; transition: transform 100ms cubic-bezier(.4, 0, .2, 1), background-color 150ms cubic-bezier(.4, 0, .2, 1), border-color 150ms cubic-bezier(.4, 0, .2, 1); }
.speaker-email-preview-recipients button.is-active { border-color: #111111; background: #f5e642; box-shadow: 2px 2px 0 #111111; }
.speaker-email-preview-recipients span { display: block; color: #111111; font-size: .8125rem; font-weight: 800; }
.speaker-email-preview-recipients small { display: block; margin-top: .25rem; overflow: hidden; color: #666666; font-size: .7rem; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.speaker-email-preview-message { min-width: 0; }
.speaker-email-preview-envelope { border-bottom: 1px solid #d6d2c8; background: #ffffff; padding: 1rem 1.25rem; }
.speaker-email-preview-envelope div { display: grid; grid-template-columns: 4rem minmax(0, 1fr); gap: .5rem; font-size: .8125rem; line-height: 1.5; }
.speaker-email-preview-envelope div + div { margin-top: .35rem; }
.speaker-email-preview-envelope dt { color: #77736a; font-family: var(--font-mono), monospace; font-size: .625rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.speaker-email-preview-envelope dd { min-width: 0; overflow-wrap: anywhere; color: #111111; }
.speaker-email-preview-copy { margin: 1.25rem; border: 1px solid #d6d2c8; border-radius: 8px; background: #ffffff; padding: 1.25rem; }
.speaker-email-preview-copy pre { margin: .9rem 0 0; overflow: visible; white-space: pre-wrap; overflow-wrap: anywhere; color: #333333; font-family: inherit; font-size: .9375rem; line-height: 1.7; }
.speaker-email-preview-empty { display: grid; min-height: 14rem; flex: 1; place-items: center; color: #666666; }
.speaker-email-preview-error { flex-shrink: 0; border-top: 1px solid #f0b3b3; background: #fff1f1; padding: .75rem max(1.5rem, env(safe-area-inset-right)) .75rem max(1.5rem, env(safe-area-inset-left)); color: #9f1919; font-size: .8125rem; font-weight: 700; line-height: 1.45; }
.speaker-email-preview-actions { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; gap: 1rem; border-top: 2px solid #111111; background: #ffffff; padding: 1rem max(1.5rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left)); }
.speaker-email-preview-actions p { color: #666666; font-family: var(--font-mono), monospace; font-size: .6875rem; font-weight: 700; text-transform: uppercase; }
.speaker-email-preview-actions > div { display: flex; gap: .75rem; }
.speaker-email-preview-secondary { background: #ffffff; color: #111111; }
.speaker-email-preview-send { background: #c80d68; color: #ffffff; box-shadow: 3px 3px 0 #111111; }
.speaker-email-preview-close:active,
.speaker-email-preview-secondary:active,
.speaker-email-preview-send:active,
.speaker-email-preview-recipients button:active { transform: scale(.97); }
.speaker-email-preview-close:disabled,
.speaker-email-preview-secondary:disabled,
.speaker-email-preview-send:disabled { cursor: not-allowed; opacity: .55; }
.speaker-email-preview-enter-active,
.speaker-email-preview-leave-active { transition: opacity 180ms cubic-bezier(.4, 0, .2, 1); }
.speaker-email-preview-enter-active .speaker-email-preview-dialog,
.speaker-email-preview-leave-active .speaker-email-preview-dialog { transition: transform 260ms cubic-bezier(.16, 1, .3, 1); will-change: transform; }
.speaker-email-preview-enter-from,
.speaker-email-preview-leave-to { opacity: 0; }
.speaker-email-preview-enter-from .speaker-email-preview-dialog,
.speaker-email-preview-leave-to .speaker-email-preview-dialog { transform: translate3d(100%, 0, 0); }
@media (hover: hover) and (pointer: fine) {
  .speaker-email-preview-close:hover,
  .speaker-email-preview-secondary:hover { background: #f5f2e8; }
  .speaker-email-preview-recipients button:hover:not(.is-active) { border-color: #111111; }
}
@media (max-width: 699px) {
  .speaker-email-preview-dialog { width: 100%; border-left: 0; box-shadow: none; }
  .speaker-email-preview-header { padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) 1rem max(1rem, env(safe-area-inset-left)); }
  .speaker-email-preview-description { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
  .speaker-email-preview-recipients,
  .speaker-email-preview-envelope { padding-inline: 1rem; }
  .speaker-email-preview-copy { margin: 1rem; padding: 1rem; }
  .speaker-email-preview-error { padding-inline: max(1rem, env(safe-area-inset-left)) max(1rem, env(safe-area-inset-right)); }
  .speaker-email-preview-actions { padding-inline: max(1rem, env(safe-area-inset-left)) max(1rem, env(safe-area-inset-right)); }
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
