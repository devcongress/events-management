<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import ConfirmDialog from "@/src/components/ui/ConfirmDialog.vue";
import AppDropdown from "@/src/components/AppDropdown.vue";
import AppDatePicker from "@/src/components/ui/AppDatePicker.vue";
import VolunteerOutcomeCampaignPanel from "@/src/components/VolunteerOutcomeCampaignPanel.vue";
import { fetchJson } from "@/src/lib/api";
import { notify } from "@/src/lib/notify";
import {
  filterVolunteerFollowUpRecipients,
  paginateVolunteerFollowUpRecipients,
  summarizeVolunteerFollowUpRecipients,
  type VolunteerFollowUpDirectoryFilter,
  type VolunteerFollowUpDirectoryRecipient,
} from "@/lib/volunteer-follow-up-directory";

const props = defineProps<{ isOwnerSession: boolean }>();
const queryClient = useQueryClient();

type Campaign = {
  status: "draft" | "running" | "paused" | "closed";
  application_deadline_at: string;
  last_drain_at: string | null;
  last_drain_reason: string | null;
  outcome_paused: boolean;
};

type Recipient = VolunteerFollowUpDirectoryRecipient & {
  id: string;
  applicant_name: string;
  applicant_email: string;
  status: string;
  submitted_at: string | null;
  motivation: string | null;
  can_attend_accra: boolean | null;
  attempt_count?: number;
  next_attempt_at?: string | null;
  last_error?: string | null;
  decision: "pending" | "accepted" | "not_selected";
  outcome_sent: boolean;
  outcome_delivery: {
    status: string;
    attempt_count: number;
    next_attempt_at: string | null;
    last_error: string | null;
    provider_email_id: string | null;
  } | null;
};

type FollowUpResponse = {
  campaign: Campaign | null;
  response_deadline?: string | null;
  recipients: Recipient[];
  can_manage?: boolean;
  email_health?: {
    daily_quota_used: number | null;
    daily_quota_limit: number;
    monthly_quota_used: number | null;
    monthly_quota_limit: number;
    last_provider_response_at: string | null;
  } | null;
};

type EmailPreview = {
  from: string;
  subject: string;
  html: string;
  text: string;
  response_deadline: string;
};

type ControlAction = "launch" | "pause" | "resume" | "close";
type RecipientFilter = VolunteerFollowUpDirectoryFilter;

const pageSize = 10;
const query = useQuery({
  queryKey: ["annual-conference", "2026", "volunteer-follow-up", "owner"],
  enabled: computed(() => props.isOwnerSession),
  queryFn: () =>
    fetchJson<FollowUpResponse>(
      "/api/annual-conference/2026/volunteer-follow-up",
      { credentials: "include" },
    ),
  refetchInterval: 60_000,
});
const campaign = computed(() => query.data.value?.campaign);
const recipients = computed(() => query.data.value?.recipients ?? []);
const isOwner = computed(() => props.isOwnerSession);
const deadlineDate = ref("2026-09-30");
const filter = ref<RecipientFilter>("all");
const search = ref("");
const page = ref(1);
const recipientFilterOptions = [
  { value: "all", label: "Everyone" },
  { value: "not_sent", label: "Not sent" },
  { value: "sent", label: "Sent" },
  { value: "responded", label: "Answered" },
  { value: "failed", label: "Delivery issues" },
];
const selectedId = ref<string | null>(null);
const selectedPanel = ref<HTMLElement | null>(null);
const selectedCloseButton = ref<HTMLButtonElement | null>(null);
const busy = ref(false);
const pendingAction = ref<ControlAction | null>(null);
const setupOpen = ref(true);
const healthOpen = ref(false);
const previewOpen = ref(false);
const previewLoading = ref(false);
const previewError = ref("");
const preview = ref<EmailPreview | null>(null);
const previewView = ref<"email" | "text">("email");
const previewDrawerPanel = ref<HTMLElement | null>(null);
const previewCloseButton = ref<HTMLButtonElement | null>(null);
const previewEmailTab = ref<HTMLButtonElement | null>(null);
let previousFocus: HTMLElement | null = null;
let previousBodyOverflow = "";
let previousDocumentOverflow = "";
let previewDrawerLocked = false;
let previewDrawerLifecycleId = 0;
let previewRequestId = 0;
let previewRequestController: AbortController | null = null;
let attachedPreviewFrameDocument: Document | null = null;
const selectedMobileDialog = ref(false);
let selectedAppWasInert = false;
let selectedPreviousFocus: HTMLElement | null = null;
let selectedPreviousBodyOverflow = "";
let selectedPreviousDocumentOverflow = "";
const selected = computed(
  () =>
    recipients.value.find((recipient) => recipient.id === selectedId.value) ??
    null,
);
const counts = computed(() =>
  summarizeVolunteerFollowUpRecipients(recipients.value),
);
const sentPercent = computed(() =>
  counts.value.total
    ? Math.min(100, Math.round((counts.value.sent / counts.value.total) * 100))
    : 0,
);
const filteredRecipients = computed(() =>
  filterVolunteerFollowUpRecipients(
    recipients.value,
    filter.value,
    search.value,
  ),
);
const pagination = computed(() =>
  paginateVolunteerFollowUpRecipients(
    filteredRecipients.value,
    page.value,
    pageSize,
  ),
);
const pageCount = computed(() => pagination.value.pageCount);
const visibleRecipients = computed(() => pagination.value.items);
const firstVisible = computed(() => pagination.value.first);
const lastVisible = computed(() => pagination.value.last);
const responseDeadline = computed(() =>
  query.data.value?.response_deadline
    ? formatDate(query.data.value.response_deadline)
    : "—",
);
const proposedResponseDeadline = computed(() => {
  const parsed = new Date(`${deadlineDate.value}T23:59:59.999Z`);

  return Number.isFinite(parsed.getTime())
    ? formatDate(new Date(parsed.getTime() + 14 * 86_400_000).toISOString())
    : "—";
});
const capacityState = computed(() => {
  const health = query.data.value?.email_health;
  const observedAt = health?.last_provider_response_at;

  if (
    !health ||
    health.daily_quota_used === null ||
    health.monthly_quota_used === null ||
    !observedAt
  )
    return "Unverified";
  const age = Date.now() - new Date(observedAt).getTime();

  return age >= 0 &&
    age <= 30 * 60_000 &&
    observedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)
    ? "Fresh"
    : "Stale";
});
const previewFrameDocument = computed(() => {
  if (!preview.value) return "";

  const html = preview.value.html
    .replace(/<a\b([^>]*)>/giu, (_match, attributes: string) => {
      const safeAttributes = attributes.replace(
        /\s+href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu,
        "",
      );

      return `<span${safeAttributes} aria-disabled="true">`;
    })
    .replace(/<\/a\s*>/giu, "</span>");
  const policy =
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src https://em.devcongress.org data:; style-src 'unsafe-inline'; font-src https://em.devcongress.org data:; form-action 'none'; base-uri 'none'\">";

  return /<head[^>]*>/iu.test(html)
    ? html.replace(/<head([^>]*)>/iu, `<head$1>${policy}`)
    : `${policy}${html}`;
});

let selectedMediaQuery: MediaQueryList | null = null;
const closeSelectionOnBreakpointChange = () => {
  if (selectedId.value) selectedId.value = null;
};

onMounted(() => {
  selectedMediaQuery = window.matchMedia("(max-width: 900px)");
  selectedMediaQuery.addEventListener(
    "change",
    closeSelectionOnBreakpointChange,
  );
});

