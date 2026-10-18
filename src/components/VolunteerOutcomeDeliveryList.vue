<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppPagination from "@/src/components/AppPagination.vue";
import { outcomeDeliveryPresentation, type OutcomeDecision, type OutcomeDeliveryGroup, type OutcomeRecipient } from "@/src/lib/outcome-delivery-presentation";

const props = defineProps<{
  recipients: OutcomeRecipient[];
  decision: OutcomeDecision;
  paused: boolean;
  busyId?: string;
  actionError?: string;
}>();
const emit = defineEmits<{
  review: [recipientId: string];
  retry: [recipient: OutcomeRecipient];
  control: [recipient: OutcomeRecipient, action: "hold" | "resume"];
}>();
const search = ref("");
const filter = ref<"all" | OutcomeDeliveryGroup>("all");
const page = ref(1);
const pageSize = 10;
const audienceLabel = computed(() => props.decision === "accepted" ? "Acceptance emails" : "Not-selected emails");
const rows = computed(() => props.recipients
  .filter((recipient) => recipient.decision === props.decision)
  .map((recipient) => ({ recipient, ...outcomeDeliveryPresentation(recipient, props.paused) })));
const filters = computed(() => [
  { value: "all" as const, label: "All", count: rows.value.length },
  ...([
    ["attention", "Needs attention"],
    ["held", "On hold"],
    ["progress", "In progress"],
    ["delivered", "Delivered"],
    ["not_queued", "Not queued"],
  ] as const).map(([value, label]) => ({ value, label, count: rows.value.filter((row) => row.group === value).length })),
]);
const filteredRows = computed(() => rows.value.filter((row) =>
  (filter.value === "all" || row.group === filter.value)
  && `${row.recipient.applicant_name} ${row.recipient.applicant_email ?? ""}`.toLowerCase().includes(search.value.trim().toLowerCase()),
));
const pageCount = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize)));
const visibleRows = computed(() => filteredRows.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const attentionCount = computed(() => rows.value.filter((row) => row.group === "attention").length);

watch(() => props.decision, () => {
  filter.value = "all";
  page.value = 1;
});
watch(search, () => {
  page.value = 1;
});
watch(filter, () => {
  page.value = 1;
});
watch(pageCount, (count) => {
  page.value = Math.min(page.value, count);
});

function retryTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Time unavailable";

  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra",
  }).format(date);
}
</script>

