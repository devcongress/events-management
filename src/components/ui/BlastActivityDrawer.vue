<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import type { EventBlast } from '@/types';

const props = withDefaults(defineProps<{
  open: boolean;
  blast: EventBlast | null;
  retrying?: boolean;
}>(), {
  retrying: false,
});

const emit = defineEmits<{
  close: [];
  retry: [blast: EventBlast];
}>();

const panelRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
let previouslyFocused: HTMLElement | null = null;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';
let appWasInert = false;

const statusLabel = computed(() => {
  if (!props.blast) return '';
  if (props.blast.status === 'preparing') return 'Preparing safely';
  if (props.blast.status === 'scheduled') return 'Scheduled';
  if (props.blast.status === 'sent') return 'Sent';
  if (props.blast.status === 'needs_capacity') return 'Needs email capacity';
  return 'Needs attention';
});

const statusClass = computed(() => {
  if (props.blast?.status === 'sent') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (props.blast?.status === 'scheduled') return 'border-sky-300 bg-sky-50 text-sky-800';
  if (props.blast?.status === 'needs_capacity') return 'border-amber-300 bg-amber-50 text-amber-800';
  if (props.blast?.status === 'failed') return 'border-red-300 bg-red-50 text-red-700';
  return 'border-dc-border bg-dc-paper-warm text-dc-gray';
});