watch(
  () => campaign.value?.application_deadline_at,
  (deadline) => {
    if (deadline) deadlineDate.value = deadline.slice(0, 10);
  },
  { immediate: true },
);
watch(
  () => props.isOwnerSession,
  (isOwnerSession) => {
    if (isOwnerSession) return;
    selectedId.value = null;
    previewOpen.value = false;
    pendingAction.value = null;
    queryClient.removeQueries({
      queryKey: ["annual-conference", "2026", "volunteer-follow-up", "owner"],
    });
  },
);
watch(
  () => selected.value?.id,
  (id) => {
    if (!id) selectedId.value = null;
  },
);
watch([filter, search], () => {
  page.value = 1;
});
watch(pageCount, (total) => {
  if (page.value > total) page.value = total;
});
watch(selectedId, async (id, previousId) => {
  if (id && !previousId && window.matchMedia("(max-width: 900px)").matches) {
    selectedMobileDialog.value = true;
    selectedPreviousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    selectedPreviousBodyOverflow = document.body.style.overflow;
    selectedPreviousDocumentOverflow = document.documentElement.style.overflow;
    const app = document.querySelector<HTMLElement>("#app");

    selectedAppWasInert = app?.hasAttribute("inert") ?? false;
    if (!selectedAppWasInert) app?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", handleSelectedKeydown);
    await nextTick();
    selectedCloseButton.value?.focus();
  } else if (!id && selectedMobileDialog.value) {
    unlockSelectedDialog();
  }
});
watch(previewOpen, async (open, wasOpen) => {
  if (open && !wasOpen) {
    const lifecycleId = ++previewDrawerLifecycleId;

    previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    await nextTick();
    if (!previewOpen.value || lifecycleId !== previewDrawerLifecycleId) return;

    const app = document.querySelector<HTMLElement>("#app");
    const drawerPanel = previewDrawerPanel.value;

    if (!app || !drawerPanel?.isConnected || app.contains(drawerPanel)) {
      previousFocus = null;
      previewOpen.value = false;

      return;
    }

    previousBodyOverflow = document.body.style.overflow;
    previousDocumentOverflow = document.documentElement.style.overflow;

    // Let the backdrop and focus trap contain the drawer without mutating #app inert state.
    previewDrawerLocked = true;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", handlePreviewKeydown);
    previewCloseButton.value?.focus();
  } else if (!open && wasOpen) {
    previewDrawerLifecycleId += 1;
    releasePreviewDrawer();
  }
});

watch(previewOpen, (open) => {
  if (!open) {
    abortPreviewRequest();
    detachPreviewFrameKeyListener();
  }
});

function handlePreviewKeydown(event: KeyboardEvent): void {
  if (!previewOpen.value) return;

  if (event.key === "Escape") {
    event.preventDefault();
    previewOpen.value = false;

    return;
  }

  if (event.key !== "Tab" || !previewDrawerPanel.value) return;
  const focusable = [
    ...previewDrawerPanel.value.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.getClientRects().length > 0);

  if (!focusable.length) {
    event.preventDefault();
    previewDrawerPanel.value.focus();

    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1)!;
  const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);

  if (activeIndex === -1) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && activeIndex === 0) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
    event.preventDefault();
    first.focus();
  }
}

function showPlainTextPreview(): void {
  detachPreviewFrameKeyListener();
  previewView.value = "text";
}

function handlePreviewFrameLoad(event: Event): void {
  detachPreviewFrameKeyListener();

  if (!previewOpen.value || previewView.value !== "email")
    return;
  const frame = event.currentTarget;

  if (!(frame instanceof HTMLIFrameElement)) return;
  // This fixed email template escapes dynamic text; keep scripts disabled in the sandbox.
  const frameDocument = frame.contentDocument;

  if (!frameDocument) return;
  attachedPreviewFrameDocument = frameDocument;
  frameDocument.addEventListener("keydown", handlePreviewFrameKeydown, true);
}

function handlePreviewFrameKeydown(event: KeyboardEvent): void {
  if (!previewOpen.value || event.key !== "Escape") return;

  event.preventDefault();
  event.stopPropagation();
  previewOpen.value = false;
}

function detachPreviewFrameKeyListener(): void {
  attachedPreviewFrameDocument?.removeEventListener(
    "keydown",
    handlePreviewFrameKeydown,
    true,
  );
  attachedPreviewFrameDocument = null;
}

function abortPreviewRequest(): void {
  previewRequestId += 1;
  previewRequestController?.abort();
  previewRequestController = null;
  previewLoading.value = false;
}

function releasePreviewDrawer(): void {
  if (!previewDrawerLocked) return;

  document.body.style.overflow = previousBodyOverflow;
  document.documentElement.style.overflow = previousDocumentOverflow;
  document.removeEventListener("keydown", handlePreviewKeydown);
  previewDrawerLocked = false;

  if (previousFocus?.isConnected && !previousFocus.closest("[inert]")) {
    previousFocus.focus();
  }

  previousFocus = null;
}

function unlockSelectedDialog(): void {
  const app = document.querySelector<HTMLElement>("#app");

  if (!selectedAppWasInert) app?.removeAttribute("inert");
  document.body.style.overflow = selectedPreviousBodyOverflow;
  document.documentElement.style.overflow = selectedPreviousDocumentOverflow;
  document.removeEventListener("keydown", handleSelectedKeydown);
  selectedPreviousFocus?.focus();
  selectedPreviousFocus = null;
  selectedMobileDialog.value = false;
}

function handleSelectedKeydown(event: KeyboardEvent): void {
  if (!selectedMobileDialog.value) return;

  if (event.key === "Escape") {
    event.preventDefault();
    selectedId.value = null;

    return;
  }
  if (event.key !== "Tab" || !selectedPanel.value) return;
  const focusable = [
    ...selectedPanel.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ];

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

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Accra",
  });
}

function deliveryLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "Queued",
    sending: "Sending",
    accepted: "Accepted",
    delivered: "Delivered",
    delayed: "Delayed",
    failed: "Failed",
    bounced: "Bounced",
    suppressed: "Suppressed",
    complained: "Complaint",
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

function deliveryClass(status: string): string {
  if (["delivered", "accepted"].includes(status))
    return "follow-up-state--good";
  if (["failed", "bounced", "suppressed", "complained"].includes(status))
    return "follow-up-state--issue";
  if (status === "delayed") return "follow-up-state--warning";

  return "follow-up-state--neutral";
}

async function perform(
  action: () => Promise<unknown>,
  success: string,
): Promise<void> {
  busy.value = true;

  try {
    await action();
    await query.refetch();
    notify.success(success);
  } catch (error) {
    notify.error(
      error instanceof Error ? error.message : "Something went wrong.",
    );
  } finally {
    busy.value = false;
  }
}

async function saveDeadline(): Promise<void> {
  await perform(
    () =>
      fetchJson("/api/annual-conference/2026/volunteer-follow-up/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_deadline: deadlineDate.value }),
      }),
    "Application deadline saved.",
  );
}

async function controlCampaign(): Promise<void> {
  if (!pendingAction.value) return;
  const action = pendingAction.value;

  await perform(
    () =>
      fetchJson("/api/annual-conference/2026/volunteer-follow-up/control", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    `Campaign ${action === "launch" || action === "resume" ? "running" : action === "pause" ? "paused" : "closed"}.`,
  );
  pendingAction.value = null;
}

async function openPreview(): Promise<void> {
  abortPreviewRequest();
  const requestId = previewRequestId;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15_000);

  previewRequestController = controller;
  previewOpen.value = true;
  previewLoading.value = true;
  previewError.value = "";
  previewView.value = "email";
  preview.value = null;

  try {
    const loadedPreview = await fetchJson<EmailPreview>(
      "/api/annual-conference/2026/volunteer-follow-up/preview",
      { credentials: "include", signal: controller.signal },
    );

    if (requestId === previewRequestId && !controller.signal.aborted) {
      preview.value = loadedPreview;
    }
  } catch (error) {
    if (requestId === previewRequestId && !controller.signal.aborted) {
      previewError.value =
        error instanceof Error
          ? error.message
          : "Unable to load the invitation preview.";
    } else if (requestId === previewRequestId && timedOut) {
      previewError.value =
        "The invitation preview took too long to load. Try again.";
    }
  } finally {
    window.clearTimeout(timeout);

    if (requestId === previewRequestId) {
      previewLoading.value = false;
      previewRequestController = null;
    }
  }
}

onUnmounted(() => {
  previewDrawerLifecycleId += 1;
  selectedMediaQuery?.removeEventListener(
    "change",
    closeSelectionOnBreakpointChange,
  );

  if (selectedMobileDialog.value) unlockSelectedDialog();
  abortPreviewRequest();
  detachPreviewFrameKeyListener();
  releasePreviewDrawer();
});
</script>

