<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import AppDropdown from "@/src/components/AppDropdown.vue";
import { fetchJson } from "@/src/lib/api";
import { notify } from "@/src/lib/notify";

type Decision = "accepted" | "not_selected";
type Recipient = {
  id: string;
  applicant_name: string;
  decision: "pending" | Decision;
  outcome_sent: boolean;
  outcome_delivery: {
    status: string;
    attempt_count: number;
    next_attempt_at: string | null;
    last_error: string | null;
    provider_email_id: string | null;
  } | null;
};
type Preview = {
  preview_id: string;
  decision: Decision;
  eligible_count: number;
  excluded_count: number;
  recipients: Array<{
    recipient_id: string;
    decision_version: number;
    name: string;
    email: string;
  }>;
  from: string;
  subject: string;
  html: string;
  text: string;
};

const props = defineProps<{
  recipients: Recipient[];
  outcomePaused: boolean;
}>();
const emit = defineEmits<{ updated: [] }>();
const decision = ref<Decision>("accepted");
const drawerOpen = ref(false);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const view = ref<"email" | "text">("email");
const preview = ref<Preview | null>(null);
const drawer = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const previewFrame = ref<HTMLIFrameElement | null>(null);
let requestController: AbortController | null = null;
let requestId = 0;
let previousFocus: HTMLElement | null = null;
let previousBodyOverflow = "";
let previousDocumentOverflow = "";
let drawerLocked = false;
let frameDocument: Document | null = null;
const choiceOptions = [
  { value: "accepted", label: "Send acceptances" },
  { value: "not_selected", label: "Send rejections" },
];
const eligibleDecisions = computed(() =>
  props.recipients.filter((recipient) => recipient.decision === decision.value),
);
const sentCount = computed(() =>
  eligibleDecisions.value.filter((recipient) => recipient.outcome_sent).length,
);
const pendingCount = computed(() =>
  eligibleDecisions.value.filter(
    (recipient) => !recipient.outcome_sent && recipient.outcome_delivery?.status !== "needs_attention",
  ).length,
);
const attentionCount = computed(() =>
  eligibleDecisions.value.filter((recipient) => recipient.outcome_delivery?.status === "needs_attention").length,
);
const deliveryRows = computed(() =>
  props.recipients
    .filter((recipient) => recipient.outcome_delivery)
);
const previewCountMatches = computed(() =>
  preview.value?.recipients.length === preview.value?.eligible_count,
);
const htmlPreview = computed(() => {
  const html = preview.value?.html ?? "";
  const withoutLinks = html
    .replace(/<a\b([^>]*)>/giu, (_match, attributes: string) => {
      const safeAttributes = attributes.replace(/\s+href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "");

      return `<span${safeAttributes} aria-disabled="true">`;
    })
    .replace(/<\/a\s*>/giu, "</span>");
  const policy = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src https://em.devcongress.org data:; style-src 'unsafe-inline'; font-src https://em.devcongress.org data:; form-action 'none'; base-uri 'none'\">";

  return /<head[^>]*>/iu.test(withoutLinks)
    ? withoutLinks.replace(/<head([^>]*)>/iu, `<head$1>${policy}`)
    : `${policy}${withoutLinks}`;
});

watch(drawerOpen, async (open, wasOpen) => {
  if (open && !wasOpen) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();

    if (!drawerOpen.value || !drawer.value?.isConnected) return;

    previousBodyOverflow = document.body.style.overflow;
    previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    drawerLocked = true;
    document.addEventListener("keydown", onKeydown);
    closeButton.value?.focus();
  } else if (!open && wasOpen) {
    releaseDrawer();
  }
});

async function openPreview(): Promise<void> {
  requestId += 1;
  requestController?.abort();
  const currentRequestId = requestId;
  const controller = new AbortController();

  requestController = controller;
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  loading.value = true;
  error.value = "";
  preview.value = null;
  view.value = "email";
  drawerOpen.value = true;

  try {
    const loadedPreview = await fetchJson<Preview>(
      "/api/annual-conference/2026/volunteer-follow-up/outcomes/preview",
      {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decision.value }),
      },
    );

    if (controller.signal.aborted || currentRequestId !== requestId) return;
    preview.value = loadedPreview;
  } catch (cause) {
    if (!controller.signal.aborted && currentRequestId === requestId)
      error.value = cause instanceof Error ? cause.message : "Unable to prepare this preview.";
  } finally {
    if (currentRequestId === requestId) {
      loading.value = false;
      requestController = null;
    }
  }
}

async function confirmSend(): Promise<void> {
  if (!preview.value || !preview.value.eligible_count) return;
  busy.value = true;
  error.value = "";

  try {
    const result = await fetchJson<{ queued_count: number }>(
      "/api/annual-conference/2026/volunteer-follow-up/outcomes/confirm",
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview_id: preview.value.preview_id }),
      },
    );

    notify.success(`${result.queued_count} outcome email${result.queued_count === 1 ? "" : "s"} queued.`);
    drawerOpen.value = false;
    emit("updated");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Unable to queue the outcome emails.";
  } finally {
    busy.value = false;
  }
}

