<script setup lang="ts">
import AppDropdown from '@/src/components/AppDropdown.vue';

const answers = [{ value: '', label: 'Choose an answer' }];
</script>

<template>
  <div>
    <header class="mb-5 sm:mb-6">
      <img src="/brand/dev-con-logo.png" alt="" class="mb-5 h-auto w-40 max-w-[56vw] sm:w-48" />
      <h1 class="max-w-3xl text-3xl font-bold leading-none tracking-tight sm:text-4xl">Speaker logistics workspace</h1>
      <p class="mt-2 max-w-3xl text-sm font-medium leading-5 sm:text-base">DevCon26 · December 19, 2026</p>
      <p class="mt-3 max-w-xl text-sm leading-5 sm:text-base">Your accepted proposal is already saved. Keep these delivery details up to date until the organizer deadline.</p>
    </header>
    <div class="space-y-6 border-t border-dc-border pt-6">
      <section class="rounded-lg border border-dc-border bg-dc-paper-warm p-5">
        <p class="editorial-label">Accepted proposal</p>
        <h2 class="text-2xl font-bold tracking-tight">Building reliable systems</h2>
        <p class="mt-2 text-xs font-semibold uppercase tracking-wide">30-minute talk · Systems engineering</p>
        <p class="mt-4 text-sm leading-6">Practical techniques for designing and operating reliable systems with the community.</p>
        <ol class="mt-4 list-decimal space-y-1 pl-5 text-sm leading-6">
          <li>Identify the important reliability trade-offs.</li>
          <li>Apply these ideas to everyday delivery.</li>
        </ol>
        <p class="mt-4 border-t border-dc-border pt-4 text-xs font-semibold">Updates close on the agreed organizer deadline.</p>
      </section>
      <section class="rounded-lg border border-dc-border bg-white p-5 sm:p-8">
        <h2 class="text-xl font-semibold">Your speaker badge</h2>
        <p>Personalize your badge and download it to share. Your changes are saved privately.</p>
        <div class="mt-6 grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div><div class="aspect-[4/5] w-full max-w-[220px] rounded-md bg-dc-cream" /><button type="button" disabled>Preview badge</button></div>
          <div class="grid content-start gap-4 lg:grid-cols-2">
            <div class="grid content-start gap-4">
              <label class="block">Display name<input class="editorial-input" disabled /></label>
              <div><p>Photo</p><p>No photo added</p><button type="button" disabled>Add photo</button></div>
              <p class="text-sm">JPEG, PNG, WebP or AVIF, up to 5 MB.</p>
            </div>
            <div class="grid content-start gap-4">
              <p class="font-semibold">Adjust photo</p>
              <label class="block">Zoom<input type="range" class="app-form-control-range" disabled /></label>
              <label class="block">Horizontal position<input type="range" class="app-form-control-range" disabled /></label>
              <label class="block">Vertical position<input type="range" class="app-form-control-range" disabled /></label>
            </div>
            <div class="flex gap-2 lg:col-span-2">
              <button type="button" disabled>Save badge</button>
              <button type="button" disabled>Download PNG</button>
            </div>
          </div>
        </div>
      </section>
      <section class="app-form-section space-y-5">
        <h2 class="app-form-section-title">Session logistics</h2>
        <div class="grid gap-5 lg:grid-cols-2">
        <div class="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          <AppDropdown model-value="" label="Availability confirmation" :options="answers" disabled />
          <AppDropdown model-value="" label="Do participants need laptops?" :options="answers" disabled />
        </div>
        <label class="block"><span class="editorial-label">Slides or supporting-resource link</span><input type="url" class="editorial-input" disabled /></label>
        <div class="space-y-2">
          <p class="editorial-label">Upload slides or supporting file (optional)</p>
          <p class="text-sm">PDF, PPT, or PPTX, up to 5 MB per file and five files total.</p>
          <input type="file" class="speaker-upload-input block w-full text-sm" disabled />
          <button type="button" disabled>Upload file</button>
        </div>
        <label class="block"><span class="editorial-label">Technical and setup requirements</span><textarea class="editorial-input resize-none" rows="4" disabled /></label>
        <label class="block"><span class="editorial-label">Accessibility support (optional)</span><textarea class="editorial-input" rows="4" disabled /></label>
        <label class="block"><span class="editorial-label">Headshot link (optional)</span><input class="editorial-input" disabled /></label>
        <label class="block"><span class="editorial-label">Social handle (optional)</span><input class="editorial-input" disabled /></label>
        <p class="lg:col-span-2">These details are shared privately with organizers.</p>
        <label class="block"><span class="editorial-label">Required software or equipment</span><textarea class="editorial-input resize-none" rows="3" disabled /></label>
        </div>
      </section>
      <div class="flex justify-end"><button type="button" class="w-full rounded-lg border border-dc-ink bg-dc-pink px-5 py-3 text-sm font-semibold uppercase sm:w-auto sm:min-w-56" disabled>Save details</button></div>
    </div>
  </div>
</template>
