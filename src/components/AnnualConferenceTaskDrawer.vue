<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import AnnualConferenceTaskForm from '@/src/components/AnnualConferenceTaskForm.vue';
import {
  ANNUAL_CONFERENCE_STATUS_LABELS,
  ANNUAL_CONFERENCE_WORKSTREAM_LABELS,
  type AnnualConferenceTask,
  type AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';

const props = defineProps<{
  open: boolean;
  mode: 'details' | 'edit' | 'create';
  task: AnnualConferenceTask | null;
  organizerLabels?: Record<string, string>;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  edit: [];
  cancelEdit: [];
  submit: [value: AnnualConferenceTaskUpdateInput];
}>();

const panelRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
const drawerEyebrow = computed(() => {
  if (props.mode === 'create') return 'New task';
  if (props.mode === 'edit') return 'Editing task';
  return 'Task detail';
});
const drawerTitle = computed(() => (
  props.mode === 'create' ? 'Add a conference task' : props.task?.title ?? 'Conference task'
));
let previouslyFocused: HTMLElement | null = null;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';
let appWasInert = false;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function organizerDisplay(value: string | null): string {
  if (!value) return 'Unassigned';
  return props.organizerLabels?.[value.trim().toLowerCase()] ?? value;
}

function statusClass(status: AnnualConferenceTask['status']): string {
  if (status === 'done') return 'border-dc-ink bg-dc-yellow text-dc-ink';
  if (status === 'blocked') return 'border-dc-ink bg-dc-pink text-white';
  if (status === 'in_progress') return 'border-dc-ink bg-dc-ink text-white';
  return 'border-dc-border bg-dc-paper-warm text-dc-gray';
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
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute('hidden'));
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
      return;
    }

    if (!open && wasOpen) {
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
    <Transition name="annual-task-drawer">
      <div
        v-if="open"
        class="annual-task-drawer-backdrop fixed inset-0 z-[130] flex justify-end bg-black/30"
        role="presentation"
        @click.self="requestClose"
      >
        <section
          id="annual-conference-task-drawer"
          ref="panelRef"
          class="annual-task-drawer-panel flex h-full w-full max-w-[42rem] flex-col border-l-2 border-dc-ink bg-dc-paper shadow-[-10px_0_0_rgba(17,17,17,0.14)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="annual-task-drawer-title"
          tabindex="-1"
        >
          <header class="flex shrink-0 items-start justify-between gap-4 border-b-2 border-dc-ink bg-dc-yellow px-5 py-4 sm:px-6">
            <div class="min-w-0">
              <p class="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dc-ink">
                {{ drawerEyebrow }}
              </p>
              <h2 id="annual-task-drawer-title" class="mt-1 text-2xl font-bold leading-tight tracking-tight text-dc-ink">
                {{ drawerTitle }}
              </h2>
            </div>
            <button
              ref="closeButtonRef"
              type="button"
              class="motion-press grid min-h-10 min-w-10 place-items-center rounded-md border-2 border-dc-ink bg-dc-paper font-mono text-lg font-semibold text-dc-ink shadow-[2px_2px_0_#111111]"
              :disabled="submitting"
              aria-label="Close task drawer"
              @click="requestClose"
            >
              ×
            </button>
          </header>

          <div class="annual-task-drawer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
            <div class="annual-task-drawer-content">
              <template v-if="mode === 'create'">
                <div class="mb-5 border-b-2 border-dc-ink pb-4">
                  <p class="text-sm font-medium leading-6 text-dc-gray">
                    Add the delivery details and assign exactly one accountable owner. Other organizers can be listed as collaborators.
                  </p>
                </div>
                <AnnualConferenceTaskForm
                  mode="create"
                  :submitting="submitting"
                  @submit="emit('submit', $event)"
                  @cancel="emit('close')"
                />
              </template>

              <template v-else-if="mode === 'edit' && task">
                <div class="mb-5 flex flex-wrap items-center justify-between gap-3 border-b-2 border-dc-ink pb-4">
                  <p class="text-sm font-medium leading-6 text-dc-gray">
                    Update the delivery details, ownership, and status.
                  </p>
                  <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">
                    All organizers may edit
                  </span>
                </div>
                <AnnualConferenceTaskForm
                  mode="edit"
                  :task="task"
                  :submitting="submitting"
                  @submit="emit('submit', $event)"
                  @cancel="emit('cancelEdit')"
                />
              </template>

              <template v-else-if="task">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded-md border-2 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]"
                    :class="statusClass(task.status)"
                  >
                    {{ ANNUAL_CONFERENCE_STATUS_LABELS[task.status] }}
                  </span>
                  <span class="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-gray">
                    {{ ANNUAL_CONFERENCE_WORKSTREAM_LABELS[task.workstream] }}
                  </span>
                  <span v-if="task.priority" class="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-dc-pink">
                    {{ task.priority }} priority
                  </span>
                </div>

                <section class="mt-6 border-t-2 border-dc-ink pt-5">
                  <p class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Task detail</p>
                  <p class="mt-2 text-base font-medium leading-7" :class="task.details ? 'text-dc-ink' : 'text-dc-gray'">
                    {{ task.details ?? 'No task description yet.' }}
                  </p>
                </section>

                <dl class="mt-6 grid gap-5 border-y border-dc-border py-5 sm:grid-cols-2">
                  <div>
                    <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Accountable</dt>
                    <dd class="mt-1 text-sm font-semibold" :class="task.accountable_owner ? 'text-dc-ink' : 'text-dc-pink'">
                      {{ organizerDisplay(task.accountable_owner) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Collaborators</dt>
                    <dd class="mt-1 text-sm font-semibold leading-6 text-dc-ink">
                      {{ task.collaborators.length ? task.collaborators.map(organizerDisplay).join(', ') : 'None yet' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Target</dt>
                    <dd class="mt-1 text-sm font-semibold text-dc-ink">
                      {{ task.target_date ? formatDate(task.target_date) : 'No date' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Priority</dt>
                    <dd class="mt-1 text-sm font-semibold capitalize text-dc-ink">{{ task.priority ?? 'Not set' }}</dd>
                  </div>
                </dl>

                <div v-if="task.dependency_note || task.internal_note" class="mt-6 grid gap-5 sm:grid-cols-2">
                  <section v-if="task.dependency_note" class="rounded-md border border-dc-border bg-dc-paper-warm p-4">
                    <h3 class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-pink">Dependency</h3>
                    <p class="mt-2 text-sm font-semibold leading-6 text-dc-ink">{{ task.dependency_note }}</p>
                  </section>
                  <section v-if="task.internal_note" class="rounded-md border border-dc-border bg-dc-paper-warm p-4">
                    <h3 class="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-dc-gray">Internal note</h3>
                    <p class="mt-2 text-sm font-semibold leading-6 text-dc-ink">{{ task.internal_note }}</p>
                  </section>
                </div>

              </template>
            </div>
          </div>

          <footer
            v-if="mode === 'details' && task"
            class="flex shrink-0 justify-end border-t-2 border-dc-ink bg-dc-paper px-5 py-4 sm:px-6"
          >
            <button
              type="button"
              class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-pink px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_#111111]"
              @click="emit('edit')"
            >
              Edit task
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.annual-task-drawer-backdrop {
  opacity: 1;
}

.annual-task-drawer-panel,
.annual-task-drawer-content {
  will-change: transform, opacity;
}

.annual-task-drawer-enter-active,
.annual-task-drawer-leave-active {
  transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.annual-task-drawer-enter-active .annual-task-drawer-panel,
.annual-task-drawer-leave-active .annual-task-drawer-panel {
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.annual-task-drawer-enter-active .annual-task-drawer-content {
  transition:
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1) 40ms,
    opacity 180ms cubic-bezier(0.4, 0, 0.2, 1) 40ms;
}

.annual-task-drawer-leave-active .annual-task-drawer-content {
  transition: opacity 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.annual-task-drawer-enter-from,
.annual-task-drawer-leave-to {
  opacity: 0;
}

.annual-task-drawer-enter-from .annual-task-drawer-panel,
.annual-task-drawer-leave-to .annual-task-drawer-panel {
  transform: translate3d(100%, 0, 0);
}

.annual-task-drawer-enter-from .annual-task-drawer-content {
  opacity: 0;
  transform: translate3d(-1rem, 0, 0);
}

.annual-task-drawer-leave-to .annual-task-drawer-content {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .annual-task-drawer-enter-active,
  .annual-task-drawer-leave-active,
  .annual-task-drawer-enter-active .annual-task-drawer-panel,
  .annual-task-drawer-leave-active .annual-task-drawer-panel,
  .annual-task-drawer-enter-active .annual-task-drawer-content,
  .annual-task-drawer-leave-active .annual-task-drawer-content {
    transition-duration: 0.01ms;
    transition-delay: 0ms;
  }

  .annual-task-drawer-enter-from .annual-task-drawer-panel,
  .annual-task-drawer-leave-to .annual-task-drawer-panel,
  .annual-task-drawer-enter-from .annual-task-drawer-content {
    transform: none;
  }
}
</style>