async function togglePause(): Promise<void> {
  busy.value = true;

  try {
    await fetchJson("/api/annual-conference/2026/volunteer-follow-up/outcomes/control", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: props.outcomePaused ? "resume" : "pause" }),
    });
    notify.success(props.outcomePaused ? "Outcome sending resumed." : "Outcome sending paused.");
    emit("updated");
  } catch (cause) {
    notify.error(cause instanceof Error ? cause.message : "Unable to update outcome sending.");
  } finally {
    busy.value = false;
  }
}

function close(): void {
  requestId += 1;
  requestController?.abort();
  requestController = null;
  frameDocument?.removeEventListener("keydown", handleFrameKeydown, true);
  frameDocument = null;
  drawerOpen.value = false;
  preview.value = null;
  error.value = "";
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    close();

    return;
  }
  if (event.key !== "Tab" || !drawer.value) return;
  const focusable = Array.from(drawer.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [role="option"], iframe, [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getClientRects().length > 0);
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

function releaseDrawer(): void {
  document.removeEventListener("keydown", onKeydown);
  if (drawerLocked) {
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousDocumentOverflow;
  }

  if (previousFocus?.isConnected && !previousFocus.closest("[inert]"))
    previousFocus.focus();
  previousFocus = null;
  drawerLocked = false;
}

function handleFrameLoad(): void {
  frameDocument?.removeEventListener("keydown", handleFrameKeydown, true);
  frameDocument = previewFrame.value?.contentDocument ?? null;
  frameDocument?.addEventListener("keydown", handleFrameKeydown, true);
}

function handleFrameKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;

  event.preventDefault();
  event.stopPropagation();
  close();
}

onBeforeUnmount(() => {
  requestId += 1;
  requestController?.abort();
  frameDocument?.removeEventListener("keydown", handleFrameKeydown, true);
  releaseDrawer();
});
</script>

