<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import AppDropdown from "@/src/components/AppDropdown.vue";
import { fetchJson } from "@/src/lib/api";
import { notify } from "@/src/lib/notify";

type ReviewStatus = "unreviewed" | "reviewed" | "needs_follow_up";
type Decision = "pending" | "accepted" | "not_selected";
type Recipient = {
  id: string;
  name: string;
  email: string;
  submitted_at: string | null;
  motivation: string | null;
  can_attend_accra: boolean | null;
  review_status: ReviewStatus;
  review_note: string | null;
  decision: Decision;
  decision_version: number;
  outcome_sent: boolean;
  invitation_sent: boolean;
};

const queryClient = useQueryClient();
const props = defineProps<{ sessionIdentity: string }>();
const reviewQueryKey = computed(() => [
  "annual-conference",
  "2026",
  "volunteer-reviews",
  props.sessionIdentity,
]);
const query = useQuery({
  queryKey: reviewQueryKey,
  queryFn: () =>
    fetchJson<{ recipients: Recipient[] }>(
      "/api/annual-conference/2026/volunteer-follow-up/reviews",
      { credentials: "include" },
    ),
});
const recipients = computed(() => query.data.value?.recipients ?? []);
const search = ref("");
const statusFilter = ref<"all" | ReviewStatus>("all");
const answerFilter = ref<"all" | "submitted" | "awaiting">("submitted");
const page = ref(1);
const pageSize = 10;
const selectedId = ref<string | null>(null);
const selected = computed(
  () => recipients.value.find((item) => item.id === selectedId.value) ?? null,
);
const drawer = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const reviewStatus = ref<ReviewStatus>("unreviewed");
const reviewNote = ref("");
const decision = ref<Decision>("pending");
const pageCount = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / pageSize)),
);
const filtered = computed(() =>
  recipients.value.filter((item) => {
    const term = search.value.trim().toLowerCase();
    const matchesSearch =
      !term ||
      `${item.name} ${item.email} ${item.motivation ?? ""}`
        .toLowerCase()
        .includes(term);
    const matchesAnswer =
      answerFilter.value === "all" ||
      (answerFilter.value === "submitted"
        ? Boolean(item.submitted_at)
        : !item.submitted_at);
    const matchesReview =
      statusFilter.value === "all" ||
      (Boolean(item.submitted_at) && item.review_status === statusFilter.value);

    return matchesSearch && matchesAnswer && matchesReview;
  }),
);
const visible = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);
const options = [
  { value: "all", label: "All" },
  { value: "unreviewed", label: "Unreviewed" },
  { value: "reviewed", label: "Reviewed" },
  { value: "needs_follow_up", label: "Needs follow-up" },
];
const decisionOptions = [
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "not_selected", label: "Not selected" },
];
const mutation = useMutation({
  mutationFn: (input: {
    id: string;
    status: ReviewStatus;
    note: string;
    decision: Decision;
    expectedVersion: number;
    sessionIdentity: string;
  }) =>
    fetchJson<{ recipient: Recipient }>(
      `/api/annual-conference/2026/volunteer-follow-up/recipients/${encodeURIComponent(input.id)}/review`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: input.status,
          note: input.note,
          decision: input.decision,
          expected_version: input.expectedVersion,
        }),
      },
    ),
  onSuccess: async ({ recipient }, variables) => {
    const identityQueryKey = [
      "annual-conference",
      "2026",
      "volunteer-reviews",
      variables.sessionIdentity,
    ];

    queryClient.setQueryData<{ recipients: Recipient[] }>(
      identityQueryKey,
      (current) =>
        current
          ? {
              recipients: current.recipients.map((item) =>
                item.id === recipient.id ? recipient : item,
              ),
            }
          : current,
    );
    await queryClient.invalidateQueries({ queryKey: identityQueryKey });
    notify.success("Review saved.");
  },
});
const statusLabel = (status: ReviewStatus) =>
  status === "needs_follow_up"
    ? "Needs follow-up"
    : status === "reviewed"
      ? "Reviewed"
      : "Unreviewed";
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
let previousFocus: HTMLElement | null = null;
let previousBodyOverflow = "";
let previousDocumentOverflow = "";
let drawerLocked = false;

