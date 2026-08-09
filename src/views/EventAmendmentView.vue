<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';

type Amendment = { status: string };
type Submission = { title: string; starts_at: string; ends_at: string; location_type: 'in_person' | 'online' | 'hybrid'; venue_name: string | null; venue_address: string | null; online_url: string | null; registration_url: string | null };
const route = useRoute();
const loading = ref(true);
const saving = ref(false);
const submitting = ref(false);
const error = ref('');
const saved = ref(false);
const unavailable = ref('');
const submission = ref<Submission | null>(null);
const amendment = ref<Amendment | null>(null);
const form = reactive({ starts_at: '', ends_at: '', location_type: 'in_person' as Submission['location_type'], venue_name: '', venue_address: '', online_url: '', registration_url: '', organizer_note: '' });
const capability = String(route.params.capability ?? '');

function toLocal(iso: string) { return iso ? iso.slice(0, 16) : ''; }
function payload() {
  return { ...form, starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString() };
}
async function load() {
  loading.value = true;
  try {
    const response = await fetch(`/api/public/event-submissions/manage/${encodeURIComponent(capability)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { unavailable.value = data.error || 'This event link is no longer available.'; return; }
    submission.value = data.management.submission;
    const source = data.management.amendment ?? data.management.submission;
    amendment.value = data.management.amendment;
    Object.assign(form, { starts_at: toLocal(source.starts_at), ends_at: toLocal(source.ends_at), location_type: source.location_type, venue_name: source.venue_name || '', venue_address: source.venue_address || '', online_url: source.online_url || '', registration_url: source.registration_url || '', organizer_note: source.organizer_note || '' });
  } catch { unavailable.value = 'This event link could not be opened. Please try again later.'; }
  finally { loading.value = false; }
}
async function save() {
  saving.value = true; error.value = ''; saved.value = false;
  try {
    const response = await fetch(`/api/public/event-submissions/manage/${encodeURIComponent(capability)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Changes could not be saved.');
    amendment.value = data.amendment; saved.value = true;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Changes could not be saved.'; }
  finally { saving.value = false; }
}
async function submit() {
  await save();
  if (!saved.value) return;
  submitting.value = true; error.value = '';
  try {
    const response = await fetch(`/api/public/event-submissions/manage/${encodeURIComponent(capability)}/submit`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Changes could not be submitted.');
    amendment.value = data.amendment;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Changes could not be submitted.'; }
  finally { submitting.value = false; }
}
onMounted(load);
</script>

<template>
  <main class="min-h-full bg-dc-cream px-4 py-8 text-dc-ink sm:px-6 lg:px-8">
    <section v-if="loading" class="mx-auto max-w-3xl animate-pulse rounded-lg border border-dc-line bg-dc-paper p-8"><div class="h-8 w-2/3 bg-dc-cream" /><div class="mt-5 h-5 w-full bg-dc-cream" /></section>
    <section v-else-if="unavailable" class="mx-auto max-w-lg rounded-lg border-2 border-dc-ink bg-dc-paper p-8 shadow-[3px_3px_0_#111111]"><p class="font-mono text-xs font-bold tracking-[0.16em] text-dc-pink">EVENT LINK CLOSED</p><h1 class="mt-3 text-3xl font-bold">This event link is unavailable.</h1><p class="mt-3 text-dc-gray">{{ unavailable }}</p></section>
    <section v-else class="mx-auto max-w-3xl">
      <p class="font-mono text-xs font-bold tracking-[0.16em] text-dc-pink">COMMUNITY CALENDAR</p>
      <h1 class="mt-3 text-4xl font-bold tracking-tight">Update event details</h1>
      <p class="mt-3 max-w-2xl text-dc-gray">{{ submission?.title }} · Changes are reviewed before the published listing is updated.</p>
      <div v-if="amendment?.status === 'submitted'" class="mt-6 rounded-lg border border-dc-line bg-dc-yellow/20 p-5"><strong>Changes submitted for review</strong><p class="mt-1 text-sm text-dc-gray">You cannot edit this request while it is being reviewed.</p></div>
      <form v-else class="mt-8 rounded-lg border-2 border-dc-ink bg-dc-paper p-5 shadow-[3px_3px_0_#111111] sm:p-8" @submit.prevent="submit">
        <div class="grid gap-5 sm:grid-cols-2"><label class="grid gap-2 text-sm font-semibold">Starts<input v-model="form.starts_at" class="rounded border border-dc-line px-3 py-2" type="datetime-local" required></label><label class="grid gap-2 text-sm font-semibold">Ends<input v-model="form.ends_at" class="rounded border border-dc-line px-3 py-2" type="datetime-local" required></label></div>
        <label class="mt-5 grid gap-2 text-sm font-semibold">Event format<select v-model="form.location_type" class="rounded border border-dc-line px-3 py-2"><option value="in_person">In person</option><option value="online">Online</option><option value="hybrid">Hybrid</option></select></label>
        <div v-if="form.location_type !== 'online'" class="mt-5 grid gap-5 sm:grid-cols-2"><label class="grid gap-2 text-sm font-semibold">Venue name<input v-model="form.venue_name" class="rounded border border-dc-line px-3 py-2" required></label><label class="grid gap-2 text-sm font-semibold">Venue address<input v-model="form.venue_address" class="rounded border border-dc-line px-3 py-2"></label></div>
        <label v-if="form.location_type !== 'in_person'" class="mt-5 grid gap-2 text-sm font-semibold">Online event link<input v-model="form.online_url" class="rounded border border-dc-line px-3 py-2" type="url" required></label>
        <label class="mt-5 grid gap-2 text-sm font-semibold">Registration link<input v-model="form.registration_url" class="rounded border border-dc-line px-3 py-2" type="url"></label>
        <label class="mt-5 grid gap-2 text-sm font-semibold">Note for the reviewer <span class="font-normal text-dc-gray">(optional)</span><textarea v-model="form.organizer_note" class="min-h-24 rounded border border-dc-line px-3 py-2" maxlength="1200" /></label>
        <p v-if="error" class="mt-4 text-sm text-red-700">{{ error }}</p><p v-else-if="saved" class="mt-4 text-sm text-green-700">Changes saved privately.</p>
        <div class="mt-6 flex flex-wrap gap-3"><button class="rounded border-2 border-dc-ink bg-white px-4 py-2 font-mono text-xs font-bold tracking-[0.08em]" type="button" :disabled="saving" @click="save">{{ saving ? 'SAVING…' : 'SAVE DRAFT' }}</button><button class="rounded border-2 border-dc-ink bg-dc-yellow px-4 py-2 font-mono text-xs font-bold tracking-[0.08em]" :disabled="submitting" type="submit">{{ submitting ? 'SUBMITTING…' : 'SUBMIT FOR REVIEW' }}</button></div>
      </form>
    </section>
  </main>
</template>