<template>
  <section
    v-if="props.isOwnerSession"
    class="follow-up-panel"
    aria-label="Volunteer follow-up"
    :aria-busy="query.isPending.value"
  >
    <header class="follow-up-header">
      <div>
        <span class="follow-up-eyebrow">Volunteer campaign · 2026</span>
        <h2>Invitation campaign</h2>
        <p>
          Two final questions for volunteer applicants. Invitations are sent in
          quota-aware daily batches.
        </p>
      </div>
      <span
        v-if="campaign"
        class="follow-up-badge"
        :class="`follow-up-badge--${campaign.status}`"
        >{{ campaign.status }}</span
      >
    </header>

    <div v-if="query.isPending.value" class="follow-up-skeleton">
      <span class="sr-only" role="status">Loading follow-up campaign…</span>
      <div class="follow-up-skeleton-content" aria-hidden="true">
        <div class="follow-up-skeleton-progress">
          <div class="follow-up-skeleton-copy">
            <i class="follow-up-skeleton-line follow-up-skeleton-line--short" />
            <i class="follow-up-skeleton-line follow-up-skeleton-line--count" />
          </div>
          <i class="follow-up-skeleton-track" />
          <div class="follow-up-skeleton-stats">
            <i class="follow-up-skeleton-stat" />
            <i class="follow-up-skeleton-stat" />
            <i class="follow-up-skeleton-stat" />
          </div>
        </div>
        <div v-if="props.isOwnerSession" class="follow-up-skeleton-setup">
          <i class="follow-up-skeleton-line follow-up-skeleton-line--medium" />
          <div class="follow-up-skeleton-setup-grid">
            <i
              class="follow-up-skeleton-setup-cell follow-up-skeleton-setup-cell--deadline"
            />
            <i
              class="follow-up-skeleton-setup-cell follow-up-skeleton-setup-cell--preview"
            />
            <i
              class="follow-up-skeleton-setup-cell follow-up-skeleton-setup-cell--controls"
            />
          </div>
          <i class="follow-up-skeleton-line follow-up-skeleton-line--long" />
        </div>
        <div v-else class="follow-up-skeleton-timeline">
          <i class="follow-up-skeleton-line follow-up-skeleton-line--medium" />
          <i class="follow-up-skeleton-line follow-up-skeleton-line--long" />
        </div>
        <div class="follow-up-skeleton-inbox">
          <div class="follow-up-skeleton-inbox-toolbar">
            <i
              class="follow-up-skeleton-line follow-up-skeleton-line--medium"
            />
            <div class="follow-up-skeleton-inbox-controls">
              <i class="follow-up-skeleton-filter" />
              <i class="follow-up-skeleton-search" />
            </div>
            <i class="follow-up-skeleton-line follow-up-skeleton-line--short" />
          </div>
          <div class="follow-up-skeleton-rows">
            <i v-for="row in 2" :key="row" class="follow-up-skeleton-row" />
          </div>
        </div>
      </div>
    </div>
    <p
      v-else-if="query.isError.value && !query.data.value"
      class="follow-up-error"
      role="alert"
    >
      Unable to load the follow-up campaign. Refresh to try again.
    </p>
    <template v-else-if="campaign">
      <p
        v-if="query.isRefetchError.value"
        class="follow-up-refresh-warning"
        role="status"
      >
        Refresh failed. Showing the last loaded campaign data.
      </p>
      <section class="follow-up-progress" aria-label="Invitation progress">
        <div class="follow-up-progress-copy">
          <div>
            <p class="follow-up-kicker">
              {{
                campaign.status === "draft"
                  ? "Ready for invitations"
                  : campaign.status === "closed"
                    ? "Campaign closed"
                    : "Invitation progress"
              }}
            </p>
            <p class="follow-up-progress-count">
              <strong>{{ counts.sent }}</strong
              ><span>of {{ counts.total }} applicants invited</span>
            </p>
          </div>
          <span v-if="counts.failed" class="follow-up-issue-count"
            >{{ counts.failed }} delivery
            {{ counts.failed === 1 ? "issue" : "issues" }}</span
          >
        </div>
        <div
          class="follow-up-progress-track"
          role="progressbar"
          :aria-valuenow="counts.sent"
          :aria-valuemin="0"
          :aria-valuemax="Math.max(counts.total, 1)"
          :aria-label="`${counts.sent} of ${counts.total} applicants invited`"
        >
          <span :style="{ transform: `scaleX(${sentPercent / 100})` }" />
        </div>
        <dl class="follow-up-summary-stats">
          <div>
            <dt>Not yet accepted</dt>
            <dd>{{ counts.notSent }}</dd>
          </div>
          <div>
            <dt>Answers received</dt>
            <dd>{{ counts.responded }}</dd>
          </div>
          <div>
            <dt>Delivery issues</dt>
            <dd>{{ counts.failed }}</dd>
          </div>
        </dl>
      </section>

      <section
        v-if="isOwner"
        class="follow-up-owner-setup"
        aria-labelledby="follow-up-owner-setup-title"
      >
        <div class="follow-up-owner-setup-heading">
          <div>
            <p class="follow-up-kicker">Owner</p>
            <h3 id="follow-up-owner-setup-title">Campaign setup</h3>
          </div>
          <span class="follow-up-setup-state">{{ campaign.status }}</span>
        </div>
        <div class="follow-up-owner-setup-grid">
          <div class="follow-up-deadline-control">
            <AppDatePicker
              v-model="deadlineDate"
              label="Application deadline"
              density="field"
              :disabled="busy || campaign.status !== 'draft'"
            />
            <p class="follow-up-deadline-hint">
              Responses close
              {{
                deadlineDate === campaign.application_deadline_at.slice(0, 10)
                  ? responseDeadline
                  : proposedResponseDeadline
              }}
              · 14 days later<span
                v-if="
                  deadlineDate !== campaign.application_deadline_at.slice(0, 10)
                "
              >
                · Unsaved change</span
              >.
            </p>
            <button
              type="button"
              class="follow-up-button follow-up-button--secondary follow-up-save-deadline"
              :disabled="
                busy ||
                campaign.status !== 'draft' ||
                deadlineDate === campaign.application_deadline_at.slice(0, 10)
              "
              @click="saveDeadline"
            >
              Save deadline
            </button>
          </div>
          <div class="follow-up-preview-actions">
            <span class="editorial-label">Preview</span>
            <div class="follow-up-preview-links">
              <button
                type="button"
                class="follow-up-preview-link"
                :disabled="previewLoading"
                @click="openPreview"
              >
                Preview <span aria-hidden="true">↗</span>
              </button>
              <RouterLink
                :to="{ name: 'admin-volunteer-follow-up-form-preview' }"
                class="follow-up-preview-link"
              >
                Preview volunteer form
              </RouterLink>
            </div>
          </div>
          <div class="follow-up-campaign-controls">
            <span class="editorial-label">Campaign controls</span>
            <button
              v-if="campaign.status === 'draft'"
              type="button"
              class="follow-up-button"
              :disabled="
                busy ||
                deadlineDate !== campaign.application_deadline_at.slice(0, 10)
              "
              @click="pendingAction = 'launch'"
            >
              Launch campaign
            </button>
            <button
              v-if="campaign.status === 'paused'"
              type="button"
              class="follow-up-button"
              :disabled="busy"
              @click="pendingAction = 'resume'"
            >
              Resume sending
            </button>
            <button
              v-if="campaign.status === 'running'"
              type="button"
              class="follow-up-button follow-up-button--secondary"
              :disabled="busy"
              @click="pendingAction = 'pause'"
            >
              Pause sending
            </button>
            <button
              v-if="
                campaign.status === 'running' || campaign.status === 'paused'
              "
              type="button"
              class="follow-up-text-button"
              :disabled="busy"
              @click="pendingAction = 'close'"
            >
              Close campaign
            </button>
            <p
              v-if="
                campaign.status === 'draft' &&
                deadlineDate !== campaign.application_deadline_at.slice(0, 10)
              "
            >
              Save the updated date before launch. Up to 54 invitations are sent
              per Accra day; applicants continue joining the queue until the
              deadline.
            </p>
            <p v-else-if="campaign.status === 'draft'">
              The saved date is ready for launch. Up to 54 invitations are sent
              per Accra day; applicants continue joining the queue until the
              deadline.
            </p>
            <p v-else>
              The application deadline is fixed after launch. Up to 54
              invitations are sent per Accra day.
            </p>
          </div>
        </div>
        <p class="follow-up-owner-timeline">
          <span class="follow-up-timeline-date">
            <span>Saved application deadline</span>
            <strong>{{ formatDate(campaign.application_deadline_at) }}</strong>
          </span>
          <span class="follow-up-timeline-arrow" aria-hidden="true">→</span>
          <span class="follow-up-timeline-date">
            <span>Responses close</span>
            <strong>{{ responseDeadline }}</strong>
          </span>
          <span
            v-if="
              deadlineDate !== campaign.application_deadline_at.slice(0, 10)
            "
            class="follow-up-timeline-draft"
          >
            Draft date selected:
            {{ formatDate(`${deadlineDate}T23:59:59.999Z`) }} · unsaved
          </span>
        </p>
      </section>
      <section
        v-else
        class="follow-up-review-timeline"
        aria-label="Volunteer response deadlines"
      >
        <span
          >Applications close
          <strong>{{
            formatDate(campaign.application_deadline_at)
          }}</strong></span
        >
        <span
          >Responses close <strong>{{ responseDeadline }}</strong></span
        >
      </section>

      <VolunteerOutcomeCampaignPanel
        v-if="isOwner"
        :recipients="recipients"
        :outcome-paused="campaign.outcome_paused"
        @updated="query.refetch"
      />

      <section v-if="isOwner" class="follow-up-health">
        <button
          class="follow-up-health-trigger"
          type="button"
          :aria-expanded="healthOpen"
          @click="healthOpen = !healthOpen"
        >
          <span
            ><small>Owner diagnostics</small
            ><strong>Delivery health</strong></span
          >
          <span
            class="follow-up-health-state"
            :class="`follow-up-health-state--${capacityState.toLowerCase()}`"
            >{{ capacityState }}</span
          >
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            :class="{ 'is-open': healthOpen }"
          >
            <path d="m5 7 5 5 5-5" />
          </svg>
        </button>
        <Transition name="follow-up-reveal">
          <div v-if="healthOpen" class="follow-up-health-content">
            <dl>
              <div>
                <dt>Resend today</dt>
                <dd>
                  {{ query.data.value?.email_health?.daily_quota_used ?? "—" }}
                  /
                  {{ query.data.value?.email_health?.daily_quota_limit ?? 100 }}
                </dd>
              </div>
              <div>
                <dt>Resend this month</dt>
                <dd>
                  {{
                    query.data.value?.email_health?.monthly_quota_used ?? "—"
                  }}
                  /
                  {{
                    query.data.value?.email_health?.monthly_quota_limit ?? 3000
                  }}
                </dd>
              </div>
              <div>
                <dt>Last quota check</dt>
                <dd>
                  {{
                    formatDate(
                      query.data.value?.email_health?.last_provider_response_at,
                    )
                  }}
                </dd>
              </div>
              <div>
                <dt>Last scheduler run</dt>
                <dd>{{ formatDate(campaign.last_drain_at) }}</dd>
              </div>
              <div>
                <dt>Scheduler result</dt>
                <dd>
                  {{
                    campaign.last_drain_reason?.replaceAll("_", " ") ??
                    "Not run yet"
                  }}
                </dd>
              </div>
            </dl>
            <p>
              The sender pauses when quota cannot be verified and reserves 35
              messages for other mail. Temporary failures retry with backoff;
              ambiguous sends wait for owner review.
            </p>
          </div>
        </Transition>
      </section>

      <div
        id="follow-up-layout"
        class="follow-up-layout"
        :class="{ 'follow-up-layout--selected': selected }"
      >
        <main class="follow-up-main">
          <div class="follow-up-inbox-toolbar">
            <h3 class="follow-up-kicker follow-up-inbox-title">
              Applicant inbox
            </h3>
            <div class="follow-up-inbox-controls">
              <AppDropdown
                v-model="filter"
                aria-label="Filter follow-up recipients"
                :options="recipientFilterOptions"
                density="compact"
                :teleport="true"
                trigger-class="follow-up-dropdown"
              />
              <label class="follow-up-search">
                <span class="sr-only">Search applicants</span>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <circle cx="8.5" cy="8.5" r="5.5" />
                  <path d="m13 13 4 4" />
                </svg>
                <input
                  v-model="search"
                  type="search"
                  placeholder="Search name or email"
                  autocomplete="off"
                />
              </label>
            </div>
            <p v-if="filteredRecipients.length" class="follow-up-range">
              {{ firstVisible }}–{{ lastVisible }} of
              {{ filteredRecipients.length }}
            </p>
          </div>

          <div
            v-if="visibleRecipients.length"
            class="follow-up-recipient-list"
            aria-label="Applicants"
          >
            <button
              v-for="recipient in visibleRecipients"
              :key="recipient.id"
              type="button"
              class="follow-up-recipient"
              :aria-pressed="selectedId === recipient.id"
              @click="
                selectedId = selectedId === recipient.id ? null : recipient.id
              "
            >
              <span class="follow-up-recipient-main">
                <strong>{{ recipient.applicant_name }}</strong>
                <small>{{ recipient.applicant_email }}</small>
              </span>
              <span class="follow-up-recipient-state">
                <span
                  class="follow-up-state"
                  :class="deliveryClass(recipient.status)"
                  >{{ deliveryLabel(recipient.status) }}</span
                >
              </span>
              <svg
                class="follow-up-recipient-chevron"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path d="m7 4 6 6-6 6" />
              </svg>
            </button>
          </div>
          <div v-else class="follow-up-empty">
            <span class="follow-up-empty-mark" aria-hidden="true">↳</span>
            <h4>
              {{
                search.trim()
                  ? "No matching applicants"
                  : "Nothing in this view yet"
              }}
            </h4>
            <p>
              {{
                search.trim()
                  ? "Try another name, email, or delivery filter."
                  : "Applicants and their invitation status will appear here as the campaign queue fills."
              }}
            </p>
          </div>

          <nav
            v-if="filteredRecipients.length > pageSize"
            class="follow-up-pagination"
            aria-label="Applicant pages"
          >
            <button type="button" :disabled="page <= 1" @click="page -= 1">
              Previous
            </button>
            <span>Page {{ page }} of {{ pageCount }}</span>
            <button
              type="button"
              :disabled="page >= pageCount"
              @click="page += 1"
            >
              Next
            </button>
          </nav>
        </main>
        <Teleport to="body" :disabled="!selectedMobileDialog">
          <Transition name="follow-up-selection">
            <div
              v-if="selected"
              class="follow-up-selection-backdrop"
              role="presentation"
              @click.self="selectedId = null"
            >
              <aside
                ref="selectedPanel"
                class="follow-up-selected-drawer"
                :role="selectedMobileDialog ? 'dialog' : 'complementary'"
                :aria-modal="selectedMobileDialog ? 'true' : undefined"
                aria-labelledby="follow-up-selected-title"
                tabindex="-1"
              >
                <header class="follow-up-response-heading">
                  <div>
                    <p class="follow-up-kicker">
                      {{ "Delivery record" }}
                    </p>
                    <h3 id="follow-up-selected-title">
                      {{ selected.applicant_name }}
                    </h3>
                    <p>
                      {{ selected.applicant_email }}
                    </p>
                  </div>
                  <button
                    ref="selectedCloseButton"
                    type="button"
                    class="follow-up-close-detail"
                    aria-label="Close applicant details"
                    @click="selectedId = null"
                  >
                    ×
                  </button>
                </header>
                <div class="follow-up-selected-content">
                  <div class="follow-up-delivery-detail">
                    <span
                      class="follow-up-state"
                      :class="deliveryClass(selected.status)"
                      >{{ deliveryLabel(selected.status) }}</span
                    >
                    <p>
                      {{ selected.attempt_count ?? 0 }}
                      {{
                        (selected.attempt_count ?? 0) === 1
                          ? "attempt"
                          : "attempts"
                      }}
                      made<span v-if="selected.next_attempt_at">
                        · Next retry
                        {{ formatDate(selected.next_attempt_at) }}</span
                      >
                    </p>
                    <p
                      v-if="selected.last_error"
                      class="follow-up-inline-error"
                    >
                      {{ selected.last_error }}
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </Transition>
        </Teleport>
      </div>
    </template>
    <p v-else class="follow-up-error" role="alert">
      The follow-up campaign is not configured yet. Apply the database migration
      before launch.
    </p>

    <Teleport to="body">
      <Transition name="follow-up-preview-drawer">
        <div
          v-if="previewOpen"
          class="follow-up-preview-backdrop"
          role="presentation"
          @click.self="previewOpen = false"
        >
          <section
            ref="previewDrawerPanel"
            class="follow-up-preview-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="follow-up-preview-title"
            tabindex="-1"
          >
            <header>
              <div>
                <p class="follow-up-kicker">Owner preview</p>
                <h2 id="follow-up-preview-title">Invitation email</h2>
              </div>
              <div class="follow-up-preview-header-actions">
                <button
                  ref="previewCloseButton"
                  type="button"
                  class="follow-up-drawer-close"
                  aria-label="Close preview"
                  @click="previewOpen = false"
                >
                  ×
                </button>
              </div>
            </header>
            <div class="follow-up-preview-content">
              <div class="follow-up-preview-meta">
                <p>
                  <span>From</span><strong>{{ preview?.from ?? "—" }}</strong>
                </p>
                <p>
                  <span>Subject</span
                  ><strong>{{
                    preview?.subject ?? "Invitation preview"
                  }}</strong>
                </p>
              </div>
              <div
                class="follow-up-preview-switch"
                role="tablist"
                aria-label="Email preview format"
              >
                <button
                  ref="previewEmailTab"
                  id="follow-up-email-tab"
                  type="button"
                  role="tab"
                  :aria-selected="previewView === 'email'"
                  aria-controls="follow-up-email-panel"
                  @click="previewView = 'email'"
                >
                  Rendered email
                </button>
                <button
                  id="follow-up-text-tab"
                  type="button"
                  role="tab"
                  :aria-selected="previewView === 'text'"
                  aria-controls="follow-up-text-panel"
                  @click="showPlainTextPreview"
                >
                  Plain text
                </button>
              </div>
              <div
                v-if="previewLoading"
                class="follow-up-drawer-state"
                role="status"
              >
                Loading the production invitation…
              </div>
              <div
                v-else-if="previewError"
                class="follow-up-drawer-state follow-up-drawer-state--error"
                role="alert"
              >
                <p>{{ previewError }}</p>
                <button
                  type="button"
                  class="follow-up-text-button"
                  @click="openPreview"
                >
                  Try again
                </button>
              </div>
              <div
                v-else-if="preview && previewView === 'email'"
                id="follow-up-email-panel"
                class="follow-up-email-panel"
                role="tabpanel"
                aria-labelledby="follow-up-email-tab"
              >
                <iframe
                  title="Rendered invitation email preview"
                  :srcdoc="previewFrameDocument"
                  sandbox="allow-same-origin"
                  tabindex="-1"
                  referrerpolicy="no-referrer"
                  @load="handlePreviewFrameLoad"
                />
                <p>
                  Preview links are inactive. Nothing is sent from this screen.
                </p>
              </div>
              <div
                v-else-if="preview"
                id="follow-up-text-panel"
                class="follow-up-plain-text"
                role="tabpanel"
                aria-labelledby="follow-up-text-tab"
              >
                {{ preview.text }}
              </div>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>

    <ConfirmDialog
      :open="pendingAction !== null"
      :title="`${pendingAction === 'launch' ? 'Launch' : pendingAction === 'resume' ? 'Resume' : pendingAction === 'pause' ? 'Pause' : 'Close'} volunteer follow-up?`"
      :message="
        pendingAction === 'launch' || pendingAction === 'resume'
          ? 'This enables scheduled invitation emails to eligible applicants, subject to safe Resend capacity. Review the deadline and invitation copy first.'
          : pendingAction === 'pause'
            ? 'No new invitations will be sent while paused. Applicants can still respond to emails already sent.'
            : 'No new invitations will be sent. This campaign cannot be reopened.'
      "
      :confirm-label="
        pendingAction === 'launch'
          ? 'Launch campaign'
          : pendingAction === 'resume'
            ? 'Resume sending'
            : pendingAction === 'pause'
              ? 'Pause sending'
              : 'Close campaign'
      "
      :busy="busy"
      :danger="pendingAction === 'close'"
      @cancel="pendingAction = null"
      @confirm="controlCampaign"
    />
  </section>
