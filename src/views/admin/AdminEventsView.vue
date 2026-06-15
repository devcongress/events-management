<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ViewSkeleton from '@/src/components/ui/ViewSkeleton.vue';
import type { Event, EventStatus } from '@/types';
import { adminPath } from '@/src/admin-routes';

const route = useRoute();
const router = useRouter();
const events = ref<Event[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const form = reactive({
  name: '',
  description: '',
  event_date: '',
  end_date: '',
  slug: '',
  cover: '',
  registration_url: '',
  location_name: 'Accra, Ghana',
  location_url: '',
  publish_to_website: true,
});
const page = ref(1);
const pageSize = 6;
const lifecycleStages: Array<{
  status: EventStatus;
  label: string;
  description: string;
  organizerMove: string;
  actionLabel: string;
}> = [
  {
    status: 'draft',
    label: 'Draft',
    description: 'Create the month and rough event shape.',
    organizerMove: 'Set date, description, and internal plan.',
    actionLabel: 'Set up',
  },
  {
    status: 'cfp_open',
    label: 'Submissions open',
    description: 'Speakers can submit talk ideas.',
    organizerMove: 'Share the speaker submission link and invite speakers.',
    actionLabel: 'Promote',
  },
  {
    status: 'cfp_closed',
    label: 'Submissions closed',
    description: 'New talk ideas are no longer accepted.',
    organizerMove: 'Review talks and decide the program.',
    actionLabel: 'Review talks',
  },
  {
    status: 'upcoming',
    label: 'Program set',
    description: 'Talks, speakers, and event basics are mostly ready.',
    organizerMove: 'Confirm speakers, quiz, venue, and comms.',
    actionLabel: 'Prepare',
  },
  {
    status: 'live',
    label: 'Live',
    description: 'The event is happening now.',
    organizerMove: 'Run the room and host live activities.',
    actionLabel: 'Run event',
  },
  {
    status: 'completed',
    label: 'Completed',
    description: 'The meetup has happened.',
    organizerMove: 'Review attendance and collect feedback.',
    actionLabel: 'Review',
  },
];

const creating = computed(() => route.path.endsWith('/new'));
const pageCount = computed(() => Math.max(1, Math.ceil(events.value.length / pageSize)));
const paginatedEvents = computed(() => events.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const pageStart = computed(() => (events.value.length === 0 ? 0 : (page.value - 1) * pageSize + 1));
const pageEnd = computed(() => Math.min(events.value.length, page.value * pageSize));

async function fetchEvents() {
  const response = await fetch('/api/events');
  if (response.ok) {
    events.value = (await response.json()).sort((a: Event, b: Event) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
    page.value = Math.min(page.value, pageCount.value);
  }
  loading.value = false;
}

async function createNewEvent() {
  saving.value = true;
  error.value = null;
  const locationName = form.location_name.trim();
  const payload = {
    name: form.name,
    description: form.description,
    event_date: form.event_date,
    end_date: form.end_date || null,
    slug: form.slug.trim() || null,
    cover: form.cover.trim() || null,
    registration_url: form.registration_url.trim() || null,
    location: locationName
      ? {
        label: locationName,
        name: locationName,
        url: form.location_url.trim() || null,
      }
      : null,
    publish_to_website: form.publish_to_website,
  };
  const response = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    const event = await response.json();
    await router.push(adminPath(`events/${event.id}`));
  } else {
    const data = await response.json();
    error.value = data.error || 'Failed to create event';
  }
  saving.value = false;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatEventMonth(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(value));
}

function statusMeta(status: string) {
  return lifecycleStages.find((stage) => stage.status === status) ?? lifecycleStages[0];
}

function lifecycleIndex(status: string): number {
  const index = lifecycleStages.findIndex((stage) => stage.status === status);
  return index === -1 ? 0 : index;
}

function statusActionLabel(status: string): string {
  return statusMeta(status).actionLabel;
}

function statusActionPath(event: Event): string {
  const subsectionByStatus: Record<EventStatus, string> = {
    draft: 'speakers',
    cfp_open: 'speakers',
    cfp_closed: 'talks',
    upcoming: 'quiz',
    live: 'quiz/live',
    completed: 'attendance',
  };

  return adminPath(`events/${event.id}/${subsectionByStatus[event.status]}`);
}

function goToPage(nextPage: number) {
  page.value = Math.min(pageCount.value, Math.max(1, nextPage));
}

onMounted(fetchEvents);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <template v-if="creating">
        <div class="editorial-header">
          <p class="editorial-eyebrow">organizer</p>
          <h1 class="editorial-title">Create New Event</h1>
        </div>
        <form class="editorial-panel relative space-y-5 overflow-hidden p-6" @submit.prevent="createNewEvent">
          <div class="absolute right-0 top-0 size-16 border-b-2 border-l-2 border-dc-yellow/20" />
          <div v-if="error" class="rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ error }}</div>
          <div>
            <label class="editorial-label">Name</label>
            <input v-model="form.name" required class="editorial-input font-mono" />
          </div>
          <div>
            <label class="editorial-label">Date</label>
            <input v-model="form.event_date" required type="date" class="editorial-input font-mono" />
          </div>
          <div>
            <label class="editorial-label">End date</label>
            <input v-model="form.end_date" type="date" class="editorial-input font-mono" />
          </div>
          <div>
            <label class="editorial-label">Description</label>
            <textarea v-model="form.description" rows="4" class="editorial-input font-mono" />
          </div>
          <div class="grid gap-5 md:grid-cols-2">
            <div>
              <label class="editorial-label">Website slug</label>
              <input v-model="form.slug" class="editorial-input font-mono" placeholder="devcon-comm-august-2026" />
            </div>
            <div>
              <label class="editorial-label">Cover image path</label>
              <input v-model="form.cover" class="editorial-input font-mono" placeholder="/images/apr-meetup.jpg" />
            </div>
            <div>
              <label class="editorial-label">Location</label>
              <input v-model="form.location_name" class="editorial-input font-mono" />
            </div>
            <div>
              <label class="editorial-label">Location URL</label>
              <input v-model="form.location_url" class="editorial-input font-mono" placeholder="https://maps.google.com/..." />
            </div>
            <div class="md:col-span-2">
              <label class="editorial-label">Registration URL</label>
              <input v-model="form.registration_url" class="editorial-input font-mono" placeholder="https://lu.ma/..." />
            </div>
          </div>
          <label class="flex items-start gap-3 rounded-lg border border-dc-border bg-dc-paper-warm px-4 py-3">
            <input v-model="form.publish_to_website" type="checkbox" class="mt-1 size-4 accent-dc-yellow" />
            <span>
              <span class="block font-mono text-xs font-bold uppercase text-dc-ink">Publish through website API</span>
              <span class="mt-1 block text-sm leading-5 text-dc-gray">Include this event in <code>/api/public/meetups</code> once Supabase is the source of truth.</span>
            </span>
          </label>
          <div class="flex gap-3">
            <button type="submit" :disabled="saving" class="editorial-action disabled:opacity-60">{{ saving ? 'CREATING...' : 'CREATE EVENT' }}</button>
            <RouterLink :to="adminPath('events')" class="editorial-secondary-action">CANCEL</RouterLink>
          </div>
        </form>
      </template>

      <template v-else>
        <div class="editorial-header flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="editorial-eyebrow">organizer</p>
            <h1 class="editorial-title">Event Management</h1>
            <p class="editorial-subtitle">Create events, move them through the program lifecycle, and jump into talk, speaker, or quiz operations.</p>
          </div>
          <RouterLink :to="adminPath('events/new')" class="editorial-action shrink-0 self-start sm:self-auto">CREATE EVENT</RouterLink>
        </div>

        <ViewSkeleton v-if="loading" variant="table" :rows="6" />
        <template v-else>
          <section class="mb-6 overflow-hidden rounded-lg border border-dc-border bg-dc-paper shadow-[0_1px_0_rgba(17,17,17,0.08)]">
            <div class="border-b border-dc-border bg-dc-paper-warm px-5 py-4">
              <p class="editorial-eyebrow mb-1">monthly event lifecycle</p>
              <h2 class="text-2xl font-black tracking-tight text-dc-ink">From idea to post-event readout</h2>
              <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">Use this as the status key. Event rows only show where each month is and the action to take.</p>
            </div>
            <div class="grid gap-2 px-5 py-4 md:grid-cols-3 xl:grid-cols-6">
              <div
                v-for="(stage, index) in lifecycleStages"
                :key="stage.status"
                class="rounded-md border border-dc-border bg-white px-3 py-3"
              >
                <p class="font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">Step {{ index + 1 }}</p>
                <p class="mt-1 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-pink">{{ stage.label }}</p>
              </div>
            </div>
            <div class="border-t border-dc-border bg-dc-paper-warm px-5 py-3">
              <p class="text-sm leading-6 text-dc-gray">
                <span class="font-bold text-dc-ink">Speaker submissions</span> are the talk ideas people send in for the month. After submissions close, organizers review talks, decide the program, then move the event to program set.
              </p>
            </div>
          </section>

        <div class="ops-panel overflow-hidden">
          <div class="overflow-x-auto">
            <div class="min-w-[760px]">
              <div class="ops-panel-header event-list-grid">
                <div class="ops-label">Event</div>
                <div class="ops-label">Date</div>
                <div class="ops-label">Status</div>
                <div class="ops-label text-right">Actions</div>
              </div>
              <div>
                <div v-for="event in paginatedEvents" :key="event.id" class="ops-row event-list-grid min-h-[64px]">
                  <div class="flex min-w-0 items-center">
                    <div class="min-w-0">
                      <div class="event-list-title">{{ formatEventMonth(event.event_date) }}</div>
                      <div class="event-list-meta">DevCon-Comm meetup</div>
                    </div>
                  </div>
                  <div class="event-list-date">{{ formatDate(event.event_date) }}</div>
                  <div class="event-list-status">
                    <div class="event-list-dots" :aria-label="`Step ${lifecycleIndex(event.status) + 1} of ${lifecycleStages.length}`">
                      <span
                        v-for="(_, index) in lifecycleStages"
                        :key="index"
                        class="event-list-dot"
                        :class="{
                          'event-list-dot--done': index < lifecycleIndex(event.status),
                          'event-list-dot--current': index === lifecycleIndex(event.status),
                        }"
                      />
                    </div>
                    <span class="event-list-status-label">{{ statusMeta(event.status).label }}</span>
                  </div>
                  <div class="flex items-center justify-end">
                    <RouterLink :to="statusActionPath(event)" class="font-mono text-sm font-bold uppercase text-dc-ink underline decoration-dc-yellow decoration-2 underline-offset-4 hover:text-dc-pink">{{ statusActionLabel(event.status) }} &rarr;</RouterLink>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="pagination-footer">
            <p class="pagination-summary">
              Showing {{ pageStart }}-{{ pageEnd }} of {{ events.length }}
            </p>
            <div class="pagination-controls">
              <button
                class="pagination-button"
                :disabled="page === 1"
                @click="goToPage(page - 1)"
              >
                <span aria-hidden="true">‹</span>
                Prev
              </button>
              <span class="pagination-count" aria-live="polite">
                Page {{ page }} of {{ pageCount }}
              </span>
              <button
                class="pagination-button"
                :disabled="page === pageCount"
                @click="goToPage(page + 1)"
              >
                Next
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>
        </div>
        </template>
      </template>
    </div>
  </div>
</template>
