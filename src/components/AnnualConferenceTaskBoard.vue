<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import { annualConferenceTaskCardDescription } from '@/lib/annual-conference-task-card';
import {
  annualConferenceOwnerAvatarSeed,
} from '@/lib/annual-conference-owner-avatar';
import {
  ANNUAL_CONFERENCE_STATUS_LABELS,
  ANNUAL_CONFERENCE_TASK_STATUSES,
  ANNUAL_CONFERENCE_WORKSTREAM_LABELS,
  type AnnualConferenceTask,
} from '@/lib/annual-conference-work-plan';

const props = withDefaults(defineProps<{
  canMoveTask: (task: AnnualConferenceTask) => boolean;
  ownerAvatarSeeds: ReadonlyMap<string, string>;
  organizerLabels: Record<string, string>;
  savingTaskIds?: ReadonlySet<string>;
  tasks: AnnualConferenceTask[];
}>(), {
  savingTaskIds: () => new Set<string>(),
});

const emit = defineEmits<{
  openTask: [task: AnnualConferenceTask];
  changeStatus: [task: AnnualConferenceTask, status: AnnualConferenceTask['status']];
}>();

const draggedTaskId = ref<string | null>(null);
const dropStatus = ref<AnnualConferenceTask['status'] | null>(null);
const liveMessage = ref('');
const boardElement = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let resizeAnimation: Animation | null = null;
let previousBoardSize: { width: number; height: number } | null = null;
const statusPresentations: Record<AnnualConferenceTask['status'], {
  accent: string;
  countLabel: string;
}> = {
  not_started: { accent: '#777777', countLabel: 'queued' },
  in_progress: { accent: '#d97706', countLabel: 'active' },
  blocked: { accent: '#e8117f', countLabel: 'blocked' },
  done: { accent: '#0f766e', countLabel: 'shipped' },
};
const columns = computed(() => ANNUAL_CONFERENCE_TASK_STATUSES.map((status) => ({
  status,
  tasks: props.tasks.filter((task) => task.status === status),
})));
const taskDescriptions = computed(() => new Map(
  props.tasks.map((task) => [task.id, annualConferenceTaskCardDescription(task)]),
));

function organizerDisplay(task: AnnualConferenceTask): string {
  if (!task.accountable_owner) return 'Needs an owner';

  return props.organizerLabels[task.accountable_owner.trim().toLowerCase()] ?? task.accountable_owner;
}

function targetDateDisplay(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${value}T12:00:00Z`));
}

function taskDescription(task: AnnualConferenceTask): string | null {
  return taskDescriptions.value.get(task.id) ?? null;
}

function ownerAvatarSeed(task: AnnualConferenceTask): string | null {
  if (!task.accountable_owner) return null;

  return annualConferenceOwnerAvatarSeed(task.accountable_owner, props.ownerAvatarSeeds);
}

function beginDrag(event: DragEvent, task: AnnualConferenceTask) {
  if (!props.canMoveTask(task)) {
    event.preventDefault();

    return;
  }

  draggedTaskId.value = task.id;
  event.dataTransfer?.setData('text/plain', task.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function allowDrop(event: DragEvent, status: AnnualConferenceTask['status']) {
  if (!draggedTaskId.value) return;

  event.preventDefault();
  dropStatus.value = status;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function clearDrag() {
  draggedTaskId.value = null;
  dropStatus.value = null;
}

function clearDropIfLeavingColumn(event: DragEvent, status: AnnualConferenceTask['status']) {
  const column = event.currentTarget;
  const nextTarget = event.relatedTarget;

  if (column instanceof HTMLElement && nextTarget instanceof Node && column.contains(nextTarget)) return;
  if (dropStatus.value === status) dropStatus.value = null;
}

function requestStatusChange(task: AnnualConferenceTask, status: AnnualConferenceTask['status']) {
  if (!props.canMoveTask(task) || task.status === status) return;

  liveMessage.value = `${task.title} is moving to ${ANNUAL_CONFERENCE_STATUS_LABELS[status]}.`;
  emit('changeStatus', task, status);
}

function dropTask(event: DragEvent, status: AnnualConferenceTask['status']) {
  event.preventDefault();
  const taskId = draggedTaskId.value ?? event.dataTransfer?.getData('text/plain');
  const task = props.tasks.find((candidate) => candidate.id === taskId);

  clearDrag();
  if (!task) return;

  requestStatusChange(task, status);
}

function isSaving(task: AnnualConferenceTask): boolean {
  return props.savingTaskIds.has(task.id);
}

function taskCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'task' : 'tasks'}`;
}