</template>

<style scoped>
.follow-up-panel {
  margin: 0;
  padding: clamp(1rem, 2.4vw, 1.6rem);
  border: 1px solid #d6d2c9;
  border-radius: 8px;
  background: #fff;
  color: #111;
}
.follow-up-header,
.follow-up-response-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.follow-up-header h2 {
  margin: 0.35rem 0;
  font-size: 1.65rem;
  font-weight: 800;
  letter-spacing: -0.025em;
}
.follow-up-header > div > p:last-child,
.follow-up-response-heading > div > p:last-child {
  margin: 0.3rem 0 0;
  color: #666;
  font-size: 0.86rem;
  line-height: 1.5;
}
.follow-up-eyebrow,
.follow-up-kicker {
  color: #bb145e;
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.follow-up-kicker {
  margin: 0 0 0.35rem;
}
.follow-up-badge {
  flex: none;
  padding: 0.35rem 0.55rem;
  border: 1px solid #a9a39a;
  border-radius: 6px;
  color: #555;
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
}
.follow-up-badge--running {
  border-color: #17803d;
  background: #effcf3;
  color: #176b35;
}
.follow-up-badge--paused {
  border-color: #a85c00;
  background: #fff8e6;
  color: #814500;
}
.follow-up-badge--closed {
  background: #f2f0eb;
}
.follow-up-progress {
  margin: 1.4rem 0 1.6rem;
  padding: 1rem 1.1rem 0.85rem;
  border: 1px solid #ded9cf;
  border-radius: 8px;
  background: #faf8f3;
}
.follow-up-progress-copy {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}
.follow-up-progress-count {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
  margin: 0;
}
.follow-up-progress-count strong {
  font-size: 1.55rem;
  line-height: 1.1;
}
.follow-up-progress-count span,
.follow-up-issue-count {
  color: #555;
  font-size: 0.82rem;
}
.follow-up-issue-count {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  background: #fff0e9;
  color: #9c3217;
  font-weight: 700;
}
.follow-up-progress-track {
  height: 7px;
  margin: 0.9rem 0 0.8rem;
  overflow: hidden;
  border-radius: 99px;
  background: #e4e0d8;
}
.follow-up-progress-track > span {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: left center;
  border-radius: inherit;
  background: #c80d68;
  transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
}
.follow-up-summary-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;
  margin: 0;
}
.follow-up-summary-stats > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
.follow-up-summary-stats dt {
  color: #666;
  font-size: 0.73rem;
}
.follow-up-summary-stats dd {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 700;
}
.follow-up-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 1rem;
}
.follow-up-layout--selected {
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 25rem);
}
.follow-up-main {
  min-width: 0;
  container-type: inline-size;
}
.follow-up-review-shortcut {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0;
  color: #a30c53;
  font-size: 0.73rem;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 0.18rem;
}
.follow-up-review-shortcut strong {
  color: #111;
  font-size: 0.86rem;
  text-decoration: none;
}
.follow-up-review-shortcut:focus-visible {
  outline: 2px solid #c80d68;
  outline-offset: 3px;
}
.follow-up-inbox-toolbar,
.follow-up-skeleton-inbox-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content max-content;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.follow-up-inbox-title {
  margin: 0;
}
.follow-up-inbox-controls,
.follow-up-skeleton-inbox-controls {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}
.follow-up-search {
  display: flex;
  width: min(100%, 19rem);
  min-height: 2.55rem;
  align-items: center;
  gap: 0.55rem;
  padding: 0 0.7rem;
  border: 1px solid #c9c4ba;
  border-radius: 6px;
  background: #fff;
}
.follow-up-search:focus-within {
  outline: 2px solid #c80d68;
  outline-offset: 2px;
}
.follow-up-search svg {
  width: 1rem;
  flex: none;
  fill: none;
  stroke: #706c64;
  stroke-width: 1.7;
}
.follow-up-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: #111;
  font-size: 0.82rem;
}
.follow-up-search input::placeholder {
  color: #777;
}
.follow-up-dropdown {
  min-height: 2.35rem;
  padding: 0.4rem 0.6rem;
  font-size: 0.8rem;
}
.follow-up-range {
  margin: 0;
  color: #777;
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.67rem;
  white-space: nowrap;
}
.follow-up-recipient-list {
  overflow: hidden;
  border: 1px solid #ded9cf;
  border-radius: 8px;
}
.follow-up-recipient {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(10rem, 1fr) minmax(13rem, auto) 1rem;
  align-items: center;
  gap: 0.8rem;
  padding: 0.75rem 0.85rem;
  border-bottom: 1px solid #e9e6df;
  background: #fff;
  text-align: left;
  transition: transform 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.follow-up-recipient:last-child {
  border-bottom: 0;
}
.follow-up-recipient:hover,
.follow-up-recipient[aria-pressed="true"] {
  background: #fff7fa;
}
.follow-up-recipient:active {
  transform: scale(0.995);
}
.follow-up-recipient:focus-visible,
.follow-up-pagination button:focus-visible,
.follow-up-close-detail:focus-visible,
.follow-up-disclosure:focus-visible,
.follow-up-button:focus-visible,
.follow-up-text-button:focus-visible,
.follow-up-preview-link:focus-visible,
.follow-up-drawer-close:focus-visible {
  outline: 2px solid #c80d68;
  outline-offset: 2px;
}
.follow-up-recipient-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.16rem;
}
.follow-up-recipient-main strong,
.follow-up-recipient-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.follow-up-recipient-main strong {
  font-size: 0.88rem;
}
.follow-up-recipient-main small {
  color: #666;
  font-size: 0.73rem;
}
.follow-up-recipient-state {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.3rem;
}
.follow-up-state {
  display: inline-flex;
  align-items: center;
  min-height: 1.45rem;
  padding: 0.12rem 0.42rem;
  border: 1px solid #dad6ce;
  border-radius: 4px;
  background: #f5f3ee;
  color: #58554f;
  font-size: 0.65rem;
  font-weight: 600;
  line-height: 1.2;
}
.follow-up-state--good {
  border-color: #b8dfc2;
  background: #f0faf2;
  color: #176b35;
}
.follow-up-state--warning {
  border-color: #f0d499;
  background: #fff8e7;
  color: #875100;
}
.follow-up-state--issue {
  border-color: #f0c2b8;
  background: #fff2ee;
  color: #9d321b;
}
.follow-up-state--response,
.follow-up-state--review {
  font-weight: 500;
}
.follow-up-recipient-chevron {
  width: 0.9rem;
  fill: none;
  stroke: #777;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
.follow-up-empty {
  padding: 2.4rem 1rem;
  border: 1px dashed #cbc5ba;
  border-radius: 8px;
  text-align: center;
}
.follow-up-empty-mark {
  display: inline-grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 50%;
  background: #fff0f6;
  color: #bb145e;
  font-size: 1.1rem;
}
.follow-up-empty h4 {
  margin: 0.6rem 0 0.25rem;
  font-size: 0.95rem;
}
.follow-up-empty p {
  max-width: 24rem;
  margin: 0 auto;
  color: #666;
  font-size: 0.8rem;
  line-height: 1.5;
}
.follow-up-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
.follow-up-pagination span {
  color: #666;
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.68rem;
}
.follow-up-pagination button {
  min-height: 2.15rem;
  padding: 0.35rem 0.65rem;
  border: 1px solid #c9c4ba;
  border-radius: 5px;
  background: #fff;
  color: #222;
  font-size: 0.72rem;
  font-weight: 600;
}
.follow-up-pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.follow-up-response {
  min-width: 0;
}
.follow-up-response-heading {
  align-items: flex-start;
}
.follow-up-response-heading h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
}
.follow-up-close-detail {
  width: 2rem;
  height: 2rem;
  border: 1px solid #d4cec4;
  border-radius: 5px;
  background: #fff;
  font-size: 1.25rem;
  line-height: 1;
}
.follow-up-answer {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e8e3da;
}
.follow-up-answer small {
  color: #666;
  font-size: 0.72rem;
  font-weight: 700;
}
.follow-up-answer p {
  margin: 0.3rem 0 0;
  white-space: pre-wrap;
  font-size: 0.88rem;
  line-height: 1.55;
}
.follow-up-review {
  max-width: 26rem;
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid #e8e3da;
}
.follow-up-review label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.65rem;
  font-size: 0.76rem;
  font-weight: 700;
}
.follow-up-input {
  width: 100%;
  min-height: 2.5rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid #aaa;
  border-radius: 6px;
  background: #fff;
  color: #111;
  font-size: 0.82rem;
}
.follow-up-owner-setup {
  margin: 0 0 0.75rem;
  padding: 1rem 1.1rem;
  border: 1px solid #ded9cf;
  border-radius: 8px;
  background: #faf8f3;
}
.follow-up-owner-setup-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}
.follow-up-owner-setup-heading h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
}
.follow-up-setup-state {
  padding: 0.25rem 0.5rem;
  border: 1px solid #d0cbc1;
  border-radius: 4px;
  color: #5f5b54;
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
}
.follow-up-owner-setup-grid {
  display: grid;
  grid-template-columns: minmax(13rem, 1fr) minmax(11rem, 0.8fr) minmax(
      13rem,
      1fr
    );
  align-items: start;
  gap: 1rem;
}
.follow-up-owner-setup-grid > * {
  min-width: 0;
}
.follow-up-deadline-control {
  min-width: 0;
}
.follow-up-deadline-control :deep(.editorial-label) {
  margin-bottom: 0;
}
.follow-up-deadline-control > .follow-up-button {
  margin-top: 0.35rem;
}
.follow-up-preview-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.follow-up-preview-actions > .editorial-label,
.follow-up-campaign-controls > .editorial-label {
  margin-bottom: 0;
}
.follow-up-preview-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 1.25rem;
  margin-top: 0.375rem;
}
.follow-up-preview-link {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.25rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: #a30c53;
  font-family: inherit;
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1.4;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 0.2rem;
  cursor: pointer;
}
.follow-up-preview-link:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.follow-up-campaign-controls {
  min-height: 100%;
  padding-left: 1rem;
  border-left: 1px solid #e1dcd2;
}
.follow-up-campaign-controls > .editorial-label {
  display: block;
}
.follow-up-campaign-controls
  > :is(.follow-up-button, .follow-up-text-button):first-of-type {
  margin-top: 0.375rem;
}
.follow-up-campaign-controls > p {
  margin: 0.65rem 0 0;
  color: #6c6860;
  font-size: 0.7rem;
  line-height: 1.5;
}
.follow-up-deadline-hint {
  margin: 0.55rem 0;
  color: #68645d;
  font-size: 0.71rem;
}
.follow-up-deadline-control > .follow-up-button.follow-up-save-deadline {
  display: inline-flex;
  width: auto;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
}
.follow-up-button {
  display: block;
  width: 100%;
  margin-top: 0.65rem;
  min-height: 3.125rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid #a80d58;
  border-radius: 6px;
  background: #c80d68;
  color: #fff;
  font-size: 0.76rem;
  font-weight: 800;
  transition:
    opacity 140ms ease-out,
    transform 100ms ease-out;
}
.follow-up-button:hover:not(:disabled) {
  opacity: 0.91;
}
.follow-up-button:active:not(:disabled) {
  transform: scale(0.985);
}
.follow-up-button--secondary {
  border-color: #24211e;
  background: #fff;
  color: #161412;
}
.follow-up-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.follow-up-owner-timeline,
.follow-up-review-timeline {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.65rem 1rem;
  margin: 1rem 0 0;
  padding-top: 1rem;
  border-top: 1px solid #e1dcd2;
  color: #68645d;
  font-size: 0.72rem;
}
.follow-up-owner-timeline strong,
.follow-up-review-timeline strong {
  color: #222;
}
.follow-up-timeline-date {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.3rem 0.55rem;
}
.follow-up-timeline-arrow {
  color: #a30c53;
}
.follow-up-timeline-draft {
  flex-basis: 100%;
  color: #8a3657;
}
.follow-up-review-timeline {
  justify-content: flex-end;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e1dcd2;
}
.follow-up-health {
  margin: 0 0 1rem;
  border: 1px solid #ded9cf;
  border-radius: 8px;
  background: #fff;
}
.follow-up-health-trigger {
  display: flex;
  width: 100%;
  min-height: 3.5rem;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 1rem;
  background: transparent;
  text-align: left;
}
.follow-up-health-trigger > span:first-child {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}
.follow-up-health-trigger small {
  color: #777;
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.61rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.follow-up-health-trigger strong {
  font-size: 0.86rem;
}
.follow-up-health-trigger svg {
  width: 1rem;
  flex: none;
  fill: none;
  stroke: #555;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.follow-up-health-trigger svg.is-open {
  transform: rotate(180deg);
}
.follow-up-health-trigger:focus-visible {
  outline: 2px solid #c80d68;
  outline-offset: 2px;
}
.follow-up-health-content {
  padding: 0.25rem 1rem 1rem;
  border-top: 1px solid #e1dcd2;
}
.follow-up-selection-backdrop {
  position: sticky;
  top: 1rem;
  z-index: 5;
  min-width: 0;
}
.follow-up-selected-drawer {
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: 1rem;
  border: 1px solid #d7d2c9;
  border-radius: 8px;
  background: #fffdfa;
}
.follow-up-selected-content {
  padding-top: 0.15rem;
}
.follow-up-health-content dl {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.8rem;
  margin: 0;
  padding-top: 0.85rem;
}
.follow-up-health-content dl > div {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.7rem;
}
.follow-up-health-content dt {
  color: #6c6860;
}
.follow-up-health-content dd {
  margin: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.follow-up-health-content > p {
  margin: 0.75rem 0 0;
  color: #6c6860;
  font-size: 0.68rem;
  line-height: 1.5;
}
.follow-up-text-button {
  margin-top: 0.55rem;
  color: #a30c53;
  font-size: 0.75rem;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 0.2rem;
}
.follow-up-health-state {
  padding: 0.2rem 0.42rem;
  border: 1px solid #d2cec5;
  border-radius: 4px;
  color: #625e57;
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.61rem;
  font-weight: 700;
  text-transform: uppercase;
}
.follow-up-health-state--fresh {
  border-color: #b8dfc2;
  background: #f0faf2;
  color: #176b35;
}
.follow-up-health-state--stale {
  border-color: #f0d499;
  background: #fff8e7;
  color: #875100;
}
.follow-up-delivery-detail {
  margin-top: 0.85rem;
  padding-top: 0.8rem;
  border-top: 1px solid #e8e3da;
}
.follow-up-delivery-detail p {
  color: #65615a;
  font-size: 0.76rem;
  line-height: 1.5;
}
.follow-up-inline-error,
.follow-up-error,
.follow-up-drawer-state--error {
  color: #9d321b;
}
.follow-up-reveal-enter-active,
.follow-up-reveal-leave-active {
  transition:
    opacity 150ms ease-out,
    transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: top;
}
.follow-up-reveal-enter-from,
.follow-up-reveal-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem);
}
.follow-up-preview-backdrop {
  position: fixed;
  z-index: 140;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: rgb(17 17 17 / 38%);
}
.follow-up-preview-drawer {
  display: flex;
  width: min(100%, 44rem);
  height: 100%;
  flex-direction: column;
  border-left: 2px solid #111;
  background: #f7f5ef;
  box-shadow: -10px 0 0 rgb(17 17 17 / 12%);
}
.follow-up-preview-drawer > header {
  display: flex;
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 1.25rem;
  border-bottom: 2px solid #111;
  background: #f6e74a;
}
.follow-up-preview-header-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.75rem;
}
.follow-up-preview-drawer h2 {
  margin: 0.2rem 0 0;
  font-size: 1.4rem;
  font-weight: 800;
}
.follow-up-preview-content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
}
.follow-up-drawer-close {
  width: 2.5rem;
  height: 2.5rem;
  border: 2px solid #111;
  border-radius: 6px;
  background: #fff;
  font-size: 1.5rem;
  line-height: 1;
}
.follow-up-preview-meta {
  display: grid;
  gap: 0.5rem;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid #d8d3ca;
}
.follow-up-preview-meta p {
  display: grid;
  grid-template-columns: 4.2rem minmax(0, 1fr);
  gap: 0.65rem;
  margin: 0;
  font-size: 0.75rem;
}
.follow-up-preview-meta span {
  color: #777;
}
.follow-up-preview-meta strong {
  overflow-wrap: anywhere;
  font-weight: 600;
}
.follow-up-preview-switch {
  display: flex;
  gap: 0.35rem;
  padding: 0.75rem 1.25rem;
}
.follow-up-preview-switch button {
  min-height: 2.25rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid #d4cec4;
  border-radius: 5px;
  background: #fff;
  color: #4f4b45;
  font-size: 0.72rem;
  font-weight: 700;
}
.follow-up-preview-switch button[aria-selected="true"] {
  border-color: #111;
  background: #111;
  color: #fff;
}
.follow-up-drawer-state {
  display: grid;
  min-height: 12rem;
  place-items: center;
  padding: 1.5rem;
  color: #5d5953;
  text-align: center;
}
.follow-up-email-panel {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 0 1.25rem 1rem;
}
.follow-up-email-panel iframe {
  width: 100%;
  min-height: 20rem;
  flex: 1;
  border: 1px solid #d4cec4;
  border-radius: 6px;
  background: #fff;
}
.follow-up-email-panel > p {
  margin: 0.5rem 0 0;
  color: #69655e;
  font-size: 0.68rem;
}
.follow-up-plain-text {
  min-height: 12rem;
  margin: 0 1.25rem 1.25rem;
  padding: 1rem;
  overflow: auto;
  border: 1px solid #d4cec4;
  border-radius: 6px;
  background: #fff;
  color: #222;
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.75rem;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.follow-up-preview-drawer-enter-active,
.follow-up-preview-drawer-leave-active {
  transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1);
}
.follow-up-preview-drawer-enter-active .follow-up-preview-drawer,
.follow-up-preview-drawer-leave-active .follow-up-preview-drawer {
  transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
}
.follow-up-preview-drawer-enter-from,
.follow-up-preview-drawer-leave-to {
  opacity: 0;
}
.follow-up-preview-drawer-enter-from .follow-up-preview-drawer,
.follow-up-preview-drawer-leave-to .follow-up-preview-drawer {
  transform: translateX(100%);
}
.follow-up-selection-enter-active,
.follow-up-selection-leave-active {
  transition: opacity 150ms cubic-bezier(0.4, 0, 1, 1);
}
.follow-up-selection-enter-active .follow-up-selected-drawer,
.follow-up-selection-leave-active .follow-up-selected-drawer {
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.follow-up-selection-enter-from,
.follow-up-selection-leave-to {
  opacity: 0;
}
.follow-up-selection-enter-from .follow-up-selected-drawer,
.follow-up-selection-leave-to .follow-up-selected-drawer {
  transform: translateX(0.75rem);
}
.follow-up-error {
  font-size: 0.85rem;
}
.follow-up-refresh-warning {
  margin: 0 0 0.9rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid #ead29a;
  border-radius: 6px;
  background: #fff9e9;
  color: #704b12;
  font-size: 0.78rem;
}
.follow-up-skeleton-progress,
.follow-up-skeleton-timeline,
.follow-up-skeleton-inbox {
  border: 1px solid #ded9cf;
  border-radius: 8px;
  background: #fff;
}
.follow-up-skeleton-progress {
  margin: 1.4rem 0 1.1rem;
  padding: 1rem 1.1rem 0.85rem;
  background: #faf8f3;
}
.follow-up-skeleton-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.follow-up-skeleton-line,
.follow-up-skeleton-track,
.follow-up-skeleton-stat,
.follow-up-skeleton-search,
.follow-up-skeleton-filter,
.follow-up-skeleton-row {
  display: block;
  border-radius: 5px;
  background: #e9e6df;
}
.follow-up-skeleton-line {
  height: 0.7rem;
}
.follow-up-skeleton-line--short {
  width: 8rem;
}
.follow-up-skeleton-line--medium {
  width: min(14rem, 55%);
}
.follow-up-skeleton-line--long {
  width: min(24rem, 75%);
}
.follow-up-skeleton-line--count {
  width: 12rem;
  height: 1.35rem;
}
.follow-up-skeleton-track {
  height: 7px;
  margin: 0.9rem 0 0.8rem;
  border-radius: 99px;
}
.follow-up-skeleton-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;
}
.follow-up-skeleton-stat {
  height: 0.85rem;
}
.follow-up-skeleton-timeline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.1rem;
  padding: 0.85rem 1rem;
}
.follow-up-skeleton-setup {
  margin: 0 0 0.75rem;
  padding: 1rem 1.1rem;
  border: 1px solid #ded9cf;
  border-radius: 8px;
  background: #faf8f3;
}
.follow-up-skeleton-setup-grid {
  display: grid;
  grid-template-columns: minmax(13rem, 1fr) minmax(11rem, 0.8fr) minmax(
      13rem,
      1fr
    );
  gap: 1rem;
  margin: 0.85rem 0;
}
.follow-up-skeleton-setup-cell {
  display: block;
  border-radius: 5px;
  background: #e9e6df;
}
.follow-up-skeleton-setup-cell--deadline {
  min-height: 10rem;
}
.follow-up-skeleton-setup-cell--preview {
  min-height: 4.5rem;
}
.follow-up-skeleton-setup-cell--controls {
  min-height: 8rem;
}
.follow-up-skeleton-inbox {
  padding: 1rem;
  container-type: inline-size;
}
.follow-up-skeleton-inbox-toolbar > .follow-up-skeleton-line--medium {
  width: 8rem;
}
.follow-up-skeleton-inbox-toolbar > .follow-up-skeleton-line--short {
  width: 5rem;
}
.follow-up-skeleton-search {
  width: 18rem;
  height: 2.6rem;
}
.follow-up-skeleton-filter {
  width: 8rem;
  height: 2rem;
}
.follow-up-skeleton-rows {
  border-top: 1px solid #e5e1d9;
}
.follow-up-skeleton-row {
  height: 4.1rem;
  margin-top: 0.5rem;
  border: 1px solid #e5e1d9;
  background: linear-gradient(
    90deg,
    #f4f2ed 0 42%,
    #faf9f6 42% 72%,
    #f4f2ed 72%
  );
}

