<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { adminPath } from '@/src/admin-routes';
import WorkspaceSectionNav from '@/src/components/WorkspaceSectionNav.vue';
import AdminAttendanceOverviewView from './AdminAttendanceOverviewView.vue';
import AdminFeedbackOverviewView from './AdminFeedbackOverviewView.vue';

const route = useRoute();
const activeSection = computed(() => route.query.section === 'feedback' ? 'feedback' : 'attendance');
const visited = ref(new Set([activeSection.value]));
const sections = computed(() => [
  { key: 'attendance', label: 'Attendance', to: { path: adminPath('reports'), query: { ...route.query, section: 'attendance' }, hash: route.hash } },
  { key: 'feedback', label: 'Feedback', to: { path: adminPath('reports'), query: { ...route.query, section: 'feedback' }, hash: route.hash } },
]);

watch(activeSection, section => {
  visited.value.add(section);
});
</script>

<template>
  <div class="reports-workspace">
    <div class="editorial-wrap reports-navigation">
      <WorkspaceSectionNav :active="activeSection" label="Reports sections" :items="sections">
        <template #icon="{ item }">
          <svg class="reports-tab-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <template v-if="item.key === 'attendance'">
              <circle cx="9" cy="7" r="3" stroke="currentColor" stroke-width="1.8" />
              <path d="M3 20v-2a6 6 0 0 1 12 0v2m2-10 2 2 3-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </template>
            <path v-else d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1Zm2 5h10M7 13h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </template>
      </WorkspaceSectionNav>
    </div>
    <AdminAttendanceOverviewView v-if="visited.has('attendance')" v-show="activeSection === 'attendance'" />
    <AdminFeedbackOverviewView v-if="visited.has('feedback')" v-show="activeSection === 'feedback'" />
  </div>
</template>

<style scoped>
.reports-navigation {
  padding-block: 0 !important;
}

.reports-navigation :deep(.workspace-section-nav__viewport) {
  gap: 1rem;
}

.reports-workspace :deep(.editorial-page > .editorial-wrap) {
  padding-top: 1.25rem !important;
}

.reports-tab-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}
</style>