const deliveryTime = computed(() => props.blast?.sent_at ?? props.blast?.scheduled_for ?? null);
const progress = computed(() => props.blast ? `${props.blast.prepared_recipient_count}/${props.blast.recipient_count}` : '');
const issueDetails = computed(() => {
  if (!props.blast || props.blast.status === 'sent' || props.blast.status === 'scheduled') return null;
  if (props.blast.preparation_error) {
    return { title: 'Error details', message: props.blast.preparation_error, tone: 'error' as const };
  }
  if (props.blast.status === 'needs_capacity') {
    return {
      title: 'Why this was not sent',
      message: 'This update was saved without delivery because today’s available blast capacity was lower than its audience. Adjust today’s allocation or schedule it for a later time.',
      tone: 'warning' as const,
    };
  }
  if (props.blast.status === 'failed') {
    return {
      title: 'Error details',
      message: 'Delivery stopped before the provider returned a specific reason. The reviewed audience and message remain saved; check the provider activity log, then retry when ready.',
      tone: 'error' as const,
    };
  }
  return {
    title: 'Current activity',
    message: 'The audience is being prepared in safe batches. Delivery begins automatically when every confirmed guest is ready.',
    tone: 'neutral' as const,
  };
});

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Accra',
  }).format(new Date(value));
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
  if (!props.retrying) emit('close');
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
    <Transition name="blast-activity-drawer">
      <div v-if="open && blast" class="fixed inset-0 z-[130] flex justify-end bg-black/30" role="presentation" @click.self="requestClose">
        <section ref="panelRef" class="blast-activity-drawer flex h-full w-full max-w-[var(--organizer-detail-drawer-width)] flex-col border-l-2 border-dc-ink bg-dc-paper shadow-[-10px_0_0_rgba(17,17,17,0.14)]" role="dialog" aria-modal="true" aria-labelledby="blast-activity-drawer-title" tabindex="-1">
          <header class="flex shrink-0 items-start justify-between gap-4 border-b-2 border-dc-ink bg-dc-paper-warm px-5 py-4 sm:px-6">
            <div class="min-w-0">
              <p class="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dc-pink">Blast activity</p>
              <h2 id="blast-activity-drawer-title" class="mt-1 text-2xl font-bold leading-tight tracking-tight text-dc-ink">{{ blast.subject }}</h2>
            </div>
            <button ref="closeButtonRef" type="button" class="motion-press grid min-h-10 min-w-10 place-items-center rounded-md border-2 border-dc-ink bg-white font-mono text-lg font-semibold text-dc-ink shadow-[2px_2px_0_#111111]" :disabled="retrying" aria-label="Close blast details" @click="requestClose">×</button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="rounded-sm border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide" :class="statusClass">{{ statusLabel }}</span>
              <span class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">Created {{ formatDateTime(blast.created_at) }}</span>
            </div>

            <section v-if="issueDetails" class="mt-6 rounded-md border-2 p-4" :class="issueDetails.tone === 'error' ? 'border-red-300 bg-red-50' : issueDetails.tone === 'warning' ? 'border-amber-300 bg-amber-50' : 'border-dc-border bg-dc-paper-warm'">
              <p class="font-mono text-[10px] font-semibold uppercase tracking-wide" :class="issueDetails.tone === 'error' ? 'text-red-700' : issueDetails.tone === 'warning' ? 'text-amber-900' : 'text-dc-gray'">{{ issueDetails.title }}</p>
              <p class="mt-2 whitespace-pre-line text-sm font-semibold leading-6" :class="issueDetails.tone === 'error' ? 'text-red-800' : issueDetails.tone === 'warning' ? 'text-amber-900' : 'text-dc-ink'">{{ issueDetails.message }}</p>
            </section>

            <dl class="mt-6 grid gap-5 border-y border-dc-border py-5 sm:grid-cols-2">
              <div>
                <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Audience</dt>
                <dd class="mt-1 text-sm font-semibold text-dc-ink">{{ blast.recipient_count }} confirmed guest{{ blast.recipient_count === 1 ? '' : 's' }}</dd>
                <dd v-if="blast.status === 'preparing' || blast.preparation_error" class="mt-1 text-sm text-dc-gray">{{ progress }} prepared</dd>
              </div>
              <div>
                <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Delivery</dt>
                <dd class="mt-1 text-sm font-semibold text-dc-ink">{{ deliveryTime ? formatDateTime(deliveryTime) : 'Not delivered yet' }}</dd>
                <dd v-if="blast.scheduled_for && !blast.sent_at" class="mt-1 text-sm text-dc-gray">Scheduled send</dd>
              </div>
            </dl>

            <section class="mt-6 rounded-md border border-dc-border bg-white p-4">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Message</p>
              <p class="mt-2 whitespace-pre-line text-sm leading-6 text-dc-ink">{{ blast.body }}</p>
            </section>

            <section v-if="blast.provider_broadcast_id || blast.provider_segment_id" class="mt-6">
              <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Provider references</p>
              <dl class="mt-3 grid gap-3 text-sm">
                <div v-if="blast.provider_broadcast_id" class="rounded-md border border-dc-border bg-dc-paper-warm p-3"><dt class="text-dc-gray">Broadcast</dt><dd class="mt-1 break-all font-mono text-xs text-dc-ink">{{ blast.provider_broadcast_id }}</dd></div>
                <div v-if="blast.provider_segment_id" class="rounded-md border border-dc-border bg-dc-paper-warm p-3"><dt class="text-dc-gray">Audience segment</dt><dd class="mt-1 break-all font-mono text-xs text-dc-ink">{{ blast.provider_segment_id }}</dd></div>
              </dl>
            </section>
          </div>

          <footer v-if="blast.status === 'failed' && blast.provider_broadcast_id" class="shrink-0 border-t border-dc-border bg-white p-4 sm:p-5">
            <button type="button" class="editorial-action min-h-11 w-full justify-center px-4 disabled:opacity-50" :disabled="retrying" @click="emit('retry', blast)">{{ retrying ? 'RETRYING…' : 'RETRY DELIVERY' }}</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.blast-activity-drawer-enter-active,
.blast-activity-drawer-leave-active { transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1); }
.blast-activity-drawer-enter-active .blast-activity-drawer,
.blast-activity-drawer-leave-active .blast-activity-drawer { transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1); }
.blast-activity-drawer-enter-from,
.blast-activity-drawer-leave-to { opacity: 0; }
.blast-activity-drawer-enter-from .blast-activity-drawer,
.blast-activity-drawer-leave-to .blast-activity-drawer { transform: translate3d(100%, 0, 0); }
@media (prefers-reduced-motion: reduce) {
  .blast-activity-drawer-enter-active,
  .blast-activity-drawer-leave-active,
  .blast-activity-drawer-enter-active .blast-activity-drawer,
  .blast-activity-drawer-leave-active .blast-activity-drawer { transition: none; }
}
</style>