@container (max-width: 43rem) {
  .follow-up-inbox-toolbar,
  .follow-up-skeleton-inbox-toolbar {
    grid-template-columns: minmax(0, 1fr) max-content;
  }
  .follow-up-range,
  .follow-up-skeleton-inbox-toolbar > :last-child {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
  }
  .follow-up-inbox-controls,
  .follow-up-skeleton-inbox-controls {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: flex-end;
  }
}

@container (max-width: 27rem) {
  .follow-up-inbox-controls,
  .follow-up-skeleton-inbox-controls {
    flex-wrap: wrap;
    justify-content: flex-start;
  }
  .follow-up-search,
  .follow-up-skeleton-search {
    width: 100%;
  }
}

@media (max-width: 900px) {
  .follow-up-skeleton-setup-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .follow-up-skeleton-setup-cell--controls {
    grid-column: 1 / -1;
    min-height: 9rem;
  }
  .follow-up-layout,
  .follow-up-layout--selected {
    grid-template-columns: minmax(0, 1fr);
  }
  .follow-up-owner-setup-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .follow-up-campaign-controls {
    grid-column: 1 / -1;
    padding-left: 0;
    padding-top: 0.75rem;
    border-left: 0;
    border-top: 1px solid #e1dcd2;
  }
  .follow-up-selection-backdrop {
    position: fixed;
    z-index: 135;
    inset: 0;
    display: flex;
    justify-content: flex-end;
    background: rgb(17 17 17 / 38%);
  }
  .follow-up-selected-drawer {
    width: min(100%, 30rem);
    height: 100%;
    max-height: none;
    padding: 1.1rem;
    border: 0;
    border-left: 2px solid #111;
    border-radius: 0;
    box-shadow: -10px 0 0 rgb(17 17 17 / 12%);
  }
  .follow-up-selection-enter-from .follow-up-selected-drawer,
  .follow-up-selection-leave-to .follow-up-selected-drawer {
    transform: translateX(100%);
  }
}

