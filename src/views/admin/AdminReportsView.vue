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
  <div>
    <div class="editorial-wrap reports-navigation">
      <WorkspaceSectionNav :active="activeSection" label="Reports sections" :items="sections" />
    </div>
    <AdminAttendanceOverviewView v-if="visited.has('attendance')" v-show="activeSection === 'attendance'" />
    <AdminFeedbackOverviewView v-if="visited.has('feedback')" v-show="activeSection === 'feedback'" />
  </div>
</template>

<style scoped>
.reports-navigation {
  padding-top: 1rem;
}
</style>
