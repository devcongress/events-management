<script setup>
import { ref } from 'vue';
import AppDropdown from '/src/components/AppDropdown.vue';
import AppMultiSelectDropdown from '/src/components/AppMultiSelectDropdown.vue';
import AppDatePicker from '/src/components/ui/AppDatePicker.vue';
import LearningOutcomesEditor from '/src/components/ui/LearningOutcomesEditor.vue';
import AnnualConferenceTaskDrawer from '/src/components/AnnualConferenceTaskDrawer.vue';
const drawerOpen = ref(false);
const choice = ref('');
const multiple = ref([]);
const date = ref('');
const outcomes = ref(['']);
const options = [{ value: 'long', label: 'Open Source & Developer Community' }, { value: 'short', label: 'Tech Education' }];
</script>
<template>
  <main class="mx-auto max-w-xl space-y-5 p-4">
    <h1>Shared form controls</h1>
    <label class="block">Name<input class="editorial-input" aria-label="Name"></label>
    <label class="block">Legacy field<input class="app-form-control" aria-label="Legacy field"></label>
    <AppDropdown v-model="choice" :options="options" label="Topic" placeholder="Choose a topic" teleport />
    <AppMultiSelectDropdown v-model="multiple" :options="options" label="Interests" teleport />
    <AppDatePicker v-model="date" mode="datetime" density="field" label="Deadline" />
    <label class="block">Notes<textarea class="app-form-control" aria-label="Notes" rows="3"></textarea></label>
    <label><input type="checkbox" aria-label="Consent"> Consent</label>
    <label class="block">Disabled<input disabled class="editorial-input" aria-label="Disabled"></label>
    <AppDropdown v-model="choice" :options="options" label="Compact filter" density="slim" />
    <LearningOutcomesEditor v-model="outcomes" />
    <button type="button" @click="drawerOpen = true">Open task drawer</button>
    <AnnualConferenceTaskDrawer :open="drawerOpen" mode="create" :task="null" :tasks="[]" :phases="[]" @close="drawerOpen = false" />
  </main>
</template>
