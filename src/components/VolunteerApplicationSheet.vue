<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import type { VolunteerApplication } from '@/types';

const props = defineProps<{
  open: boolean;
  application: VolunteerApplication | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const panelRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
let previouslyFocused: HTMLElement | null = null;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';
let appWasInert = false;

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en-GH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || '—';
}

function xProfileUrl(handle: string): string | null {
  const username = handle.trim().replace(/^@+/, '');
  return username ? `https://x.com/${encodeURIComponent(username)}` : null;
}

function close() {
  emit('close');
}

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

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab' || !panelRef.value) return;

  const focusable = [...panelRef.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) {
    event.preventDefault();
    panelRef.value.focus();
    return;
  }

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

watch(
  () => props.open,
  async (open, wasOpen) => {
    if (open && !wasOpen) {
      lockPage();
      await nextTick();
      closeButtonRef.value?.focus();
    } else if (!open && wasOpen) {
      unlockPage();
    }
  },
);

onUnmounted(() => {
  if (props.open) unlockPage();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="volunteer-application-sheet">
      <div v-if="open && application" class="application-sheet-backdrop" role="presentation" @click.self="close">
        <section
          ref="panelRef"
          class="application-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="volunteer-application-title"
          tabindex="-1"
        >
          <div class="application-sheet__handle" aria-hidden="true" />
          <header>
            <span class="application-sheet__avatar" aria-hidden="true">{{ initials(application.name) }}</span>
            <div>
              <span>Volunteer application</span>
              <h2 id="volunteer-application-title">{{ application.name }}</h2>
            </div>
            <button ref="closeButtonRef" type="button" aria-label="Close volunteer application" @click="close">×</button>
          </header>

          <dl>
            <div>
              <dt>Email</dt>
              <dd>{{ application.email }}</dd>
            </div>
            <div>
              <dt>X</dt>
              <dd><a v-if="xProfileUrl(application.x_handle)" :href="xProfileUrl(application.x_handle) ?? undefined" target="_blank" rel="noreferrer">{{ application.x_handle }}</a><span v-else>Not provided</span></dd>
            </div>
            <div>
              <dt>Slack</dt>
              <dd>{{ application.slack_name || 'Not provided' }}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd><time :datetime="application.created_at">{{ formatTimestamp(application.created_at) }}</time></dd>
            </div>
          </dl>

        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.application-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 180;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(17, 17, 17, .38);
}

.application-sheet {
  width: min(100%, 42rem);
  max-height: min(76svh, 42rem);
  overflow-y: auto;
  border: 1px solid #111;
  border-bottom: 0;
  border-radius: 12px 12px 0 0;
  background: #fff;
  padding: .55rem 1rem max(1rem, env(safe-area-inset-bottom));
  color: #111;
  box-shadow: 0 -12px 36px rgba(17, 17, 17, .16);
}

.application-sheet__handle { width: 2.25rem; height: .22rem; margin: 0 auto .65rem; border-radius: 999px; background: #c9c5bb; }
.application-sheet header { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) 2.75rem; align-items: center; gap: .75rem; padding: .35rem 0 1rem; }
.application-sheet header > div { min-width: 0; }
.application-sheet header span:not(.application-sheet__avatar), .application-sheet dt { color: #716d66; font-family: var(--font-mono), monospace; font-size: .56rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.application-sheet h2 { overflow: hidden; margin: .18rem 0 0; font-size: 1.15rem; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.application-sheet__avatar { display: grid; width: 2.5rem; height: 2.5rem; place-items: center; border: 1px solid #c9c5bb; border-radius: 50%; background: #fefce8; font-family: var(--font-mono), monospace; font-size: .64rem; font-weight: 700; }
.application-sheet header button { display: grid; width: 2.75rem; height: 2.75rem; place-items: center; border: 0; border-radius: 8px; background: #f3f1eb; color: #111; font-size: 1.25rem; font-weight: 700; transition: transform 100ms cubic-bezier(.4, 0, .2, 1), background-color 150ms cubic-bezier(.4, 0, .2, 1); }
.application-sheet dl { margin: 0; border-top: 1px solid #dedad1; }
.application-sheet dl > div { padding: .8rem 0; }
.application-sheet dl > div + div { border-top: 1px solid #e5e1d8; }
.application-sheet dd { margin: .3rem 0 0; overflow-wrap: anywhere; font-size: .88rem; font-weight: 600; }
.application-sheet a { color: #b20d61; text-decoration: underline; text-underline-offset: 3px; }
.application-sheet header button:active { transform: scale(.97); }
.application-sheet header button:focus-visible { outline: 2px solid #e8117f; outline-offset: 2px; }

.volunteer-application-sheet-enter-active { transition: opacity 170ms cubic-bezier(.4, 0, .2, 1); }
.volunteer-application-sheet-leave-active { transition: opacity 140ms cubic-bezier(.4, 0, .2, 1); }
.volunteer-application-sheet-enter-active .application-sheet { transition: transform 240ms cubic-bezier(.16, 1, .3, 1); }
.volunteer-application-sheet-leave-active .application-sheet { transition: transform 170ms cubic-bezier(.4, 0, .2, 1); }
.volunteer-application-sheet-enter-from, .volunteer-application-sheet-leave-to { opacity: 0; }
.volunteer-application-sheet-enter-from .application-sheet, .volunteer-application-sheet-leave-to .application-sheet { transform: translate3d(0, 100%, 0); }

@media (hover: hover) and (pointer: fine) {
  .application-sheet header button:hover { background: #e8e5dd; }
}

@media (prefers-reduced-motion: reduce) {
  .volunteer-application-sheet-enter-active,
  .volunteer-application-sheet-leave-active,
  .volunteer-application-sheet-enter-active .application-sheet,
  .volunteer-application-sheet-leave-active .application-sheet,
  .application-sheet header button { transition-duration: 1ms !important; }
}
</style>
