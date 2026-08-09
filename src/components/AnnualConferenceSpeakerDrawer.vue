<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import type { SpeakerSubmission, SpeakerSubmissionStatus } from '@/types';

const props = defineProps<{
  open: boolean;
  submission: SpeakerSubmission | null;
  canManage: boolean;
  submitting?: boolean;
  canCopyPresenterLink?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  approve: [submission: SpeakerSubmission];
  reject: [submission: SpeakerSubmission];
  copyPresenterLink: [];
}>();

const panelRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
let previouslyFocused: HTMLElement | null = null;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';
let appWasInert = false;

const statusLabel = computed(() => {
  if (!props.submission) return '';
  return props.submission.status === 'not_selected' ? 'Not selected' : props.submission.status;
});
const kindLabel = computed(() => props.submission?.kind === 'product_demo' ? 'Product demo' : 'Talk proposal');
const drawerTitle = computed(() => props.submission?.title ?? 'Speaker proposal');

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function statusClass(status: SpeakerSubmissionStatus): string {
  if (status === 'selected') return 'border-[#15803d] bg-[#effcf3] text-[#15803d]';
  if (status === 'not_selected') return 'border-dc-border bg-dc-paper-warm text-dc-gray';
  return 'border-dc-pink bg-[#fff1f7] text-dc-pink';
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

function requestClose() {
  if (!props.submitting) emit('close');
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    requestClose();
    return;
  }
  if (event.key !== 'Tab' || !panelRef.value) return;

  const focusable = [...panelRef.value.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];
  if (!focusable.length) {
    event.preventDefault();
    panelRef.value.focus();
    return;
  }
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
    <Transition name="annual-speaker-drawer">
      <div v-if="open && submission" class="fixed inset-0 z-[130] flex justify-end bg-black/30" role="presentation" @click.self="requestClose">
        <section ref="panelRef" class="flex h-full w-full max-w-[var(--organizer-detail-drawer-width)] flex-col border-l-2 border-dc-ink bg-dc-paper shadow-[-10px_0_0_rgba(17,17,17,0.14)]" role="dialog" aria-modal="true" aria-labelledby="annual-conference-speaker-drawer-title" tabindex="-1">
          <header class="flex shrink-0 items-start justify-between gap-4 border-b-2 border-dc-ink bg-dc-yellow px-5 py-4 sm:px-6">
            <div class="min-w-0">
              <p class="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dc-ink">{{ kindLabel }}</p>
              <h2 id="annual-conference-speaker-drawer-title" class="mt-1 text-2xl font-bold leading-tight tracking-tight text-dc-ink">{{ drawerTitle }}</h2>
            </div>
            <button ref="closeButtonRef" type="button" class="motion-press grid min-h-10 min-w-10 place-items-center rounded-md border-2 border-dc-ink bg-dc-paper font-mono text-lg font-semibold text-dc-ink shadow-[2px_2px_0_#111111]" :disabled="submitting" aria-label="Close speaker proposal" @click="requestClose">×</button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="rounded-md border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]" :class="statusClass(submission.status)">{{ statusLabel }}</span>
              <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-gray">Submitted {{ formatDate(submission.created_at) }}</span>
            </div>

            <section class="mt-6 border-t-2 border-dc-ink pt-5">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Abstract</p>
              <p class="mt-2 whitespace-pre-line text-base font-medium leading-7" :class="submission.abstract ? 'text-dc-ink' : 'text-dc-gray'">{{ submission.abstract ?? 'No abstract was provided.' }}</p>
            </section>

            <dl class="mt-6 grid gap-5 border-y border-dc-border py-5 sm:grid-cols-2">
              <div>
                <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Speaker</dt>
                <dd class="mt-1 text-sm font-semibold text-dc-ink">{{ submission.speaker_name }}</dd>
                <dd class="mt-1 text-sm text-dc-gray"><a class="underline decoration-dc-border underline-offset-4 hover:text-dc-pink" :href="`mailto:${submission.speaker_email}`">{{ submission.speaker_email }}</a></dd>
              </div>
              <div>
                <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Topic</dt>
                <dd class="mt-1 text-sm font-semibold text-dc-ink">{{ submission.topic }}</dd>
                <dd v-if="submission.github_username" class="mt-1 text-sm text-dc-gray">@{{ submission.github_username }}</dd>
              </div>
            </dl>

            <section v-if="submission.bio" class="mt-6 rounded-md border border-dc-border bg-dc-paper-warm p-4">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Speaker bio</p>
              <p class="mt-2 whitespace-pre-line text-sm leading-6 text-dc-gray">{{ submission.bio }}</p>
            </section>

            <section v-if="submission.status === 'selected'" class="mt-6 rounded-md border border-[#15803d] bg-[#effcf3] p-4">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#15803d]">Selected</p>
              <p class="mt-2 text-sm leading-6 text-dc-ink">The presenter can complete their remaining details through the secure follow-up link.</p>
            </section>
          </div>

          <footer class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t-2 border-dc-ink bg-dc-paper px-5 py-4 sm:px-6">
            <template v-if="submission.status === 'submitted' && canManage">
              <button type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-dc-ink" :disabled="submitting" @click="emit('reject', submission)">Reject</button>
              <button type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-dc-ink shadow-[2px_2px_0_#111111]" :disabled="submitting" @click="emit('approve', submission)">{{ submitting ? 'Saving…' : 'Approve' }}</button>
            </template>
            <button v-else-if="canCopyPresenterLink" type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-paper-warm px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-dc-ink" @click="emit('copyPresenterLink')">Copy follow-up link</button>
            <p v-else-if="submission.status === 'submitted'" class="mr-auto text-xs font-semibold leading-5 text-dc-gray">Only organizers with speaker-review access can make a decision.</p>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.annual-speaker-drawer-enter-active,
.annual-speaker-drawer-leave-active {
  transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.annual-speaker-drawer-enter-active section,
.annual-speaker-drawer-leave-active section {
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

.annual-speaker-drawer-enter-from,
.annual-speaker-drawer-leave-to {
  opacity: 0;
}

.annual-speaker-drawer-enter-from section,
.annual-speaker-drawer-leave-to section {
  transform: translate3d(100%, 0, 0);
}

@media (prefers-reduced-motion: reduce) {
  .annual-speaker-drawer-enter-active,
  .annual-speaker-drawer-leave-active,
  .annual-speaker-drawer-enter-active section,
  .annual-speaker-drawer-leave-active section {
    transition-duration: 0.01ms;
  }

  .annual-speaker-drawer-enter-from section,
  .annual-speaker-drawer-leave-to section {
    transform: none;
  }
}
</style>