<template>
  <section class="outcome-campaign" aria-labelledby="outcome-campaign-title">
    <header class="outcome-heading">
      <div>
        <p class="editorial-label">Owner · Volunteer decisions</p>
        <h3 id="outcome-campaign-title">Outcome emails</h3>
        <p>Selection decisions are saved by reviewers. Preview the exact audience, then confirm each send.</p>
      </div>
      <button class="outcome-pause" type="button" :disabled="busy" @click="togglePause">
        {{ outcomePaused ? "Resume outcome sending" : "Pause outcome sending" }}
      </button>
    </header>

    <div class="outcome-summary" aria-label="Outcome email status">
      <span><strong>{{ eligibleDecisions.length }}</strong> {{ decision === "accepted" ? "accepted" : "not selected" }}</span>
      <span><strong>{{ pendingCount }}</strong> not sent</span>
      <span><strong>{{ sentCount }}</strong> sent</span>
      <span v-if="attentionCount"><strong>{{ attentionCount }}</strong> needs attention</span>
      <span v-if="outcomePaused" class="outcome-paused-state">Sending paused</span>
    </div>

    <div class="outcome-actions">
      <AppDropdown v-model="decision" :options="choiceOptions" density="compact" aria-label="Choose outcome email" />
      <button class="outcome-send" type="button" :disabled="busy" @click="openPreview">
        Preview {{ decision === "accepted" ? "acceptances" : "rejections" }}
      </button>
    </div>

    <p v-if="attentionCount" class="outcome-note" role="status">
      Some sends have an uncertain provider result. Review delivery diagnostics before taking manual action.
    </p>
    <details v-if="deliveryRows.length" class="outcome-diagnostics">
      <summary>Delivery attempts and backoff</summary>
      <div class="outcome-diagnostics-scroll" tabindex="0" aria-label="All outcome delivery attempts">
        <ul>
          <li v-for="recipient in deliveryRows" :key="recipient.id">
            <strong>{{ recipient.applicant_name }}</strong>
            <span>{{ recipient.outcome_delivery?.status.replaceAll("_", " ") }}</span>
            <span>{{ recipient.outcome_delivery?.attempt_count }} attempts</span>
            <span v-if="recipient.outcome_delivery?.next_attempt_at">Retry {{ new Date(recipient.outcome_delivery.next_attempt_at).toLocaleString("en-GH", { timeZone: "Africa/Accra" }) }}</span>
            <span v-if="recipient.outcome_delivery?.last_error" class="outcome-error">{{ recipient.outcome_delivery.last_error }}</span>
          </li>
        </ul>
      </div>
    </details>

    <Teleport to="body">
      <Transition name="outcome-drawer">
        <div v-if="drawerOpen" class="outcome-backdrop" role="presentation" @click.self="close">
          <section ref="drawer" class="outcome-drawer" role="dialog" aria-modal="true" aria-labelledby="outcome-preview-title" tabindex="-1">
            <header>
              <div>
                <p class="editorial-label">Owner preview · 10 minute snapshot</p>
                <h2 id="outcome-preview-title">{{ decision === "accepted" ? "Send acceptances" : "Send rejections" }}</h2>
              </div>
              <button ref="closeButton" class="outcome-close" type="button" aria-label="Close preview" @click="close">×</button>
            </header>
            <div class="outcome-body">
              <div v-if="loading" class="outcome-state" role="status">Preparing the production email and audience snapshot…</div>
              <div v-else-if="error && !preview" class="outcome-state outcome-state--error" role="alert">{{ error }}</div>
              <template v-else-if="preview">
                <div class="outcome-counts">
                  <p><span>Eligible now</span><strong>{{ preview.eligible_count }}</strong></p>
                  <p><span>Excluded or already queued</span><strong>{{ preview.excluded_count }}</strong></p>
                </div>
                <details class="outcome-recipient-list" open>
                  <summary>Frozen recipients ({{ preview.recipients.length }})</summary>
                  <div class="outcome-recipient-scroll" tabindex="0" aria-label="Complete frozen recipient snapshot">
                    <ol>
                      <li v-for="recipient in preview.recipients" :key="recipient.recipient_id">
                        <strong>{{ recipient.name }}</strong>
                        <span>{{ recipient.email }}</span>
                        <span>Decision version {{ recipient.decision_version }}</span>
                      </li>
                    </ol>
                  </div>
                </details>
                <div class="outcome-email-meta"><span>From</span><strong>{{ preview.from }}</strong><span>Subject</span><strong>{{ preview.subject }}</strong></div>
                <p class="outcome-sample-note">Sample template preview; the frozen recipient list above shows who will receive the personalized version.</p>
                <div class="outcome-switch" role="tablist" aria-label="Email format">
                  <button type="button" role="tab" :aria-selected="view === 'email'" @click="view = 'email'">Rendered email</button>
                  <button type="button" role="tab" :aria-selected="view === 'text'" @click="view = 'text'">Plain text</button>
                </div>
                <iframe v-if="view === 'email'" ref="previewFrame" class="outcome-frame" title="Rendered outcome email preview" :srcdoc="htmlPreview" sandbox="allow-same-origin" referrerpolicy="no-referrer" @load="handleFrameLoad" />
                <pre v-else class="outcome-text">{{ preview.text }}</pre>
                <p class="outcome-caution">Nothing is sent until you confirm. Any change to decisions or eligibility makes this snapshot stale and confirmation will fail.</p>
              </template>
              <p v-if="error && preview" class="outcome-error" role="alert">{{ error }}</p>
            </div>
            <footer class="outcome-footer">
              <button ref="confirmButton" class="outcome-send" type="button" :disabled="busy || loading || !preview?.eligible_count || !previewCountMatches" @click="confirmSend">
                {{ busy ? "Queueing…" : `Confirm and queue ${preview?.recipients.length ?? 0} emails` }}
              </button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.outcome-campaign {
  margin-top: 1.25rem;
  padding: 1.15rem;
  border: 1px solid #e2dfd8;
  border-radius: 8px;
  background: #fff;
  color: #25231f;
}

.outcome-heading,
.outcome-actions,
.outcome-summary {
  display: flex;
  align-items: center;
  gap: .8rem;
}

.outcome-heading {
  justify-content: space-between;
  align-items: flex-start;
}

.outcome-heading h3 {
  margin: .3rem 0;
  font-size: 1.05rem;
}

.outcome-heading p:not(.editorial-label) {
  margin: 0;
  color: #69665f;
  font-size: .84rem;
}

.outcome-pause,
.outcome-send {
  min-height: 2.6rem;
  padding: .65rem .9rem;
  border: 1px solid #d3d0c9;
  border-radius: 8px;
  background: #fff;
  color: #25231f;
  font: inherit;
  font-size: .82rem;
  font-weight: 700;
  cursor: pointer;
}

.outcome-send {
  border-color: #c80d68;
  background: #c80d68;
  color: #fff;
}

.outcome-pause:disabled,
.outcome-send:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.outcome-summary {
  flex-wrap: wrap;
  margin: 1rem 0;
  color: #69665f;
  font-size: .78rem;
}

.outcome-summary strong {
  color: #25231f;
}

.outcome-paused-state,
.outcome-note {
  color: #9a3b2d;
}

.outcome-actions {
  align-items: stretch;
}

.outcome-backdrop {
  position: fixed;
  z-index: 1100;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: rgb(25 23 20 / 38%);
}

