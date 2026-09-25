<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

type VolunteerView = "directory" | "reviews" | "campaign";

const props = defineProps<{
  modelValue: VolunteerView;
  reviewsVisible: boolean;
  campaignVisible: boolean;
  idPrefix: string;
  mobile?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: VolunteerView];
}>();

const tablist = ref<HTMLElement | null>(null);
const tabs = computed(() => [
  { id: "directory" as const, label: "Directory" },
  ...(props.reviewsVisible
    ? [{ id: "reviews" as const, label: "Reviews" }]
    : []),
  ...(props.campaignVisible
    ? [{ id: "campaign" as const, label: "Campaign" }]
    : []),
]);

watch(
  () => [props.reviewsVisible, props.campaignVisible],
  () => {
    if (props.modelValue === "reviews" && !props.reviewsVisible)
      emit("update:modelValue", "directory");
    if (props.modelValue === "campaign" && !props.campaignVisible)
      emit("update:modelValue", props.reviewsVisible ? "reviews" : "directory");
  },
);

function tabId(value: VolunteerView): string {
  return `${props.idPrefix}-${value}-tab`;
}

function panelId(value: VolunteerView): string {
  return `${props.idPrefix}-${value}-panel`;
}

async function selectTab(value: VolunteerView) {
  emit("update:modelValue", value);
  await nextTick();
  tablist.value?.querySelector<HTMLButtonElement>(`#${tabId(value)}`)?.focus();
}

function handleKeydown(event: KeyboardEvent, current: VolunteerView) {
  const currentIndex = tabs.value.findIndex((tab) => tab.id === current);
  let nextIndex: number;

  if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = tabs.value.length - 1;
  else if (event.key === "ArrowRight")
    nextIndex = (currentIndex + 1) % tabs.value.length;
  else if (event.key === "ArrowLeft")
    nextIndex = (currentIndex - 1 + tabs.value.length) % tabs.value.length;
  else return;

  event.preventDefault();
  void selectTab(tabs.value[nextIndex]!.id);
}
</script>

<template>
  <div
    ref="tablist"
    class="volunteer-workspace-tabs"
    :class="{ 'volunteer-workspace-tabs--mobile': mobile }"
    role="tablist"
    aria-label="Volunteer views"
  >
    <button
      v-for="tab in tabs"
      :id="tabId(tab.id)"
      :key="tab.id"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.id"
      :aria-controls="panelId(tab.id)"
      :tabindex="modelValue === tab.id ? 0 : -1"
      @click="selectTab(tab.id)"
      @keydown="handleKeydown($event, tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.volunteer-workspace-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem 0;
  border: 1px solid #d6d2c9;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  background: #faf8f3;
}

.volunteer-workspace-tabs--mobile {
  margin-bottom: -1rem;
}

.volunteer-workspace-tabs button {
  min-height: 2.75rem;
  padding: 0.65rem 1rem;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 6px 6px 0 0;
  color: #666;
  font-size: 0.82rem;
  font-weight: 700;
  transition: transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
}

.volunteer-workspace-tabs button:active {
  transform: scale(0.97);
}

.volunteer-workspace-tabs button[aria-selected="true"] {
  border-color: #d6d2c9;
  background: #fff;
  color: #111;
  box-shadow: 0 1px #fff;
}

.volunteer-workspace-tabs button:focus-visible {
  outline: 2px solid #e8117f;
  outline-offset: -3px;
}

@media (prefers-reduced-motion: reduce) {
  .volunteer-workspace-tabs button {
    transition: none;
  }

  .volunteer-workspace-tabs button:active {
    transform: none;
  }
}
</style>