function statusPresentation(status: AnnualConferenceTask['status']) {
  return statusPresentations[status];
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function animateBoardResize(entries: ResizeObserverEntry[]) {
  const entry = entries[0];
  const element = boardElement.value;

  if (!entry || !element) return;

  const nextSize = {
    width: entry.contentRect.width,
    height: entry.contentRect.height,
  };
  const previousSize = previousBoardSize;

  previousBoardSize = nextSize;

  if (
    !previousSize
    || !nextSize.width
    || !nextSize.height
    || prefersReducedMotion()
    || typeof element.animate !== 'function'
  ) return;

  const scaleX = previousSize.width / nextSize.width;
  const scaleY = previousSize.height / nextSize.height;
  const hasMeaningfulResize = Math.abs(1 - scaleX) > .02 || Math.abs(1 - scaleY) > .02;

  if (!hasMeaningfulResize) return;

  resizeAnimation?.cancel();
  resizeAnimation = element.animate([
    { transform: `scale(${scaleX}, ${scaleY})` },
    { transform: 'scale(1)' },
  ], {
    duration: 220,
    easing: 'cubic-bezier(.16, 1, .3, 1)',
  });
  resizeAnimation.onfinish = () => {
    resizeAnimation = null;
  };
}

onMounted(() => {
  const element = boardElement.value;

  if (!element || typeof ResizeObserver === 'undefined') return;

  resizeObserver = new ResizeObserver(animateBoardResize);
  resizeObserver.observe(element);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeAnimation?.cancel();
});
</script>

<template>
  <div ref="boardElement" class="task-board" aria-label="Conference tasks by status">
    <p class="sr-only" aria-live="polite">{{ liveMessage }}</p>

    <section
      v-for="column in columns"
      :key="column.status"
      class="task-board__column"
      :class="{ 'task-board__column--active-drop': dropStatus === column.status }"
      :aria-label="`${ANNUAL_CONFERENCE_STATUS_LABELS[column.status]} tasks`"
      @dragover="allowDrop($event, column.status)"
      @dragleave="clearDropIfLeavingColumn($event, column.status)"
      @drop="dropTask($event, column.status)"
    >
      <header
        class="task-board__column-header"
        :style="{ '--task-board-status-accent': statusPresentation(column.status).accent }"
      >
        <div class="task-board__column-title">
          <svg v-if="column.status === 'not_started'" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="5.75" fill="none" stroke="currentColor" stroke-width="1.7" />
          </svg>
          <svg v-else-if="column.status === 'in_progress'" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="5.75" fill="none" stroke="currentColor" stroke-width="1.7" />
            <path d="M10 6.75v3.65l2.55 1.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" />
          </svg>
          <svg v-else-if="column.status === 'blocked'" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7.25 6.5v7M12.75 6.5v7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" />
          </svg>
          <svg v-else viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5.25 10.25 3.05 3.05 6.45-6.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" />
          </svg>
          <h3>{{ ANNUAL_CONFERENCE_STATUS_LABELS[column.status] }}</h3>
        </div>
        <span class="task-board__count" :aria-label="taskCountLabel(column.tasks.length)">
          <strong>{{ column.tasks.length }}</strong>
          <span>{{ statusPresentation(column.status).countLabel }}</span>
        </span>
      </header>

      <div class="task-board__cards">
        <article
          v-for="task in column.tasks"
          :key="task.id"
          class="task-board__card"
          :class="{
            'task-board__card--movable': canMoveTask(task),
            'task-board__card--dragging': draggedTaskId === task.id,
            'task-board__card--saving': isSaving(task),
          }"
          :aria-busy="isSaving(task)"
          :draggable="canMoveTask(task)"
          :aria-label="`Open ${task.title}`"
          role="button"
          tabindex="0"
          @click="emit('openTask', task)"
          @keydown.enter.prevent="emit('openTask', task)"
          @keydown.space.prevent="emit('openTask', task)"
          @dragstart="beginDrag($event, task)"
          @dragend="clearDrag"
        >
          <div class="task-board__card-topline">
            <span class="task-board__workstream">{{ ANNUAL_CONFERENCE_WORKSTREAM_LABELS[task.workstream] }}</span>
            <span v-if="task.priority" class="task-board__priority">{{ task.priority }}</span>
          </div>

          <h4 class="task-board__task">{{ task.title }}</h4>
          <p v-if="taskDescription(task)" class="task-board__description">{{ taskDescription(task) }}</p>

          <footer class="task-board__footer">
            <span class="task-board__owner" :class="{ 'task-board__owner--missing': !task.accountable_owner }">
              <NaviiAvatar
                v-if="task.accountable_owner"
                :seed="ownerAvatarSeed(task)!"
                title=""
                :size="26"
                class="task-board__owner-avatar"
                aria-hidden="true"
              />
              <span v-else class="task-board__owner-avatar" aria-hidden="true">
                <svg viewBox="0 0 20 20" class="size-3" fill="none">
                  <circle cx="10" cy="6.25" r="3.1" stroke="currentColor" stroke-width="1.7" />
                  <path d="M3.8 17c.55-3.15 2.6-4.75 6.2-4.75s5.65 1.6 6.2 4.75" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                </svg>
              </span>
              <span>{{ organizerDisplay(task) }}</span>
            </span>
            <span v-if="isSaving(task)" class="task-board__saving" aria-label="Saving task status">
              <span aria-hidden="true" />
              <span class="sr-only">Saving status</span>
            </span>
            <time v-if="task.target_date" :datetime="task.target_date" :aria-label="`Target date ${task.target_date}`" class="task-board__target-date">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 17.25V3.25m0 .25c3.1-1.65 5.95-1.65 10 0v7c-4.05-1.65-6.9-1.65-10 0" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
              </svg>
              <span>{{ targetDateDisplay(task.target_date) }}</span>
            </time>
          </footer>

        </article>

        <div v-if="!column.tasks.length" class="task-board__empty">
          <template v-if="column.status === 'blocked'">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5.25 10.25 3.05 3.05 6.45-6.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" />
            </svg>
            <span>
              <strong>Clear runway</strong>
              <span>No blocked tasks in this view. Drop a task here.</span>
            </span>
          </template>
          <span v-else>Drop a task here.</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.task-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .75rem;
  padding: 1rem 1.25rem 1.25rem;
  background: #f5f2e8;
  transform-origin: top center;
}