watch([search, statusFilter, answerFilter], () => {
  page.value = 1;
});
watch(pageCount, (count) => {
  page.value = Math.min(page.value, count);
});
watch(selectedId, async (id, previousId) => {
  mutation.reset();
  const recipient = selected.value;

  reviewStatus.value = recipient?.review_status ?? "unreviewed";
  reviewNote.value = recipient?.review_note ?? "";
  decision.value = recipient?.decision ?? "pending";
  if (id && previousId) return;
  if (id) {
    previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    previousBodyOverflow = document.body.style.overflow;
    previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    drawerLocked = true;
    document.addEventListener("keydown", onKeydown);
    await nextTick();
    closeButton.value?.focus();
  } else {
    unlockDrawer();
  }
});
watch(
  () => props.sessionIdentity,
  () => {
    selectedId.value = null;
  },
);
watch(
  () => selected.value?.id,
  (id) => {
    if (!id && selectedId.value) selectedId.value = null;
  },
);

function unlockDrawer() {
  if (!drawerLocked) return;
  document.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = previousBodyOverflow;
  document.documentElement.style.overflow = previousDocumentOverflow;
  previousFocus?.focus();
  previousFocus = null;
  drawerLocked = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    const openDropdown = document.querySelector(
      'button[aria-haspopup="listbox"][aria-expanded="true"]',
    );

    if (event.defaultPrevented || openDropdown) return;
    selectedId.value = null;

    return;
  }

  if (event.key !== "Tab" || !drawer.value) return;
  const focusable = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.reviews-drawer button, .reviews-drawer input, .reviews-drawer textarea, .reviews-drawer [tabindex]:not([tabindex="-1"]), .app-dropdown-menu [role="option"]',
    ),
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") && element.getClientRects().length > 0,
  );
  const first = focusable[0];
  const last = focusable.at(-1);

  if (!first || !last) {
    event.preventDefault();
    drawer.value.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function saveReview() {
  if (!selected.value?.submitted_at) return;
  mutation.mutate({
    id: selected.value.id,
    status: reviewStatus.value,
    note: reviewNote.value,
    decision: decision.value,
    expectedVersion: selected.value.decision_version,
    sessionIdentity: props.sessionIdentity,
  });
}

onBeforeUnmount(() => {
  selectedId.value = null;
  unlockDrawer();
});
</script>

<template>
  <section
    class="reviews-panel"
    aria-label="Volunteer reviews"
    :aria-busy="query.isPending.value"
  >
    <header class="reviews-header">
      <div>
        <span class="reviews-eyebrow">Annual Conference · 2026</span>
        <h2>Volunteer reviews</h2>
        <p>
          Read submitted motivation and availability, then record the team’s
          review.
        </p>
      </div>
      <span class="reviews-count">{{ recipients.length }} applicants</span>
    </header>

    <div
      v-if="query.isPending.value"
      class="reviews-skeleton"
      role="status"
      aria-label="Loading volunteer reviews"
    >
      <i /><i /><i /><i />
    </div>
    <div
      v-else-if="query.isError.value"
      class="reviews-state reviews-state--error"
      role="alert"
    >
      <h3>Reviews are unavailable</h3>
      <p>We couldn’t load volunteer responses. Refresh to try again.</p>
    </div>
    <div v-else-if="!recipients.length" class="reviews-state">
      <h3>No responses yet</h3>
      <p>Submitted volunteer answers will appear here.</p>
    </div>
    <template v-else>
      <div class="reviews-toolbar">
        <label class="reviews-search"
          ><span class="sr-only">Search applicants</span
          ><input
            v-model="search"
            type="search"
            placeholder="Search name, email, or motivation"
        /></label>
        <AppDropdown
          v-model="answerFilter"
          :options="[
            { value: 'submitted', label: 'Submitted' },
            { value: 'awaiting', label: 'Awaiting' },
            { value: 'all', label: 'All applicants' },
          ]"
          density="compact"
          aria-label="Filter by response status"
        />
        <AppDropdown
          v-model="statusFilter"
          :options="options"
          density="compact"
          aria-label="Filter by review status"
        />
      </div>
      <div v-if="!filtered.length" class="reviews-state">
        <h3>No matches</h3>
        <p>Try a different search or review status.</p>
      </div>
      <div v-else class="reviews-list">
        <button
          v-for="recipient in visible"
          :key="recipient.id"
          class="reviews-row"
          type="button"
          @click="selectedId = recipient.id"
        >
          <span class="reviews-person"
            ><strong>{{ recipient.name }}</strong
            ><small>{{ recipient.email }}</small></span
          >
          <span
            class="reviews-status"
            :class="`reviews-status--${recipient.review_status}`"
            >{{
              recipient.submitted_at
                ? statusLabel(recipient.review_status)
                : "Awaiting answer"
            }}</span
          >
          <span class="reviews-invitation"
            >Invitation
            <strong>{{
              recipient.invitation_sent ? "Sent" : "Not sent"
            }}</strong></span
          >
          <span class="reviews-submitted">{{
            recipient.submitted_at
              ? formatDate(recipient.submitted_at)
              : "Awaiting response"
          }}</span>
          <span aria-hidden="true" class="reviews-chevron">›</span>
        </button>
      </div>
      <nav
        v-if="filtered.length > pageSize"
        class="reviews-pagination"
        aria-label="Review pages"
      >
        <button type="button" :disabled="page <= 1" @click="page -= 1">
          Previous</button
        ><span>Page {{ page }} of {{ pageCount }}</span
        ><button type="button" :disabled="page >= pageCount" @click="page += 1">
          Next
        </button>
      </nav>
    </template>

    <Teleport to="body">
      <Transition name="reviews-drawer">
        <div
          v-if="selected"
          class="reviews-backdrop"
          role="presentation"
          @click.self="selectedId = null"
        >
          <aside
            ref="drawer"
            class="reviews-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reviews-drawer-title"
            tabindex="-1"
          >
            <header>
              <div>
                <span class="reviews-eyebrow">{{
                  selected.submitted_at ? "Submitted response" : "Applicant"
                }}</span>
                <h3 id="reviews-drawer-title">{{ selected.name }}</h3>
                <p>{{ selected.email }}</p>
              </div>
              <button
                ref="closeButton"
                type="button"
                aria-label="Close review"
                @click="selectedId = null"
              >
                ×
              </button>
            </header>
            <div class="reviews-drawer-body">
              <div class="reviews-meta" aria-label="Application status">
                <span v-if="selected.submitted_at"
                  >Submitted {{ formatDate(selected.submitted_at) }}</span
                >
                <span v-else>Awaiting answer</span>
                <span
                  v-if="selected.submitted_at"
                  class="reviews-status"
                  :class="`reviews-status--${selected.review_status}`"
                  >{{ statusLabel(selected.review_status) }}</span
                >
                <span class="reviews-invitation"
                  >Invitation
                  <strong>{{
                    selected.invitation_sent ? "Sent" : "Not sent"
                  }}</strong></span
                >
                <span class="reviews-invitation"
                  >Outcome
                  <strong>{{ selected.outcome_sent ? "Sent" : "Not sent" }}</strong></span
                >
              </div>
              <section class="reviews-answer">
                <h4 class="editorial-label">
                  Why would you like to volunteer?
                </h4>
                <p>{{ selected.motivation || "No answer provided." }}</p>
              </section>
              <section class="reviews-answer">
                <h4 class="editorial-label">
                  Can you come to Accra and volunteer on 19 December without
                  travel support?
                </h4>
                <p>
                  {{
                    selected.can_attend_accra === null
                      ? "Not answered"
                      : selected.can_attend_accra
                        ? "Yes"
                        : "No"
                  }}
                </p>
              </section>
              <template v-if="selected.submitted_at">
                <label class="reviews-field"
                  ><span class="editorial-label">Selection decision</span
                  ><AppDropdown
                    v-model="decision"
                    :options="decisionOptions"
                    density="compact"
                    :teleport="true"
                    aria-label="Volunteer selection decision"
                /></label>
                <label class="reviews-field"
                  ><span class="editorial-label">Review status</span
                  ><AppDropdown
                    v-model="reviewStatus"
                    :options="options.slice(1)"
                    density="compact"
                    :teleport="true"
                    aria-label="Review status"
                /></label>
                <label class="reviews-field"
                  ><span class="editorial-label">Review note</span
                  ><textarea
                    v-model="reviewNote"
                    class="app-form-control"
                    maxlength="1000"
                    rows="4"
                    placeholder="Optional note for the team"
                  />
                </label>
              </template>
            </div>
            <footer v-if="selected.submitted_at" class="reviews-drawer-footer">
              <button
                class="reviews-save"
                type="button"
                :disabled="mutation.isPending.value"
                @click="saveReview"
                >
                {{ mutation.isPending.value ? "Saving…" : "Save review" }}
              </button>
              <p class="reviews-save-hint">
                Saving records the review and decision. It never sends an email.
              </p>
              <p
                v-if="mutation.isError.value"
                class="reviews-save-error"
                role="alert"
              >
                {{ mutation.error.value instanceof Error ? mutation.error.value.message : "Unable to save this review. Try again." }}
              </p>
            </footer>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.reviews-panel {
  color: #25231f;
}
.reviews-header,
.reviews-toolbar,
.reviews-row,
.reviews-row > *,
.reviews-pagination,
.reviews-drawer > header {
  display: flex;
}
.reviews-header {
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.4rem 1.5rem;
  border: 1px solid #dedbd4;
  border-radius: 8px 8px 0 0;
  background: #fff;
}
.reviews-eyebrow {
  color: #bb145e;
  font:
    700 0.68rem/1.3 var(--font-mono),
    monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.reviews-header h2,
.reviews-drawer h3 {
  margin: 0.35rem 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}
.reviews-header p,
.reviews-drawer header p {
  margin: 0.25rem 0 0;
  color: #69665f;
  font-size: 0.88rem;
}
.reviews-count {
  padding: 0.45rem 0.7rem;
  border-radius: 99px;
  background: #f4f1ea;
  color: #59564f;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}
.reviews-skeleton {
  display: grid;
  gap: 0.6rem;
  padding: 1rem;
  border: 1px solid #dedbd4;
  border-top: 0;
  background: #fff;
}
.reviews-skeleton i {
  height: 3.6rem;
  border-radius: 6px;
  background: #f1eee8;
}
.reviews-state {
  padding: 3rem 1rem;
  border: 1px solid #dedbd4;
  border-top: 0;
  background: #fff;
  text-align: center;
}
.reviews-state h3 {
  margin: 0;
  font-size: 1rem;
}
.reviews-state p {
  color: #69665f;
  font-size: 0.9rem;
}
.reviews-state--error {
  color: #8b2d2d;
}
.reviews-toolbar {
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid #dedbd4;
  border-top: 0;
  background: #faf9f6;
}
.reviews-search {
  flex: 1;
}
.reviews-search input,
.reviews-field textarea {
  width: 100%;
  min-height: 2.65rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid #d7d3ca;
  border-radius: 6px;
  background: #fff;
  color: inherit;
}
.reviews-list {
  border: 1px solid #dedbd4;
  border-top: 0;
  background: #fff;
}
.reviews-row {
  width: 100%;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border: 0;
  border-top: 1px solid #eeece7;
  background: #fff;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.reviews-row:hover {
  background: #faf9f6;
}
.reviews-person {
  min-width: 12rem;
  flex: 1;
  flex-direction: column;
  gap: 0.2rem;
}
.reviews-person strong {
  font-size: 0.92rem;
}
.reviews-person small,
.reviews-submitted {
  color: #777269;
  font-size: 0.78rem;
}
.reviews-status {
  padding: 0.35rem 0.55rem;
  border-radius: 5px;
  background: #f2f0eb;
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
}
.reviews-status--reviewed {
  background: #e9f4ec;
  color: #28623c;
}
.reviews-status--needs_follow_up {
  background: #fff2da;
  color: #80571b;
}
.reviews-invitation {
  gap: 0.3rem;
  color: #777269;
  font-size: 0.75rem;
  white-space: nowrap;
}
.reviews-invitation strong {
  color: #38362f;
}
.reviews-chevron {
  color: #777269;
  font-size: 1.4rem;
}
.reviews-pagination {
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
}
.reviews-pagination button,
.reviews-drawer > header button {
  min-height: 2.5rem;
  padding: 0.45rem 0.75rem;
  border: 1px solid #d7d3ca;
  border-radius: 6px;
  background: #fff;
  color: inherit;
  cursor: pointer;
}
.reviews-pagination button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.reviews-backdrop {
  position: fixed;
  z-index: 80;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: rgb(25 24 22 / 35%);
}
.reviews-drawer {
  display: flex;
  width: min(34rem, 100%);
  height: 100%;
  min-height: 0;
  flex-direction: column;
  background: #fff;
  box-shadow: -12px 0 40px rgb(0 0 0 / 12%);
}
.reviews-drawer > header {
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1.4rem;
  border-bottom: 1px solid #e6e3dc;
}
.reviews-drawer > header button {
  width: 2.75rem;
  min-height: 2.75rem;
  padding: 0;
  font-size: 1.25rem;
}
.reviews-drawer-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 1.25rem 1.4rem 2rem;
}
.reviews-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid #e6e3dc;
  color: #777269;
  font-size: 0.8rem;
}
.reviews-meta > span:first-child {
  margin-right: auto;
}
.reviews-answer {
  padding: 1rem 0;
  border-bottom: 1px solid #e6e3dc;
}
.reviews-answer h4 {
  margin: 0 0 0.5rem;
  color: #bb145e;
  font-size: 0.7rem;
}
.reviews-answer p {
  margin: 0;
  color: #25231f;
  font-size: 0.96rem;
  line-height: 1.55;
  white-space: pre-wrap;
}
.reviews-field {
  display: grid;
  gap: 0.5rem;
  margin-top: 1rem;
  font-size: 0.82rem;
  font-weight: 400;
}
.reviews-field .editorial-label {
  color: #bb145e;
  font-size: 0.7rem;
}
.reviews-field textarea {
  resize: vertical;
}
.reviews-drawer-footer {
  flex: none;
  padding: 0.85rem 1.4rem max(1rem, env(safe-area-inset-bottom));
  border-top: 1px solid #e6e3dc;
  background: #fff;
}
.reviews-save {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.65rem 1rem;
  border: 1px solid #a80d58;
  border-radius: 6px;
  background: #c80d68;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
.reviews-save:active,
.reviews-drawer > header button:active {
  transform: scale(0.97);
}
.reviews-save:disabled {
  opacity: 0.6;
  cursor: wait;
}
.reviews-save-error {
  margin: 0.6rem 0 0;
  color: #9e3131;
  font-size: 0.82rem;
}
.reviews-drawer :focus-visible {
  outline: 2px solid #c80d68;
  outline-offset: 2px;
}
.reviews-drawer-enter-active,
.reviews-drawer-leave-active {
  transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.reviews-drawer-enter-active .reviews-drawer,
.reviews-drawer-leave-active .reviews-drawer {
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.reviews-drawer-enter-from,
.reviews-drawer-leave-to {
  opacity: 0;
}
.reviews-drawer-enter-from .reviews-drawer,
.reviews-drawer-leave-to .reviews-drawer {
  transform: translateX(1rem);
}
@media (max-width: 680px) {
  .reviews-header {
    padding: 1rem;
  }
  .reviews-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .reviews-row {
    flex-wrap: wrap;
    gap: 0.5rem 0.8rem;
    padding: 0.9rem;
  }
  .reviews-person {
    min-width: calc(100% - 2rem);
  }
  .reviews-submitted {
    margin-left: auto;
  }
  .reviews-drawer {
    width: 100%;
  }
  .reviews-drawer-footer {
    padding-right: 1rem;
    padding-left: 1rem;
  }
}
@media (hover: hover) and (pointer: fine) {
  .reviews-save:hover:not(:disabled) {
    background: #a80d58;
  }
}
@media (prefers-reduced-motion: reduce) {
  .reviews-drawer-enter-active,
  .reviews-drawer-leave-active,
  .reviews-drawer-enter-active .reviews-drawer,
  .reviews-drawer-leave-active .reviews-drawer {
    transition: none;
  }
  .reviews-drawer-enter-from .reviews-drawer,
  .reviews-drawer-leave-to .reviews-drawer {
    transform: none;
  }
  .reviews-save,
  .reviews-drawer > header button {
    transition: none;
  }
  .reviews-save:active,
  .reviews-drawer > header button:active {
    transform: none;
  }
}
</style>
