<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import {
  ANNUAL_CONFERENCE_STATUS_LABELS,
  summarizeAnnualConferenceDependencies,
  summarizeAnnualConferenceWorkPlan,
  type AnnualConferenceTask,
} from '@/lib/annual-conference-work-plan';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION, annualConferencePath } from '@/src/annual-conference';
import { fetchAdminOrganizers, fetchAnnualConferenceWorkPlan, queryKeys } from '@/src/lib/api';

const route = useRoute();
const year = computed(() => String(route.params.year ?? ACTIVE_ANNUAL_CONFERENCE_EDITION.year));
const factsOpen = ref(false);
const factsDisclosure = ref<HTMLElement | null>(null);
const factsTrigger = ref<HTMLButtonElement | null>(null);
const workPlanQuery = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceWorkPlan(year.value)),
  queryFn: () => fetchAnnualConferenceWorkPlan(year.value),
});

const tasks = computed(() => workPlanQuery.data.value?.tasks ?? []);
const edition = computed(() => workPlanQuery.data.value?.edition);
const summary = computed(() => summarizeAnnualConferenceWorkPlan(tasks.value));
const dependencySummary = computed(() => summarizeAnnualConferenceDependencies(tasks.value));
const assignedAccess = computed(() => workPlanQuery.data.value?.permissions.access_scope === 'assigned');
const organizersQuery = useQuery({
  queryKey: queryKeys.adminOrganizers,
  queryFn: fetchAdminOrganizers,
  enabled: computed(() => Boolean(workPlanQuery.data.value) && !assignedAccess.value),
});
const taskCompletionByPerson = computed(() => {
  const organizerByIdentity = new Map<string, { email: string; name: string }>();
  const ambiguousIdentities = new Set<string>();
  const normalizeIdentity = (value: string) => value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  const registerIdentity = (identity: string, organizer: { email: string; name: string }) => {
    const key = normalizeIdentity(identity);
    if (!key || ambiguousIdentities.has(key)) return;
    const existing = organizerByIdentity.get(key);
    if (existing && existing.email !== organizer.email) {
      organizerByIdentity.delete(key);
      ambiguousIdentities.add(key);
      return;
    }
    organizerByIdentity.set(key, organizer);
  };

  for (const member of organizersQuery.data.value?.organizers ?? []) {
    if (member.status !== 'active') continue;
    const organizer = {
      email: member.email.trim().toLowerCase(),
      name: member.display_name?.trim() || member.email,
    };
    registerIdentity(organizer.email, organizer);
    registerIdentity(organizer.name, organizer);
    registerIdentity(organizer.email.split('@')[0] ?? '', organizer);
  }

  const people = new Map<string, {
    email: string;
    name: string;
    filterOwner: string;
    complete: number;
    pending: number;
    total: number;
  }>();

  for (const task of tasks.value) {
    if (!task.accountable_owner) continue;
    const rawOwner = task.accountable_owner.trim();
    const organizer = organizerByIdentity.get(normalizeIdentity(rawOwner));
    const email = organizer?.email ?? rawOwner.toLowerCase();
    const existing = people.get(email) ?? {
      email,
      name: organizer?.name ?? rawOwner,
      filterOwner: rawOwner,
      complete: 0,
      pending: 0,
      total: 0,
    };
    existing.total += 1;
    if (task.status === 'done') existing.complete += 1;
    else existing.pending += 1;
    people.set(email, existing);
  }

  return [...people.values()]
    .filter((person) => person.pending > 0)
    .sort((a, b) => (
      b.pending - a.pending || b.total - a.total || a.name.localeCompare(b.name)
    ));
});

