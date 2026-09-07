<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import { ANNUAL_CONFERENCE_LEARNING_OUTCOME_MIN as minimum, ANNUAL_CONFERENCE_LEARNING_OUTCOME_MAX as maximum } from '@/lib/annual-conference-cfp';

const model = defineModel<string[]>({ required: true });
const editor = ref<HTMLElement | null>(null);
const id = useId();
let nextRowId = 0;
// Stable identity keeps removing a middle row from animating or focusing its neighbour.
const rowIds = ref(model.value.map(() => nextRowId++));
const animateRows = ref(true);
const completed = computed(() => model.value.filter((value) => value.trim()).length);
const remaining = computed(() => Math.max(0, minimum - completed.value));
const guidance = computed(() => remaining.value
  ? `Add ${remaining.value} more learning outcome${remaining.value === 1 ? '' : 's'} to continue.`
  : model.value.some((value) => !value.trim())
    ? 'Complete or remove the empty outcomes before submitting.'
    : 'Your learning outcomes are ready. You can add up to 5.');

function retireRow(element: Element) {
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('inert', '');
}

async function add(event: MouseEvent) {
  if (model.value.length >= maximum) return;
  animateRows.value = event.detail !== 0;
  rowIds.value.push(nextRowId++);
  model.value = [...model.value, ''];
  await nextTick();
  editor.value?.querySelector<HTMLInputElement>(`#${CSS.escape(`${id}-outcome-${rowIds.value.at(-1)}`)}`)?.focus();
}

async function remove(index: number, event: MouseEvent) {
  if (model.value.length <= 1) return;
  animateRows.value = event.detail !== 0;
  rowIds.value.splice(index, 1);
  model.value = model.value.filter((_, position) => position !== index);
  await nextTick();
  const nextId = rowIds.value[Math.min(index, rowIds.value.length - 1)];
  const target = nextId === undefined ? 'button[data-add-outcome]' : `#${CSS.escape(`${id}-outcome-${nextId}`)}`;
  editor.value?.querySelector<HTMLElement>(target)?.focus();
}
</script>

<template>
  <fieldset ref="editor" class="space-y-3" :aria-describedby="`${id}-help ${id}-progress`">
    <legend class="sr-only">Learning outcomes</legend>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="editorial-label" aria-hidden="true">Learning outcomes <span class="text-red-600">*</span></p>
      <button v-if="model.length < maximum" data-add-outcome type="button" class="app-form-secondary-action ml-auto" @click="add">
        <span aria-hidden="true">＋</span> Add another outcome
      </button>
    </div>
    <p :id="`${id}-help`" class="app-form-help">Add 3–5 concrete things attendees will understand, be able to do, or take away after your session.</p>
    <TransitionGroup name="form-row" tag="div" class="space-y-3" :css="animateRows" :duration="{ enter: 160, leave: 0 }" @before-leave="retireRow">
      <div v-for="(rowId, index) in rowIds" :key="rowId" class="app-outcome-row">
        <span class="app-outcome-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
        <label class="sr-only" :for="`${id}-outcome-${rowId}`">Learning outcome {{ index + 1 }}</label>
        <input :id="`${id}-outcome-${rowId}`" v-model="model[index]" required :placeholder="`Outcome ${index + 1}`" class="app-form-control" />
        <button v-if="model.length > 1" type="button" class="app-form-icon-action" :aria-label="`Remove learning outcome ${index + 1}`" @click="remove(index, $event)">
          <svg viewBox="0 0 20 20" fill="none" class="size-4" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
        </button>
      </div>
    </TransitionGroup>
    <p :id="`${id}-progress`" class="app-form-help" aria-live="polite"><span class="font-medium">{{ completed <= minimum ? `${completed} of ${minimum} required outcomes added.` : `${completed} outcomes added · 3–5 required.` }}</span> <span class="font-bold text-dc-pink">{{ guidance }}</span></p>
  </fieldset>
</template>