<template>
  <section class="outcome-deliveries" aria-labelledby="outcome-deliveries-title">
    <header class="delivery-heading">
      <div>
        <p class="editorial-label">Delivery status</p>
        <h4 id="outcome-deliveries-title">{{ audienceLabel }}</h4>
        <p>Only the selected audience is shown. Status refreshes every minute.</p>
      </div>
      <p v-if="attentionCount" class="delivery-attention" role="status">{{ attentionCount }} {{ attentionCount === 1 ? 'email needs' : 'emails need' }} owner review.</p>
    </header>
    <p v-if="paused" class="delivery-paused">Queue delivery is paused for both audiences. Emails already with the provider may still be delivered.</p>
    <label class="delivery-search">Find an applicant
      <input v-model="search" type="search" placeholder="Search name or email" />
    </label>
    <div class="delivery-filters" role="group" aria-label="Filter outcome delivery status">
      <button v-for="item in filters" :key="item.value" type="button" :aria-pressed="filter === item.value" @click="filter = item.value">
        {{ item.label }} <span>{{ item.count }}</span>
      </button>
    </div>
    <p v-if="!rows.length" class="delivery-empty">No {{ decision === 'accepted' ? 'accepted' : 'not-selected' }} applicants yet. Save decisions in Reviews to see their email status here.</p>
    <p v-else-if="!filteredRows.length" class="delivery-empty">No emails match these filters. Choose All or clear the search to see more of this audience.</p>
    <p v-if="actionError" role="alert" class="delivery-attention">{{ actionError }}</p>
    <table v-if="filteredRows.length" class="delivery-table">
      <caption class="sr-only">{{ audienceLabel }} delivery status and next steps</caption>
      <thead><tr><th scope="col">Applicant</th><th scope="col">Email status</th><th scope="col">What happens next</th><th scope="col">Actions</th></tr></thead>
      <tbody>
        <tr v-for="row in visibleRows" :key="`${decision}-${row.recipient.id}`" class="delivery-row">
          <th scope="row" class="delivery-identity"><strong>{{ row.recipient.applicant_name }}</strong><span v-if="row.recipient.applicant_email">{{ row.recipient.applicant_email }}</span></th>
          <td class="delivery-status-cell"><span class="delivery-badge" :data-tone="row.group">{{ row.label }}</span></td>
          <td class="delivery-state">
            <p>{{ row.detail }}</p>
            <p v-if="row.recipient.outcome_delivery?.next_attempt_at && row.group === 'progress' && ['queued', 'retrying'].includes(row.recipient.outcome_delivery.status)" class="delivery-schedule">{{ paused ? 'Scheduled retry' : 'Retry eligible from' }} {{ retryTime(row.recipient.outcome_delivery.next_attempt_at) }} (Accra). Timing depends on queue controls and capacity.</p>
            <details v-if="row.recipient.outcome_delivery" class="delivery-details">
              <summary>Delivery details<span class="sr-only"> for {{ row.recipient.applicant_name }}</span></summary>
              <div>
                <p>{{ row.recipient.outcome_delivery.attempt_count }} {{ row.recipient.outcome_delivery.attempt_count === 1 ? 'send attempt' : 'send attempts' }} in the latest email record.</p>
                <p v-if="row.recipient.outcome_diagnostic">{{ row.recipient.outcome_diagnostic.explanation }}</p>
                <p v-if="row.recipient.outcome_diagnostic">{{ row.recipient.outcome_diagnostic.action }}</p>
                <p v-if="row.recipient.outcome_delivery.last_error"><strong>Last recorded issue:</strong> {{ row.recipient.outcome_delivery.last_error }}</p>
                <p v-if="row.recipient.outcome_diagnostic?.retry_block_reason"><strong>Retry safeguard:</strong> {{ row.recipient.outcome_diagnostic.retry_block_reason }}</p>
                <p v-if="row.group === 'attention'">Use Owner diagnostics below for the delivery record and any available recovery action.</p>
              </div>
            </details>
          </td>
          <td class="delivery-row-actions">
            <button v-if="row.recipient.outcome_delivery" type="button" @click="emit('review', row.recipient.id)">Review delivery<span class="sr-only"> for {{ row.recipient.applicant_name }}</span></button>
            <button v-if="row.recipient.outcome_delivery?.individually_controlled && !row.recipient.outcome_delivery.held_at && row.recipient.outcome_delivery.id && row.recipient.outcome_delivery.status === 'failed' && row.recipient.outcome_diagnostic && !row.recipient.outcome_diagnostic.retry_block_reason" type="button" @click="emit('retry', row.recipient)">Queue retry<span class="sr-only"> for {{ row.recipient.applicant_name }}</span></button>
            <button v-if="row.recipient.outcome_control?.can_hold" type="button" :disabled="Boolean(busyId)" @click="emit('control', row.recipient, 'hold')">{{ busyId === row.recipient.id ? 'Holding…' : 'Hold email' }}<span class="sr-only"> for {{ row.recipient.applicant_name }}</span></button>
            <button v-if="row.recipient.outcome_control?.can_resume" type="button" :disabled="Boolean(busyId)" @click="emit('control', row.recipient, 'resume')">{{ busyId === row.recipient.id ? 'Resuming…' : 'Resume email' }}<span class="sr-only"> for {{ row.recipient.applicant_name }}</span></button>
            <span v-if="row.recipient.outcome_control?.reason" class="delivery-no-action">{{ row.recipient.outcome_control.reason }}</span>
            <span v-if="!row.recipient.outcome_delivery" class="delivery-no-action">Use Preview above</span>
          </td>
        </tr>
      </tbody>
    </table>
    <AppPagination v-model:page="page" :page-count="pageCount" :total="filteredRows.length" :range-start="filteredRows.length ? (page - 1) * pageSize + 1 : 0" :range-end="Math.min(page * pageSize, filteredRows.length)" item-label="emails" aria-label="Outcome delivery pagination" />
  </section>
</template>