function formatConferenceDate(value: string | null | undefined): string {
  if (!value) return 'To be confirmed';
  return new Intl.DateTimeFormat('en-GH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function taskStatusLabel(task: AnnualConferenceTask): string {
  return ANNUAL_CONFERENCE_STATUS_LABELS[task.status];
}

function personCompletionPercent(person: { complete: number; total: number }): number {
  return person.total > 0 ? Math.round((person.complete / person.total) * 100) : 0;
}

function closeFacts(restoreFocus = false) {
  factsOpen.value = false;
  if (restoreFocus) void nextTick(() => factsTrigger.value?.focus());
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!factsOpen.value || !(event.target instanceof Node)) return;
  if (!factsDisclosure.value?.contains(event.target)) closeFacts();
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
});
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AnnualConferenceNav :show-page-heading="false" />

      <section v-if="workPlanQuery.isError.value" class="editorial-panel mb-6 border-dc-pink p-6">
        <p class="text-lg font-semibold text-dc-ink">Conference planning data is temporarily unavailable.</p>
        <button
          type="button"
          class="motion-press mt-4 min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
          @click="workPlanQuery.refetch()"
        >
          Try again
        </button>
      </section>

      <section class="conference-brief" aria-labelledby="conference-brief-date">
        <header class="conference-brief__masthead">
          <div class="conference-brief__date">
            <div class="conference-brief__edition-meta">
              <p class="conference-brief__eyebrow">{{ edition?.label ?? year }} edition</p>
              <span class="conference-brief__status">
                <span aria-hidden="true" />
                Provisional
              </span>
            </div>
            <h1 id="conference-brief-date">{{ formatConferenceDate(edition?.provisional_date) }}</h1>
          </div>

          <div
            v-if="!assignedAccess"
            ref="factsDisclosure"
            class="conference-notes"
            @keydown.esc.stop.prevent="closeFacts(true)"
          >
            <button
              ref="factsTrigger"
              type="button"
              class="conference-notes__trigger motion-press"
              :aria-expanded="factsOpen"
              aria-controls="annual-conference-edition-facts"
              @click="factsOpen = !factsOpen"
            >
              <span>Planning notes</span>
              <span class="conference-notes__count" aria-hidden="true">02</span>
              <svg
                viewBox="0 0 20 20"
                class="conference-notes__chevron"
                :class="{ 'conference-notes__chevron--open': factsOpen }"
                fill="none"
                aria-hidden="true"
              >
                <path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <Transition name="conference-facts-popover">
              <aside
                v-if="factsOpen"
                id="annual-conference-edition-facts"
                class="conference-notes__popover"
                role="region"
                aria-labelledby="conference-notes-title"
              >
                <div class="conference-notes__heading">
                  <div>
                    <p class="conference-brief__eyebrow">Planning notes</p>
                    <h3 id="conference-notes-title">Venue &amp; keynote</h3>
                  </div>
                  <button
                    type="button"
                    class="conference-notes__close motion-press"
                    aria-label="Close planning notes"
                    @click="closeFacts(true)"
                  >
                    ×
                  </button>
                </div>
                <dl>
                  <div>
                    <dt>Venue</dt>
                    <dd>{{ edition?.venue_note ?? 'UPSA or Accra Digital Centre under consideration.' }}</dd>
                  </div>
                  <div>
                    <dt>Keynote</dt>
                    <dd>{{ edition?.keynote_note ?? 'Patrick G. Awuah is preferred.' }}</dd>
                  </div>
                </dl>
              </aside>
            </Transition>
          </div>
        </header>

        <div class="conference-brief__delivery">
          <div class="conference-delivery">
            <div class="conference-delivery__headline">
              <div>
              <p class="conference-brief__eyebrow">{{ assignedAccess ? 'Your work' : 'Delivery' }}</p>
                <h3>
                  <strong>{{ summary.done }}</strong>
                  <span> / {{ summary.total }} tasks complete</span>
                </h3>
              </div>
              <p class="conference-delivery__percent">{{ summary.completion_percent }}%</p>
            </div>

            <div
              class="conference-delivery__progress"
              role="progressbar"
              aria-label="Annual conference work plan completion"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="summary.completion_percent"
            >
              <span :style="{ transform: `scaleX(${summary.completion_percent / 100})` }" />
            </div>

            <div class="conference-delivery__signals">
              <span v-if="assignedAccess">
                {{ summary.total }} {{ summary.total === 1 ? 'task assigned to you' : 'tasks assigned to you' }}
              </span>
              <span v-else-if="summary.unassigned > 0" class="conference-delivery__attention">
                {{ summary.unassigned }} need {{ summary.unassigned === 1 ? 'an owner' : 'owners' }}
              </span>
              <span v-else>Every task has an owner</span>
              <span v-if="summary.blocked > 0">
                {{ summary.blocked }} {{ summary.blocked === 1 ? 'task blocked' : 'tasks blocked' }}
              </span>
            </div>
          </div>

          <RouterLink
            :to="annualConferencePath('work-plan', year)"
            class="conference-brief__primary-action motion-press"
          >
            <span>Open work plan</span>
            <span class="conference-brief__action-arrow" aria-hidden="true">→</span>
          </RouterLink>
        </div>

        <section v-if="!assignedAccess" class="conference-dependencies" aria-labelledby="conference-dependencies-title">
          <div class="conference-dependencies__heading">
            <div>
              <p class="conference-brief__eyebrow">Dependency pulse</p>
              <h3 id="conference-dependencies-title">What needs to happen next</h3>
            </div>
            <RouterLink
              :to="annualConferencePath('work-plan', year)"
              class="conference-dependencies__action motion-press"
            >
              Manage dependencies <span aria-hidden="true">→</span>
            </RouterLink>
          </div>

          <template v-if="dependencySummary.total_links">
            <p class="conference-dependencies__summary">
              <span v-if="dependencySummary.waiting_tasks.length">
                {{ dependencySummary.waiting_tasks.length }} {{ dependencySummary.waiting_tasks.length === 1 ? 'task is' : 'tasks are' }} waiting on unfinished work.
              </span>
              <span v-else>
                Every linked task is clear to move when its status allows.
              </span>
              <span v-if="dependencySummary.ready_tasks.length" class="conference-dependencies__follow-up">
                {{ dependencySummary.ready_tasks.length }} {{ dependencySummary.ready_tasks.length === 1 ? 'task is' : 'tasks are' }} ready to start.
              </span>
            </p>

            <dl class="conference-dependencies__metrics">
              <div>
                <dt>Links</dt>
                <dd>{{ dependencySummary.total_links }}</dd>
              </div>
              <div>
                <dt>Waiting</dt>
                <dd>{{ dependencySummary.waiting_tasks.length }}</dd>
              </div>
              <div>
                <dt>Ready</dt>
                <dd>{{ dependencySummary.ready_tasks.length }}</dd>
              </div>
            </dl>

            <div v-if="dependencySummary.blockers.length" class="conference-dependency-graph" aria-label="Task dependency paths">
              <div v-for="blocker in dependencySummary.blockers.slice(0, 3)" :key="blocker.prerequisite.id" class="conference-dependency-path">
                <div class="conference-dependency-node">
                  <span class="conference-dependency-node__label">Prerequisite</span>
                  <strong>{{ blocker.prerequisite.title }}</strong>
                  <span>{{ taskStatusLabel(blocker.prerequisite) }}</span>
                </div>
                <span class="conference-dependency-path__arrow" aria-hidden="true">→</span>
                <div class="conference-dependency-dependents">
                  <span class="conference-dependency-node__label">Unblocks</span>
                  <span v-for="dependent in blocker.dependents.slice(0, 3)" :key="dependent.id" class="conference-dependency-dependent">
                    {{ dependent.title }}
                  </span>
                  <span v-if="blocker.dependents.length > 3" class="conference-dependency-dependent conference-dependency-dependent--more">
                    +{{ blocker.dependents.length - 3 }} more
                  </span>
                </div>
              </div>
            </div>
            <p v-else class="conference-dependencies__clear-paths">
              All linked prerequisite paths are complete. Keep task status current as delivery moves forward.
            </p>
          </template>

          <div v-else class="conference-dependencies__empty">
            <span class="conference-dependencies__empty-mark" aria-hidden="true">↗</span>
            <p><strong>No dependency paths yet.</strong> In Work plan, choose the task or tasks that each piece of work depends on. This Overview will then show what is waiting and what each completed task unlocks.</p>
          </div>
        </section>

        <section v-if="!assignedAccess" class="conference-workload" aria-labelledby="conference-workload-title">
          <div class="conference-workload__heading">
            <div>
              <p class="conference-brief__eyebrow">Team workload</p>
              <h3 id="conference-workload-title">Completion by assignee</h3>
            </div>
          </div>

          <div v-if="taskCompletionByPerson.length" class="conference-workload__list" aria-label="Task completion by person">
            <RouterLink
              v-for="person in taskCompletionByPerson"
              :key="person.email"
              :to="{
                path: annualConferencePath('work-plan', year),
                query: { owner: person.filterOwner },
              }"
              class="conference-workload__person motion-press"
              :aria-label="`View ${person.name}'s tasks in the work plan`"
            >
              <div class="conference-workload__person-heading">
                <p>{{ person.name }}</p>
                <span>{{ person.pending }} pending</span>
              </div>
              <div class="conference-workload__meter" role="progressbar" :aria-label="`${person.name} task completion`" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="personCompletionPercent(person)">
                <span :style="{ transform: `scaleX(${personCompletionPercent(person) / 100})` }" />
              </div>
              <p class="conference-workload__detail">{{ person.complete }} of {{ person.total }} complete</p>
              <span class="conference-workload__open">View tasks <span aria-hidden="true">→</span></span>
            </RouterLink>
          </div>
          <p v-else class="conference-workload__empty">There are no outstanding tasks with an accountable owner.</p>
        </section>
      </section>
    </div>
  </div>
