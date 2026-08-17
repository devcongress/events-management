<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

type Recap = { event: { name: string; event_date: string }; title: string; facilitators: string[]; docs_url: string | null; description: string | null; questions: { question_text: string; options: string[]; correct_index: number; explanation: string | null; difficulty: string; category: string | null }[] };
const route = useRoute();
const recap = ref<Recap | null>(null);
const error = ref('');
onMounted(async () => {
  const response = await fetch(`/api/public/system-design/${encodeURIComponent(String(route.params.eventId))}`);
  if (!response.ok) { error.value = 'This learning recap is not available yet.'; return; }
  recap.value = await response.json();
});
</script>

<template>
  <main class="editorial-page min-h-screen"><div class="mx-auto max-w-4xl px-4 py-12 sm:px-6">
    <p v-if="error" class="rounded-md border-2 border-dc-ink bg-dc-paper p-6 font-semibold text-dc-ink">{{ error }}</p>
    <template v-else-if="recap"><header class="border-b-2 border-dc-ink pb-8"><p class="editorial-eyebrow">System Design · learning recap</p><h1 class="mt-3 text-4xl font-bold tracking-tight text-dc-ink sm:text-5xl">{{ recap.title }}</h1><p v-if="recap.facilitators.length" class="mt-4 text-dc-gray">Facilitated by {{ recap.facilitators.join(', ') }}</p><p v-if="recap.description" class="mt-5 whitespace-pre-line leading-7 text-dc-gray">{{ recap.description }}</p><a v-if="recap.docs_url" :href="recap.docs_url" target="_blank" rel="noopener noreferrer" class="editorial-secondary-action mt-6">Open session docs ↗</a></header><section class="mt-8 grid gap-4"><article v-for="(question, index) in recap.questions" :key="index" class="rounded-lg border-2 border-dc-ink bg-dc-paper p-5 shadow-[3px_3px_0_#111111]"><p class="editorial-eyebrow">Question {{ index + 1 }} · {{ question.difficulty }}</p><h2 class="mt-2 text-xl font-semibold text-dc-ink">{{ question.question_text }}</h2><ol class="mt-4 grid gap-2 sm:grid-cols-2"><li v-for="(option, optionIndex) in question.options" :key="option" class="rounded border px-3 py-2 text-sm" :class="optionIndex === question.correct_index ? 'border-dc-ink bg-dc-yellow text-dc-ink' : 'border-dc-border text-dc-gray'">{{ ['A','B','C','D'][optionIndex] }}. {{ option }}</li></ol><p v-if="question.explanation" class="mt-4 text-sm leading-6 text-dc-gray"><strong class="text-dc-ink">Why:</strong> {{ question.explanation }}</p></article></section></template>
    <p v-else class="font-mono text-sm text-dc-gray">Loading recap…</p>
  </div></main>
</template>