@media (max-width: 600px) {
  .follow-up-skeleton-progress {
    margin-top: 1rem;
    padding: 0.85rem;
  }
  .follow-up-skeleton-line--count {
    width: 8rem;
  }
  .follow-up-skeleton-stats {
    gap: 0.45rem;
  }
  .follow-up-skeleton-stat {
    height: 1.8rem;
  }
  .follow-up-skeleton-timeline {
    align-items: flex-start;
    flex-direction: column;
  }
  .follow-up-skeleton-setup-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.55rem;
  }
  .follow-up-skeleton-setup-cell {
    min-height: 0;
  }
  .follow-up-skeleton-setup-cell--deadline {
    min-height: 11rem;
  }
  .follow-up-skeleton-setup-cell--preview {
    min-height: 4.5rem;
  }
  .follow-up-skeleton-setup-cell--controls {
    grid-column: auto;
    min-height: 9rem;
  }
  .follow-up-skeleton-inbox {
    padding: 0.8rem;
  }
  .follow-up-skeleton-row {
    height: 4.75rem;
    background: linear-gradient(
      180deg,
      #f4f2ed 0 32%,
      #faf9f6 32% 58%,
      #f4f2ed 58%
    );
  }
  .follow-up-skeleton-row:nth-child(n + 2) {
    display: none;
  }
  .follow-up-header {
    align-items: flex-start;
  }
  .follow-up-header h2 {
    font-size: 1.4rem;
  }
  .follow-up-progress {
    margin-top: 1rem;
    padding: 0.85rem;
  }
  .follow-up-progress-count {
    flex-wrap: wrap;
    gap: 0.2rem 0.45rem;
  }
  .follow-up-progress-count span {
    font-size: 0.75rem;
  }
  .follow-up-summary-stats {
    gap: 0.45rem;
  }
  .follow-up-summary-stats > div {
    flex-direction: column-reverse;
    gap: 0.1rem;
  }
  .follow-up-summary-stats dt {
    font-size: 0.64rem;
  }
  .follow-up-recipient {
    grid-template-columns: minmax(0, 1fr) 1rem;
    gap: 0.4rem;
    padding: 0.75rem;
  }
  .follow-up-recipient-main {
    grid-column: 1;
  }
  .follow-up-recipient-state {
    grid-column: 1;
    grid-row: 2;
    justify-content: flex-start;
  }
  .follow-up-recipient-chevron {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
  .follow-up-owner-setup-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .follow-up-campaign-controls {
    grid-column: auto;
    padding-top: 0.75rem;
    border-top: 1px solid #e1dcd2;
  }
  .follow-up-preview-drawer {
    border-left: 0;
  }
}

