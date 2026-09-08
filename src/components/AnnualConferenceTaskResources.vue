<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { normalizeTaskResourceUrl, type AnnualConferenceTaskResourcesResponse, type AnnualConferenceTaskResourceView } from '@/lib/annual-conference-task-resources';
import { fetchAnnualConferenceTaskResources, createAnnualConferenceTaskResource, updateAnnualConferenceTaskResource, deleteAnnualConferenceTaskResource } from '@/src/lib/annual-conference-task-resources-api';

// Parent keys this component by edition/task so pending actions cannot target another task.
const props = defineProps<{ year: string; taskId: string }>();
const queryClient = useQueryClient();
const queryKey = ['annual-conference-task-resources', props.year, props.taskId];
const query = useQuery({ queryKey, queryFn: () => fetchAnnualConferenceTaskResources(props.year, props.taskId) });
const resources = computed(() => query.data.value?.resources ?? []);
const editing = ref<string | null>(null);
const adding = ref(false);
const removing = ref<string | null>(null);
const url = ref('');
const label = ref('');
const error = ref('');
const success = ref('');
const pending = ref(false);
const urlInput = ref<HTMLInputElement | null>(null);
const addButton = ref<HTMLButtonElement | null>(null);
const heading = ref<HTMLElement | null>(null);
async function restoreFocus() {
  pending.value = false;
  await nextTick();
  if (addButton.value && !addButton.value.disabled) addButton.value.focus();
  else heading.value?.focus();
}
const canAdd = computed(() => query.data.value?.permissions.can_add && resources.value.length < query.data.value.permissions.max_resources);