.outcome-drawer {
  display: flex;
  width: min(42rem, 100%);
  height: 100%;
  flex-direction: column;
  background: #fff;
  box-shadow: -12px 0 36px rgb(20 18 16 / 16%);
}

.outcome-drawer > header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.4rem;
  border-bottom: 1px solid #e6e3dc;
}

.outcome-drawer h2 {
  margin: .25rem 0 0;
  font-size: 1.2rem;
}

.outcome-close {
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 8px;
  background: #f5f2ed;
  color: #25231f;
  font-size: 1.4rem;
  cursor: pointer;
}

.outcome-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 1.1rem 1.4rem 2rem;
}

.outcome-counts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: .7rem;
}

.outcome-counts p {
  display: flex;
  justify-content: space-between;
  padding: .75rem;
  border: 1px solid #e6e3dc;
  border-radius: 8px;
  color: #69665f;
  font-size: .78rem;
}

.outcome-counts strong {
  color: #25231f;
}

.outcome-recipient-list {
  margin: 1rem 0;
  border: 1px solid #e6e3dc;
  border-radius: 8px;
}

.outcome-recipient-list summary,
.outcome-diagnostics summary {
  padding: .7rem .85rem;
  color: #49463f;
  font-size: .8rem;
  font-weight: 700;
  cursor: pointer;
}

.outcome-recipient-scroll,
.outcome-diagnostics-scroll {
  max-height: 13rem;
  overflow: auto;
  overscroll-behavior: contain;
  border-top: 1px solid #e6e3dc;
}

.outcome-recipient-scroll ol,
.outcome-diagnostics-scroll ul {
  display: grid;
  gap: .45rem;
  margin: 0;
  padding: .65rem .85rem .75rem 2rem;
}

.outcome-recipient-scroll li,
.outcome-diagnostics-scroll li {
  display: grid;
  gap: .15rem;
  color: #69665f;
  font-size: .78rem;
  overflow-wrap: anywhere;
}

.outcome-recipient-scroll li strong,
.outcome-diagnostics-scroll li strong {
  color: #25231f;
}

.outcome-sample-note {
  margin: .6rem 0;
  color: #69665f;
  font-size: .78rem;
}

.outcome-email-meta {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: .45rem .7rem;
  margin: 1rem 0;
  font-size: .8rem;
}

.outcome-email-meta span {
  color: #777269;
}

.outcome-email-meta strong {
  overflow-wrap: anywhere;
}

.outcome-switch {
  display: flex;
  gap: .25rem;
  padding: .25rem;
  border-radius: 8px;
  background: #f4f1ea;
}

.outcome-switch button {
  flex: 1;
  padding: .55rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font: inherit;
  font-size: .78rem;
  cursor: pointer;
}

.outcome-switch button[aria-selected="true"] {
  background: #fff;
  color: #bb145e;
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}

.outcome-frame {
  display: block;
  width: 100%;
  height: 27rem;
  margin-top: .8rem;
  border: 1px solid #e6e3dc;
  border-radius: 8px;
}

.outcome-text {
  max-height: 27rem;
  overflow: auto;
  white-space: pre-wrap;
  font: .82rem/1.5 ui-monospace, monospace;
}

.outcome-caution,
.outcome-note {
  color: #69665f;
  font-size: .78rem;
  line-height: 1.5;
}

.outcome-error,
.outcome-state--error {
  color: #9e3131;
}

.outcome-state {
  padding: 2rem .5rem;
  color: #69665f;
  text-align: center;
}

.outcome-footer {
  position: sticky;
  bottom: 0;
  padding: .9rem 1.4rem max(1rem, env(safe-area-inset-bottom));
  border-top: 1px solid #e6e3dc;
  background: #fff;
}

.outcome-footer .outcome-send {
  width: 100%;
}

.outcome-drawer-enter-active,
.outcome-drawer-leave-active {
  transition: opacity 180ms cubic-bezier(.16, 1, .3, 1);
}

.outcome-drawer-enter-from,
.outcome-drawer-leave-to {
  opacity: 0;
}

@media (hover: hover) and (pointer: fine) {
  .outcome-pause:hover,
  .outcome-close:hover,
  .outcome-switch button:hover {
    background-color: #f5f2ed;
  }

  .outcome-send:hover {
    background-color: #b20b5b;
  }
}

.outcome-pause:active,
.outcome-send:active,
.outcome-close:active,
.outcome-switch button:active {
  transform: scale(.97);
}

@media (max-width: 680px) {
  .outcome-heading {
    flex-direction: column;
  }

  .outcome-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .outcome-drawer {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .outcome-drawer-enter-active,
  .outcome-drawer-leave-active {
    transition: none;
  }

  .outcome-pause:active,
  .outcome-send:active,
  .outcome-close:active,
  .outcome-switch button:active {
    transform: none;
  }
}
</style>