</template>

<style scoped>
.conference-brief {
  position: relative;
  margin-bottom: 2.5rem;
}

.conference-brief__masthead {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: clamp(2rem, 5vw, 5rem);
  padding: clamp(1.8rem, 3.8vw, 3.4rem) 0 clamp(1.7rem, 3vw, 2.6rem);
}

.conference-brief__edition-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.7rem 1rem;
}

.conference-brief__eyebrow {
  margin: 0;
  color: #646464;
  font-family: var(--font-mono), monospace;
  font-size: 0.625rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.15em;
  line-height: 1.3;
  text-transform: uppercase;
}

.conference-brief__date h1 {
  max-width: 22ch;
  margin: 0;
  margin-top: 0.85rem;
  color: #111111;
  font-size: clamp(2.2rem, 4.2vw, 3.65rem);
  font-weight: var(--font-weight-display);
  letter-spacing: -0.055em;
  line-height: 0.97;
}

.conference-brief__status {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #555555;
  font-family: var(--font-mono), monospace;
  font-size: 0.58rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.conference-brief__status > span {
  width: 0.55rem;
  height: 0.55rem;
  border: 1px solid #111111;
  border-radius: 50%;
  background: #f5e642;
}

.conference-notes {
  position: relative;
  z-index: 10;
  justify-self: end;
}

.conference-notes__trigger {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.65rem;
  border: 0;
  border-bottom: 1px solid #a8a49a;
  background: transparent;
  padding: 0.45rem 0;
  color: #555555;
  font-family: var(--font-mono), monospace;
  font-size: 0.62rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.11em;
  text-transform: uppercase;
  white-space: nowrap;
}

.conference-notes__count {
  color: #e8117f;
}

.conference-notes__chevron {
  width: 0.9rem;
  height: 0.9rem;
  flex: 0 0 auto;
  color: #111111;
  transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.conference-notes__chevron--open {
  transform: rotate(180deg);
}

.conference-notes__popover {
  position: absolute;
  top: calc(100% + 0.65rem);
  right: 0;
  width: min(22rem, calc(100vw - 3rem));
  border: 1px solid #111111;
  border-radius: 6px;
  background: #ffffff;
  padding: 1.15rem;
  box-shadow: 0 18px 40px rgba(17, 17, 17, 0.15);
  transform-origin: top right;
}

.conference-notes__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid #d9d5cc;
}

.conference-notes__heading h3 {
  margin: 0.35rem 0 0;
  color: #111111;
  font-size: 1.05rem;
  font-weight: var(--font-weight-heading);
  line-height: 1.2;
}

.conference-notes__close {
  display: inline-grid;
  width: 2rem;
  height: 2rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #a8a49a;
  border-radius: 6px;
  background: #ffffff;
  color: #111111;
  font-size: 1.1rem;
  font-weight: var(--font-weight-label);
  line-height: 1;
}

.conference-notes__popover dl {
  margin: 0;
}

.conference-notes__popover dl > div {
  padding-top: 0.9rem;
}

.conference-notes__popover dt {
  color: #646464;
  font-family: var(--font-mono), monospace;
  font-size: 0.58rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.conference-notes__popover dd {
  margin: 0.3rem 0 0;
  color: #111111;
  font-size: 0.9rem;
  font-weight: var(--font-weight-emphasis);
  line-height: 1.5;
}

.conference-brief__delivery {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: clamp(2rem, 5vw, 5.5rem);
  border-top: 1px solid #d9d5cc;
  padding: clamp(1.35rem, 2.6vw, 2.1rem) 0;
}

.conference-delivery {
  min-width: 0;
}

.conference-delivery__headline {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1.5rem;
}

.conference-delivery__headline h3 {
  margin: 0.45rem 0 0;
  color: #111111;
  font-size: clamp(1.4rem, 2.25vw, 2rem);
  font-weight: var(--font-weight-heading);
  letter-spacing: -0.035em;
  line-height: 1.1;
}

.conference-delivery__headline h3 strong {
  color: #e8117f;
}

.conference-delivery__percent {
  margin: 0;
  color: #111111;
  font-family: var(--font-mono), monospace;
  font-size: 0.72rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.conference-delivery__progress {
  height: 4px;
  margin-top: 0.8rem;
  overflow: hidden;
  border-radius: 999px;
  background: #e4e0d7;
}

.conference-delivery__progress span {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: #e8117f;
  transform-origin: left center;
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.conference-delivery__signals {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 1rem;
  margin-top: 0.75rem;
  color: #666666;
  font-family: var(--font-mono), monospace;
  font-size: 0.58rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.conference-delivery__attention {
  color: #e8117f;
}

.conference-brief__primary-action {
  display: inline-flex;
  min-height: 3rem;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  border: 2px solid #111111;
  border-radius: 6px;
  background: #e8117f;
  padding: 0.7rem 1rem;
  color: #ffffff;
  box-shadow: 2px 2px 0 #111111;
  font-family: var(--font-mono), monospace;
  font-size: 0.68rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}

.conference-dependencies {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1.5rem 3rem;
  border-top: 1px solid #d9d5cc;
  padding: clamp(1.35rem, 2.6vw, 2.1rem) 0;
}

.conference-dependencies__heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.conference-dependencies__heading h3 {
  margin: 0.4rem 0 0;
  color: #111111;
  font-size: clamp(1.15rem, 1.8vw, 1.45rem);
  font-weight: var(--font-weight-heading);
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.conference-dependencies__action {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  border-bottom: 1px solid #a8a49a;
  color: #111111;
  font-family: var(--font-mono), monospace;
  font-size: 0.62rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}

.conference-dependencies__summary {
  grid-column: 1 / -1;
  max-width: 74ch;
  margin: -0.7rem 0 0;
  color: #555555;
  font-size: 0.9rem;
  font-weight: var(--font-weight-emphasis);
  line-height: 1.55;
}

.conference-dependencies__follow-up {
  margin-left: 0.25rem;
}

.conference-dependencies__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  margin: 0;
  border: 1px solid #d9d5cc;
  background: #fffdf6;
}

.conference-dependencies__metrics > div {
  min-width: 4.5rem;
  padding: 0.8rem 1rem;
}

.conference-dependencies__metrics > div + div {
  border-left: 1px solid #d9d5cc;
}

.conference-dependencies__metrics dt,
.conference-dependency-node__label {
  color: #646464;
  font-family: var(--font-mono), monospace;
  font-size: 0.54rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.conference-dependencies__metrics dd {
  margin: 0.25rem 0 0;
  color: #111111;
  font-size: 1.3rem;
  font-weight: var(--font-weight-heading);
  letter-spacing: -0.04em;
  line-height: 1;
}

.conference-dependency-graph {
  display: grid;
  grid-column: 2;
  gap: 0.65rem;
  min-width: min(100%, 28rem);
}

.conference-dependencies__clear-paths {
  grid-column: 2;
  align-self: start;
  max-width: 28rem;
  margin: 0;
  border-left: 3px solid #f8e53b;
  background: #fffdf6;
  padding: 0.85rem 1rem;
  color: #555555;
  font-size: 0.82rem;
  font-weight: var(--font-weight-emphasis);
  line-height: 1.5;
}

.conference-dependency-path {
  display: grid;
  grid-template-columns: minmax(8rem, 1fr) auto minmax(9rem, 1.15fr);
  align-items: stretch;
  gap: 0.7rem;
}

.conference-dependency-node,
.conference-dependency-dependents {
  display: grid;
  align-content: start;
  gap: 0.32rem;
  border: 1px solid #d9d5cc;
  background: #fffdf6;
  padding: 0.72rem 0.8rem;
}

.conference-dependency-node {
  border-left: 3px solid #e8117f;
}

.conference-dependency-node strong {
  color: #111111;
  font-size: 0.78rem;
  font-weight: var(--font-weight-heading);
  line-height: 1.25;
}

.conference-dependency-node > span:last-child {
  color: #666666;
  font-family: var(--font-mono), monospace;
  font-size: 0.52rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.conference-dependency-path__arrow {
  align-self: center;
  color: #e8117f;
  font-size: 1rem;
  font-weight: 700;
}

.conference-dependency-dependent {
  color: #333333;
  font-size: 0.72rem;
  font-weight: var(--font-weight-emphasis);
  line-height: 1.3;
}

.conference-dependency-dependent--more {
  color: #e8117f;
  font-family: var(--font-mono), monospace;
  font-size: 0.58rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.conference-dependencies__empty {
  display: flex;
  grid-column: 1 / -1;
  align-items: flex-start;
  gap: 0.85rem;
  border: 1px dashed #b8b2a8;
  background: #fffdf6;
  padding: 0.9rem 1rem;
}

.conference-dependencies__empty-mark {
  display: grid;
  width: 1.55rem;
  height: 1.55rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #111111;
  border-radius: 50%;
  color: #e8117f;
  font-weight: 700;
}

.conference-dependencies__empty p {
  max-width: 72ch;
  margin: 0;
  color: #646464;
  font-size: 0.86rem;
  font-weight: var(--font-weight-emphasis);
  line-height: 1.55;
}

.conference-dependencies__empty strong {
  color: #111111;
}

.conference-workload {
  border-top: 1px solid #d9d5cc;
  padding: clamp(1.35rem, 2.6vw, 2.1rem) 0;
}

.conference-workload__heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.conference-workload__heading h3 {
  margin: 0.4rem 0 0;
  color: #111111;
  font-size: clamp(1.15rem, 1.8vw, 1.45rem);
  font-weight: var(--font-weight-heading);
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.conference-workload__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.7rem;
  margin-top: 1rem;
}

.conference-workload__person {
  display: block;
  min-width: 0;
  border: 1px solid #d9d5cc;
  border-radius: 6px;
  background: #fffdf6;
  color: inherit;
  padding: 0.85rem 0.9rem;
  text-decoration: none;
  transition:
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.conference-workload__person-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.conference-workload__person-heading p {
  min-width: 0;
  margin: 0;
  color: #111111;
  overflow: hidden;
  font-size: 0.86rem;
  font-weight: var(--font-weight-heading);
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conference-workload__person-heading span,
.conference-workload__detail {
  margin: 0;
  font-family: var(--font-mono), monospace;
  font-size: 0.58rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.conference-workload__person-heading span {
  flex: 0 0 auto;
  color: #e8117f;
}

.conference-workload__meter {
  height: 4px;
  margin-top: 0.75rem;
  overflow: hidden;
  border-radius: 999px;
  background: #e4e0d7;
}

.conference-workload__meter span {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: #111111;
  transform-origin: left center;
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.conference-workload__detail {
  margin-top: 0.55rem;
  color: #666666;
}

.conference-workload__open {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.8rem;
  color: #111111;
  font-family: var(--font-mono), monospace;
  font-size: 0.54rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.conference-workload__open span {
  color: #e8117f;
  font-size: 0.8rem;
  line-height: 0;
  transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.conference-workload__empty {
  margin: 0.9rem 0 0;
  color: #646464;
  font-size: 0.86rem;
  font-weight: var(--font-weight-emphasis);
  line-height: 1.55;
}

.conference-brief__action-arrow {
  display: inline-block;
  transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.conference-facts-popover-enter-active {
  transition:
    opacity 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.conference-facts-popover-leave-active {
  transition:
    opacity 120ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.conference-facts-popover-enter-from,
.conference-facts-popover-leave-to {
  opacity: 0;
  transform: translate3d(0, -4px, 0) scale(0.985);
}

@media (hover: hover) and (pointer: fine) {
  .conference-notes__trigger:hover,
  .conference-dependencies__action:hover {
    color: #111111;
    border-bottom-color: #111111;
  }

  .conference-brief__primary-action:hover {
    transform: translate3d(0, -1px, 0);
  }

  .conference-brief__primary-action:hover .conference-brief__action-arrow,
  .conference-dependencies__action:hover .conference-brief__action-arrow {
    transform: translate3d(3px, 0, 0);
  }

  .conference-workload__person:hover {
    border-color: #111111;
    transform: translate3d(0, -2px, 0);
  }

  .conference-workload__person:hover .conference-workload__open span {
    transform: translate3d(3px, 0, 0);
  }
}

@media (max-width: 760px) {
  .conference-brief__masthead {
    grid-template-columns: 1fr;
    align-items: start;
    gap: 1.5rem;
  }

  .conference-brief__date h1 {
    max-width: none;
    font-size: clamp(2.15rem, 9vw, 3.4rem);
  }

  .conference-notes {
    justify-self: start;
  }

  .conference-notes__popover {
    right: auto;
    left: 0;
  }

  .conference-brief__delivery {
    grid-template-columns: 1fr;
    gap: 1.3rem;
  }

  .conference-brief__primary-action {
    width: fit-content;
  }

  .conference-workload__heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .conference-dependencies {
    grid-template-columns: 1fr;
  }

  .conference-dependency-graph {
    grid-column: auto;
    min-width: 0;
  }

  .conference-dependencies__clear-paths {
    grid-column: auto;
    max-width: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .conference-facts-popover-enter-active,
  .conference-facts-popover-leave-active,
  .conference-notes__chevron,
  .conference-delivery__progress span,
  .conference-workload__meter span,
  .conference-workload__person,
  .conference-workload__open span,
  .conference-brief__action-arrow {
    transition-duration: 1ms;
  }

  .conference-facts-popover-enter-from,
  .conference-facts-popover-leave-to,
  .conference-notes__chevron--open {
    transform: none;
  }
}
</style>
