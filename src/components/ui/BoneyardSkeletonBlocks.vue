<script setup lang="ts">
import type { SkeletonBlock, SkeletonColumn } from '@/src/boneyard/sections/types';
import BoneyardWorkPlanFixture from './BoneyardWorkPlanFixture.vue';
import BoneyardRegistrationSummaryFixture from './BoneyardRegistrationSummaryFixture.vue';
import BoneyardOperationsFixture from './BoneyardOperationsFixture.vue';
import BoneyardFormBoardFixture from './BoneyardFormBoardFixture.vue';
import BoneyardLearningLobbyFixture from './BoneyardLearningLobbyFixture.vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import BoneyardConferenceIntakeFixture from './BoneyardConferenceIntakeFixture.vue';
import BoneyardTicketOrdersFixture from './BoneyardTicketOrdersFixture.vue';

defineProps<{ blocks: SkeletonBlock[]; sectionName?: string }>();

function cellValue(column: SkeletonColumn, row: number) {
  switch (column.cell) {
    case 'person': return 'Community member';
    case 'badge': return 'Confirmed';
    case 'action': return 'View details';
    case 'number': return String(row * 12);
    case 'date': return '28 Oct 2026';
    default: return column.label;
  }
}
</script>

<template>
  <div class="ems-loading-blocks">
    <template v-for="(block, index) in blocks" :key="index">
      <BoneyardWorkPlanFixture v-if="block.kind === 'work-plan'" :view="block.view" :assigned="block.assigned" />
      <BoneyardTicketOrdersFixture v-else-if="block.kind === 'ticket-orders'" :rows="block.rows" :panel="block.panel" />
      <BoneyardConferenceIntakeFixture v-else-if="block.kind === 'speaker-conference-intake'" />
      <BoneyardLearningLobbyFixture v-else-if="block.kind === 'learning-lobby'" />
      <BoneyardOperationsFixture v-else-if="block.kind === 'operations-directory'" :view="block.view" :owner="block.owner" />
      <BoneyardFormBoardFixture v-else-if="block.kind === 'form-board'" :count="block.count" />
      <BoneyardRegistrationSummaryFixture v-else-if="block.kind === 'registration-summary'" />
      <header v-else-if="block.kind === 'heading'" class="ems-loading-heading" :class="{ 'ems-loading-heading--speaker': sectionName === 'annual-conference-speakers' }">
        <div>
          <p v-if="block.eyebrow" class="ems-loading-caption">{{ block.eyebrow }}</p>
          <component :is="block.level === 'section' ? 'h2' : 'h1'">{{ block.title }}</component>
          <p v-if="block.description">{{ block.description }}</p>
        </div>
        <button v-if="block.action" class="ems-loading-heading-action" disabled>{{ block.action }}</button>
        <template v-if="sectionName === 'annual-conference-speakers'">
          <button class="ems-loading-speaker-controls" disabled>Call controls and deadline</button>
          <div class="ems-loading-speaker-nav">
            <AppDropdown model-value="proposals" label="Speaker sections" :options="[{ value: 'proposals', label: 'Proposals' }]" density="compact" trigger-class="min-h-11" disabled />
          </div>
        </template>
      </header>

      <div
        v-else-if="block.kind === 'tabs'"
        class="ems-loading-tabs"
        :class="{ 'ems-loading-tabs--underline underline-section-nav': block.appearance === 'underline', 'ems-loading-tabs--audit': sectionName === 'admin-audit-log', 'ems-loading-tabs--campaign': sectionName === 'volunteer-follow-up-campaign' }"
      >
        <div v-if="sectionName === 'admin-audit-log'" class="ems-loading-audit-section-picker">
          <AppDropdown model-value="activity" label="Audit section" :options="[{ value: 'activity', label: 'Activity' }]" density="compact" disabled />
        </div>
        <div v-if="sectionName === 'volunteer-follow-up-campaign'" class="ems-loading-campaign-section-picker">
          <AppDropdown model-value="updates" label="Campaign section" :options="[{ value: 'updates', label: 'Volunteer updates' }]" density="compact" trigger-class="min-h-11" disabled />
        </div>
        <span
          v-for="(label, tab) in block.labels"
          :key="label"
          :class="{ 'ems-loading-active': tab === (block.active ?? 0), 'underline-section-tab': block.appearance === 'underline' }"
          :aria-current="block.appearance === 'underline' && tab === (block.active ?? 0) ? 'page' : undefined"
        >
          <span v-if="block.appearance === 'underline'" class="underline-section-tab__content"><span>{{ label }}</span></span>
          <template v-else>{{ label }}</template>
        </span>
      </div>

      <div v-else-if="block.kind === 'toolbar'" class="ems-loading-toolbar" :class="{ 'ems-loading-toolbar--reviews': sectionName === 'volunteer-reviews', 'ems-loading-toolbar--audit': sectionName === 'admin-audit-log' }">
        <input v-if="block.search" class="app-form-control" :value="block.search" disabled />
        <button v-for="filter in block.filters" :key="filter" :class="{ 'ems-loading-review-secondary': sectionName === 'volunteer-reviews' && filter !== 'Review' }" disabled>{{ filter }} <span>⌄</span></button>
        <button v-if="sectionName === 'volunteer-reviews'" class="ems-loading-review-more" disabled>More filters</button>
        <button v-if="sectionName === 'admin-audit-log'" class="ems-loading-audit-filter" disabled>Filter activity</button>
        <button v-for="action in block.actions" :key="action" disabled>{{ action }}</button>
      </div>

      <div
        v-else-if="block.kind === 'stats'"
        class="ems-loading-grid ems-loading-stats"
        :class="[`ems-loading-stats--${block.columns ?? block.labels.length}`, { 'ems-loading-stats--compact': block.compact }]"
        :style="{ '--loading-columns': block.columns ?? block.labels.length }"
      >
        <article v-for="(label, stat) in block.labels" :key="label">
          <span>{{ label }}</span>
          <strong>{{ (stat + 1) * 12 }}</strong>
          <p v-if="block.details?.[stat]">{{ block.details[stat] }}</p>
        </article>
      </div>

      <div v-else-if="block.kind === 'table'" class="ems-loading-table" :class="{ 'ems-loading-table--cards': block.mobile === 'cards' }">
        <ul v-if="block.mobile === 'cards'" class="ems-loading-mobile-cards">
          <li v-for="row in block.rows ?? 3" :key="row">
            <template v-if="sectionName === 'admin-audit-log'">
              <div class="ems-loading-mobile-card-field ems-loading-mobile-card-field--wide"><strong>Event updated</strong></div>
              <div class="ems-loading-mobile-card-field ems-loading-mobile-card-field--wide"><span>organizer@example.com · Owner</span></div>
              <div class="ems-loading-mobile-card-field ems-loading-mobile-card-field--wide"><span>28 Oct · 12:00 PM</span></div>
            </template>
            <template v-else>
              <div v-for="column in block.columns.filter(item => sectionName !== 'admin-archived-events' || item.label !== 'Actions')" :key="column.label" class="ems-loading-mobile-card-field">
                <span class="ems-loading-cell-label">{{ column.label }}</span>
                <strong>{{ cellValue(column, row) }}</strong>
              </div>
              <div v-if="sectionName === 'admin-archived-events'" class="ems-loading-mobile-card-field--wide ems-loading-actions">
                <button disabled>Restore</button>
                <button disabled>Delete forever</button>
              </div>
            </template>
          </li>
        </ul>
        <table>
          <colgroup><col v-for="column in block.columns" :key="column.label" :style="{ width: column.width }" /></colgroup>
          <thead><tr><th v-for="column in block.columns" :key="column.label">{{ column.label }}</th></tr></thead>
          <tbody>
            <tr v-for="row in block.rows ?? 3" :key="row">
              <td v-for="column in block.columns" :key="column.label" :data-label="column.label">
                <div v-if="column.cell === 'image'" class="ems-loading-thumbnail" />
                <div v-else-if="column.cell === 'person'" class="ems-loading-person">
                  <i class="ems-loading-avatar" />
                  <span>{{ cellValue(column, row) }}<small>member@example.com</small></span>
                </div>
                <span v-else :class="{ 'ems-loading-badge': column.cell === 'badge' }">{{ cellValue(column, row) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="block.kind === 'cards' && sectionName === 'admin-present-forms-choices'" class="ems-loading-form-choices">
        <article v-for="choice in block.count ?? 3" :key="choice">
          <div><span>Selected</span><span class="ems-loading-choice-box" /></div>
          <strong>Available community form</strong>
          <p>Event and form details</p>
        </article>
      </div>

      <div v-else-if="block.kind === 'cards'" class="ems-loading-grid" :style="{ '--loading-columns': block.columns ?? 3 }">
        <article v-for="card in block.count ?? 3" :key="card" class="ems-loading-card">
          <div v-if="block.media === 'image'" class="ems-loading-media" />
          <div v-else-if="block.media === 'avatar' || block.media === 'icon'" class="ems-loading-avatar" />
          <h3>{{ block.title ?? 'Community event' }}</h3>
          <p v-if="block.description">{{ block.description }}</p>
          <p v-for="meta in block.meta" :key="meta" class="ems-loading-caption">{{ meta }}</p>
          <div v-if="block.actions?.length" class="ems-loading-actions">
            <button v-for="action in block.actions" :key="action" disabled>{{ action }}</button>
          </div>
        </article>
      </div>

      <section v-else-if="block.kind === 'form'" class="ems-loading-panel" :class="{ 'ems-loading-collapsed-form': sectionName === 'volunteer-reviews' && block.title === 'Saved email copy', 'ems-loading-speaker-deadline': sectionName === 'annual-conference-speakers' }">
        <h2 v-if="block.title">{{ block.title }}</h2>
        <p v-if="block.description">{{ block.description }}</p>
        <button v-if="sectionName === 'volunteer-reviews' && block.title === 'Saved email copy'" class="ems-loading-form-toggle" disabled>Edit email copy</button>
        <div class="ems-loading-grid ems-loading-fields" :style="{ '--loading-columns': block.columns ?? 1 }">
          <label v-for="field in block.fields" :key="field.label" :class="{ 'ems-loading-full': field.fullWidth }">
            <span>{{ field.label }}</span>
            <textarea v-if="field.type === 'textarea'" class="app-form-control" rows="4" disabled />
            <div v-else-if="field.type === 'upload'" class="ems-loading-upload">Choose file</div>
            <span v-else-if="field.type === 'toggle'" class="ems-loading-toggle" />
            <AppDropdown
              v-else-if="field.type === 'select'"
              model-value=""
              :options="[{ value: '', label: 'Choose an option' }]"
              :aria-label="field.label"
              disabled
            />
            <input v-else class="app-form-control" value="" disabled />
          </label>
        </div>
        <div v-if="block.actions?.length" class="ems-loading-actions">
          <button v-for="action in block.actions" :key="action" disabled>{{ action }}</button>
        </div>
      </section>

      <div v-else-if="block.kind === 'split'" class="ems-loading-split" :class="`ems-loading-split--${block.ratio ?? 'sidebar'}`">
        <BoneyardSkeletonBlocks v-for="(group, groupIndex) in block.blocks" :key="groupIndex" :blocks="group" :section-name="sectionName" />
      </div>

      <div v-else-if="block.kind === 'board'" class="ems-loading-board" :style="{ '--loading-columns': block.columns.length }">
        <section v-for="column in block.columns" :key="column" class="ems-loading-panel">
          <h3>{{ column }}</h3>
          <article v-for="card in block.cards ?? 2" :key="card" class="ems-loading-card">
            <h3>Conference task</h3><p>Responsible person</p><span class="ems-loading-badge">In progress</span>
          </article>
        </section>
      </div>

      <section v-else-if="block.kind === 'list'" class="ems-loading-panel" :class="{ 'ems-loading-list--compact': block.compact }">
        <h2 v-if="block.title">{{ block.title }}</h2>
        <div v-for="row in block.rows ?? 3" :key="row" class="ems-loading-list-row">
          <i v-if="block.avatar" class="ems-loading-avatar" />
          <div><strong>{{ block.labels?.[row - 1] ?? block.secondary ?? 'Community event' }}</strong><p v-if="!block.compact">Details and next steps</p></div>
          <strong v-if="block.compact">24</strong>
          <button v-for="action in block.actions" :key="action" disabled>{{ action }}</button>
        </div>
      </section>

      <div v-else-if="block.kind === 'qr'" class="ems-loading-grid" :style="{ '--loading-columns': block.columns ?? 1 }">
        <article v-for="code in block.count ?? 1" :key="code" class="ems-loading-qr-card">
          <div class="ems-loading-qr" /><h2>Scan to join</h2><p>Open with your phone camera</p>
        </article>
      </div>

      <section v-else-if="block.kind === 'hero'" class="ems-loading-hero" :class="{ 'ems-loading-hero--media': block.media }">
        <div>
          <h1>{{ block.title }}</h1><p v-if="block.description">{{ block.description }}</p>
          <button v-if="block.action" disabled>{{ block.action }}</button>
        </div>
        <div v-if="block.media" class="ems-loading-media" />
      </section>

      <section v-else-if="block.kind === 'chart'" class="ems-loading-panel">
        <h2 v-if="block.title">{{ block.title }}</h2>
        <div class="ems-loading-chart" :class="`ems-loading-chart--${block.chart ?? 'bars'}`">
          <div v-for="bar in 7" :key="bar" :style="{ height: `${30 + bar % 4 * 18}%` }" />
        </div>
      </section>

      <div v-else-if="block.kind === 'progress'" class="ems-loading-progress">
        <span>{{ block.label }}</span><div><i /></div>
      </div>

      <section v-else-if="block.kind === 'section'" class="ems-loading-panel" :class="{ 'ems-loading-panel--plain': block.plain }">
        <h2 v-if="block.title">{{ block.title }}</h2>
        <p v-if="block.description">{{ block.description }}</p>
        <BoneyardSkeletonBlocks :blocks="block.blocks" :section-name="sectionName" />
      </section>
    </template>
  </div>
</template>

<style scoped src="./boneyard-skeleton-blocks.css" />
<style scoped src="@/src/styles/underline-section-nav.css" />