<style scoped>
.outcome-deliveries {
  margin-top: 1.5rem;
  color: var(--dc-ink, #25231f);
}
.delivery-heading {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  align-items: start;
  gap: .75rem;
}
.delivery-heading h4 {
  margin: .35rem 0;
  font-size: 1.125rem;
  font-weight: 700;
}
.delivery-heading p:not(.editorial-label),
.delivery-state p,
.delivery-empty,
.delivery-paused {
  max-width: 70ch;
  font-size: .875rem;
  line-height: 1.6;
  color: #69665f;
}
.delivery-attention {
  color: oklch(42% .12 40) !important;
  font-weight: 600;
}
.delivery-paused {
  margin-top: .75rem;
  padding: .75rem;
  border: 1px solid oklch(83% .07 85);
  border-radius: 6px;
  background: oklch(97% .03 85);
}
.delivery-search {
  display: grid;
  gap: .4rem;
  max-width: 24rem;
  margin-top: 1rem;
  font-size: .8125rem;
  font-weight: 600;
}
.delivery-search input {
  min-width: 0;
  min-height: 44px;
  padding: .5rem .75rem;
  border: 1px solid #d3d0c9;
  border-radius: 6px;
  background: #faf9f6;
  font-size: 1rem;
  font-weight: 400;
}
.delivery-row-actions button + button {
  margin-top: .5rem;
}
.delivery-no-action {
  font-size: .8125rem;
  color: #69665f;
  display: block;
  margin-top: .5rem;
}
.delivery-filters {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  margin: 1rem 0;
}
.delivery-filters button,
.delivery-row-actions button {
  display: inline-flex;
  align-items: center;
  gap: .5rem;
  min-height: 44px;
  padding: .5rem .75rem;
  border: 1px solid #d3d0c9;
  border-radius: 6px;
  background: #faf9f6;
  font-size: .8125rem;
  font-weight: 600;
  transition: transform 120ms cubic-bezier(.4, 0, .2, 1);
}
.delivery-filters button[aria-pressed="true"] {
  border-color: #25231f;
  background: #f9ed32;
}
.delivery-filters button span {
  font-variant-numeric: tabular-nums;
}
.delivery-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  text-align: left;
}
.delivery-table thead th {
  padding: .75rem .75rem .75rem 0;
  border-bottom: 1px solid #d3d0c9;
  color: #69665f;
  font-size: .75rem;
  font-weight: 600;
}
.delivery-table thead th:first-child {
  width: 23%;
}
.delivery-table thead th:nth-child(2) {
  width: 19%;
}
.delivery-table thead th:last-child {
  width: 17%;
}
.delivery-row > th,
.delivery-row > td {
  vertical-align: top;
  padding: 1rem .75rem 1rem 0;
  border-bottom: 1px solid #e2dfd8;
  overflow-wrap: anywhere;
}
.delivery-identity {
  font-size: .875rem;
  font-weight: 400;
}
.delivery-identity strong,
.delivery-identity span {
  display: block;
}
.delivery-identity span {
  margin-top: .25rem;
  font-size: .75rem;
  color: #69665f;
}
.delivery-badge {
  display: inline-flex;
  padding: .25rem .5rem;
  border-radius: 6px;
  background: oklch(94% .01 85);
  color: oklch(36% .02 85);
  font-size: .75rem;
  font-weight: 700;
}
.delivery-badge[data-tone="delivered"] {
  color: oklch(38% .08 150);
  background: oklch(96% .025 150);
}
.delivery-badge[data-tone="attention"] {
  color: oklch(42% .12 40);
  background: oklch(96% .03 65);
}
.delivery-state > p {
  margin: 0;
}
.delivery-schedule {
  font-size: .8125rem !important;
}
.delivery-details summary {
  display: flex;
  align-items: center;
  gap: .5rem;
  min-height: 44px;
  cursor: pointer;
  font-size: .8125rem;
  font-weight: 600;
}
.delivery-details summary::before {
  content: '›';
  transition: transform 160ms cubic-bezier(.16, 1, .3, 1);
}
.delivery-details[open] summary::before {
  transform: rotate(90deg);
}
.delivery-details summary::-webkit-details-marker {
  display: none;
}
.delivery-details > div {
  padding: .25rem 0 .5rem;
}
.delivery-details p + p {
  margin-top: .5rem;
}
.delivery-filters button:focus-visible,
.delivery-row-actions button:focus-visible,
.delivery-search input:focus-visible,
.delivery-details summary:focus-visible {
  outline: 2px solid #c80d68;
  outline-offset: 3px;
}
.delivery-filters button:active,
.delivery-row-actions button:active {
  transform: scale(.97);
}
@media (hover: hover) and (pointer: fine) {
  .delivery-filters button:hover,
  .delivery-row-actions button:hover {
    border-color: #25231f;
  }
}
@media (max-width: 680px) {
  .delivery-table,
  .delivery-table tbody {
    display: block;
  }
  .delivery-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .delivery-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: .65rem;
    padding: 1rem 0;
    border-top: 1px solid #e2dfd8;
  }
  .delivery-row > th,
  .delivery-row > td {
    display: block;
    padding: 0;
    border: 0;
  }
  .outcome-deliveries :deep(.app-pagination) {
    grid-template-columns: 1fr 1fr;
    padding-inline: 0;
  }
  .outcome-deliveries :deep(.app-pagination__count) {
    grid-column: 1 / -1;
    grid-row: 1;
  }
  .outcome-deliveries :deep(.app-pagination__button) {
    min-height: 44px;
    padding-inline: .5rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .delivery-filters button,
  .delivery-row-actions button,
  .delivery-details summary::before {
    transition: none;
  }
  .delivery-filters button:active,
  .delivery-row-actions button:active {
    transform: none;
  }
}
</style>