.task-board__column {
  min-width: 0;
  border: 1px solid #e0ddd4;
  border-radius: 8px;
  background: #faf9f5;
  transition: transform 180ms cubic-bezier(.16, 1, .3, 1);
}

.task-board__column--active-drop {
  border-color: #e8117f;
  background: #fce7f3;
  transform: translateY(-2px);
}

.task-board__column-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: .75rem;
  border-bottom: 1px solid #e0ddd4;
  padding: .85rem .9rem;
}

.task-board__workstream,
.task-board__priority {
  font-family: var(--font-mono);
  font-size: .5rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.task-board__workstream {
  color: #555;
}

.task-board__column-header {
  position: relative;
  overflow: hidden;
}

.task-board__column-header::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 3px;
  background: var(--task-board-status-accent);
  content: '';
}

.task-board__column-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: .4rem;
  color: var(--task-board-status-accent);
}

.task-board__column-title svg {
  width: 1rem;
  height: 1rem;
  flex: none;
}

.task-board__column h3 {
  font-size: .8125rem;
  font-weight: 700;
  color: #111;
}

.task-board__count {
  display: inline-flex;
  align-items: baseline;
  gap: .25rem;
  font-family: var(--font-mono);
  font-size: .5rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #6b6b6b;
}

.task-board__count strong {
  color: #111;
  font-size: .875rem;
  letter-spacing: 0;
}

.task-board__cards {
  display: grid;
  gap: .65rem;
  min-height: 8rem;
  padding: .65rem;
}