@media (hover: hover) and (pointer: fine) {
  .follow-up-preview-link:hover:not(:disabled),
  .follow-up-text-button:hover {
    color: #71083a;
  }
  .follow-up-recipient:hover .follow-up-recipient-chevron {
    transform: translateX(0.12rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .follow-up-progress-track > span,
  .follow-up-disclosure svg,
  .follow-up-button,
  .follow-up-recipient,
  .follow-up-reveal-enter-active,
  .follow-up-reveal-leave-active,
  .follow-up-preview-drawer-enter-active,
  .follow-up-preview-drawer-leave-active,
  .follow-up-preview-drawer-enter-active .follow-up-preview-drawer,
  .follow-up-preview-drawer-leave-active .follow-up-preview-drawer {
    transition: none;
  }
  .follow-up-selection-enter-active,
  .follow-up-selection-leave-active,
  .follow-up-selection-enter-active .follow-up-selected-drawer,
  .follow-up-selection-leave-active .follow-up-selected-drawer {
    transition: none;
  }
  .follow-up-reveal-enter-from,
  .follow-up-reveal-leave-to,
  .follow-up-preview-drawer-enter-from,
  .follow-up-preview-drawer-leave-to,
  .follow-up-preview-drawer-enter-from .follow-up-preview-drawer,
  .follow-up-preview-drawer-leave-to .follow-up-preview-drawer {
    transform: none;
  }
  .follow-up-selection-enter-from,
  .follow-up-selection-leave-to,
  .follow-up-selection-enter-from .follow-up-selected-drawer,
  .follow-up-selection-leave-to .follow-up-selected-drawer {
    transform: none;
  }
}
</style>