async function openEditor(resource?: AnnualConferenceTaskResourceView) {
  editing.value = resource?.id ?? null;
  adding.value = !resource;
  removing.value = null;
  url.value = resource?.url ?? '';
  label.value = resource?.label ?? '';
  error.value = '';
  success.value = '';
  await nextTick();
  urlInput.value?.focus();
}
function closeEditor() { editing.value = null; adding.value = false; error.value = ''; }
async function save() {
  if (pending.value) return;
  const normalized = normalizeTaskResourceUrl(url.value);
  if (!normalized) { error.value = 'Enter a complete http:// or https:// link.'; urlInput.value?.focus(); return; }
  pending.value = true;
  error.value = '';
  try {
    const input = { url: normalized, label: label.value.trim() || null };
    const result = editing.value
      ? await updateAnnualConferenceTaskResource(props.year, props.taskId, editing.value, input)
      : await createAnnualConferenceTaskResource(props.year, props.taskId, input);
    queryClient.setQueryData<AnnualConferenceTaskResourcesResponse>(queryKey, (current) => current ? {
      ...current, resources: editing.value ? current.resources.map((item) => item.id === result.resource.id ? result.resource : item) : [...current.resources, result.resource],
    } : current);
    closeEditor();
    success.value = 'Resource saved.';
    await queryClient.invalidateQueries({ queryKey });
    await restoreFocus();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to save this resource.'; }
  finally { pending.value = false; }
}
async function remove(resourceId: string) {
  if (pending.value) return;
  pending.value = true;
  error.value = '';
  try {
    await deleteAnnualConferenceTaskResource(props.year, props.taskId, resourceId);
    queryClient.setQueryData<AnnualConferenceTaskResourcesResponse>(queryKey, (current) => current ? { ...current, resources: current.resources.filter((item) => item.id !== resourceId) } : current);
    removing.value = null;
    success.value = 'Resource removed.';
    await queryClient.invalidateQueries({ queryKey });
    await restoreFocus();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to remove this resource.'; }
  finally { pending.value = false; }
}
</script>

<template>
  <section class="mt-6 border-t border-dc-border pt-5" aria-labelledby="task-resources-heading">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h3 id="task-resources-heading" ref="heading" tabindex="-1" class="font-semibold text-dc-ink">Resources <span v-if="query.data.value" class="ml-1 text-xs font-normal text-dc-gray">{{ resources.length }}/{{ query.data.value.permissions.max_resources }}</span></h3>
      <button v-if="query.data.value?.permissions.can_add" ref="addButton" type="button" class="resource-button text-dc-pink" :disabled="!canAdd || pending || adding || Boolean(editing)" @click="openEditor()">+ Add resource</button>
    </div>
    <p class="mt-1 text-xs leading-5 text-dc-gray">Keep documents, designs and useful references together. Links only—no file uploads.</p>
    <p v-if="query.isPending.value" role="status" class="mt-3 text-sm text-dc-gray">Loading resources…</p>
    <p v-else-if="query.isError.value" role="alert" class="mt-3 text-sm text-red-700">Unable to load task resources.</p>
    <p v-else-if="!resources.length && !adding" class="mt-4 rounded-lg border border-dashed border-dc-border p-4 text-sm text-dc-gray">No resources yet. Add a link when you have something useful to share.</p>
    <ul v-if="resources.length" class="mt-3 divide-y divide-dc-border">
      <li v-for="resource in resources" :key="resource.id" class="py-3">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0 flex-1 basis-48">
            <a :href="normalizeTaskResourceUrl(resource.url) ?? undefined" target="_blank" rel="noopener noreferrer" class="break-words text-sm font-semibold text-dc-pink underline decoration-dc-pink/30 underline-offset-4 [overflow-wrap:anywhere]">{{ resource.label || resource.url }} <span aria-label="opens in a new tab">↗</span></a>
            <p v-if="resource.label" class="mt-1 break-all text-xs text-dc-gray">{{ resource.url }}</p>
            <p class="mt-1 break-all text-xs text-dc-gray">Added by {{ resource.created_by_email }}</p>
          </div>
          <div v-if="resource.can_manage" class="flex gap-1">
            <button type="button" class="resource-button" :disabled="pending || adding || Boolean(editing)" :aria-label="`Edit ${resource.label || resource.url}`" @click="openEditor(resource)">Edit</button>
            <button type="button" class="resource-button text-red-700" :disabled="pending || adding || Boolean(editing)" :aria-label="`Remove ${resource.label || resource.url}`" @click="removing = resource.id; error = ''; success = ''">Remove</button>
          </div>
        </div>
        <div v-if="removing === resource.id" class="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <p>Remove this resource link? The original document won’t be deleted.</p>
          <div class="mt-2 flex gap-2">
            <button type="button" class="resource-button bg-red-700 text-white" :disabled="pending" @click="remove(resource.id)">{{ pending ? 'Removing…' : 'Remove link' }}</button>
            <button type="button" class="resource-button" :disabled="pending" @click="removing = null">Cancel</button>
          </div>
        </div>
      </li>
    </ul>
    <form v-if="adding || editing" class="mt-3 space-y-3 rounded-lg border border-dc-border bg-dc-paper/50 p-3" @submit.prevent="save">
      <p class="text-sm font-semibold">{{ editing ? 'Edit resource' : 'Add a resource' }}</p>
      <label class="block text-xs font-semibold">Resource URL <span class="text-dc-pink">*</span><input ref="urlInput" v-model="url" class="editorial-input mt-1" type="url" required maxlength="2048" placeholder="https://…" :disabled="pending" /></label>
      <label class="block text-xs font-semibold">Label <span class="font-normal text-dc-gray">(optional)</span><input v-model="label" class="editorial-input mt-1" maxlength="120" placeholder="e.g. Final speaker flyer" :disabled="pending" /></label>
      <div class="flex flex-wrap gap-2">
        <button type="submit" class="resource-button bg-dc-pink text-white" :disabled="pending">{{ pending ? 'Saving…' : 'Save resource' }}</button>
        <button type="button" class="resource-button" :disabled="pending" @click="closeEditor">Cancel</button>
      </div>
    </form>
    <p v-if="query.data.value && resources.length >= query.data.value.permissions.max_resources" class="mt-3 text-xs text-dc-gray">This task has reached its 20-link limit. Use a shared folder for larger collections.</p>
    <p v-if="error" role="alert" class="mt-3 text-sm font-semibold text-red-700">{{ error }}</p>
    <p v-if="success" role="status" class="mt-3 text-sm text-green-700">{{ success }}</p>
  </section>
</template>

<style scoped>
.resource-button { min-height: 44px; border-radius: 6px; padding: .5rem .75rem; font-size: .75rem; font-weight: 600; }
.resource-button:focus-visible { outline: 2px solid var(--dc-pink, #ec008c); outline-offset: 2px; }
.resource-button:disabled { opacity: .45; cursor: not-allowed; }
</style>