.task-board__card {
  min-width: 0;
  border: 1px solid #e0ddd4;
  border-radius: 8px;
  background: white;
  padding: .75rem;
  box-shadow: 0 1px 0 rgba(17, 17, 17, .04);
  cursor: pointer;
  transition: transform 180ms cubic-bezier(.16, 1, .3, 1), opacity 120ms cubic-bezier(.4, 0, .2, 1);
}

.task-board__card--movable {
  user-select: none;
}

.task-board__card--movable:active {
  cursor: grabbing;
  transform: scale(.97);
}

.task-board__card--dragging {
  opacity: .45;
}

.task-board__card--saving {
  border-color: #e8117f;
}

.task-board__card-topline {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: .5rem;
}

.task-board__workstream {
  line-height: 1.25;
  color: #555;
}

.task-board__priority {
  flex: none;
  color: #b20d61;
}

.task-board__task {
  overflow: hidden;
  margin-top: .55rem;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: .8125rem;
  font-weight: 700;
  line-height: 1.15rem;
  color: #111;
  overflow-wrap: anywhere;
}

.task-board__card:focus-visible {
  outline: 2px solid #e8117f;
  outline-offset: 3px;
}

.task-board__description {
  display: -webkit-box;
  overflow: hidden;
  margin: .45rem 0 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: #555;
  font-size: .6875rem;
  line-height: 1.05rem;
}

.task-board__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .5rem;
  margin-top: .65rem;
  border-top: 1px solid #e0ddd4;
  padding-top: .6rem;
  color: #555;
  font-size: .625rem;
}

.task-board__owner {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: .35rem;
  overflow: hidden;
  font-weight: 600;
  white-space: nowrap;
}

.task-board__owner > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-board__owner-avatar {
  display: grid;
  width: 1.3rem;
  height: 1.3rem;
  flex: none;
  border-radius: 999px;
  object-fit: cover;
}

.task-board__owner--missing .task-board__owner-avatar {
  display: grid;
  place-items: center;
  background: #fce7f3;
  color: #9d174d;
}

.task-board__target-date {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: .3rem;
  border: 1px solid #e0ddd4;
  border-radius: 999px;
  background: #faf9f5;
  padding: .2rem .4rem;
  color: #555;
  font-size: .625rem;
  font-weight: 600;
  line-height: 1;
}

.task-board__target-date svg {
  width: .85rem;
  height: .85rem;
  color: #6b6b6b;
}

.task-board__saving {
  display: inline-flex;
  flex: none;
  align-items: center;
}

.task-board__saving > span:first-child {
  width: .4rem;
  height: .4rem;
  border-radius: 999px;
  background: #e8117f;
}

.task-board__empty {
  display: flex;
  min-height: 4.5rem;
  align-items: center;
  justify-content: center;
  gap: .45rem;
  margin: 0;
  padding: .7rem;
  border: 1px dashed #d2cec4;
  border-radius: 6px;
  text-align: center;
  font-size: .625rem;
  line-height: 1rem;
  color: #555;
}

.task-board__empty > svg {
  width: 1rem;
  height: 1rem;
  flex: none;
  color: #0f766e;
}

.task-board__empty > span {
  display: block;
}

.task-board__empty strong,
.task-board__empty strong + span {
  display: block;
}

.task-board__empty strong {
  color: #111;
  font-size: .6875rem;
}

.task-board__empty strong + span {
  margin-top: .1rem;
  color: #6b6b6b;
  font-size: .5625rem;
}

@media (hover: hover) and (pointer: fine) {
  .task-board__card--movable:hover {
    transform: translateY(-2px);
  }
}

@media (min-width: 1024px) {
  .task-board__column-header {
    position: sticky;
    top: var(--task-board-sticky-offset);
    z-index: 10;
    background: #faf9f5;
    box-shadow: 0 -.75rem 0 1px #f5f2e8;
  }
}

@media (prefers-reduced-motion: reduce) {
  .task-board__column,
  .task-board__card {
    transition: none;
  }

  .task-board__column--active-drop,
  .task-board__card--movable:active,
  .task-board__card--movable:hover {
    transform: none;
  }
}
</style>
