<script setup lang="ts">
import { computed } from 'vue';
import type { EventSlackAnnouncement, EventSlackAnnouncementResponse } from '@/src/lib/api';

const props = defineProps<{
  website: EventSlackAnnouncementResponse['website'];
  announcement: EventSlackAnnouncement | null;
  slackEligible: boolean;
  slackUrl: string | null;
  slackSending?: boolean;
  refreshing?: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  sendSlack: [];
}>();

const accraTimestamp = new Intl.DateTimeFormat('en-GH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Africa/Accra',
});

const websitePresentation = computed(() => {
  if (props.website.state === 'published') return {
    label: 'Live on website',
    detail: 'The public event page is available.',
    tone: 'success',
  };
  if (props.website.state === 'pending') return {
    label: 'Waiting for website',
    detail: 'The event is published in EMS, but the website refresh has not added the page yet.',
    tone: 'pending',
  };
  if (props.website.state === 'failed') return {
    label: 'Website check failed',
    detail: props.website.http_status
      ? `The public page returned HTTP ${props.website.http_status}.`
      : 'The public page could not be reached.',
    tone: 'failed',
  };
  return {
    label: 'Not published',
    detail: 'Publish this event when it is ready for the public website.',
    tone: 'neutral',
  };
});

const slackPresentation = computed(() => {
  const announcement = props.announcement;
  if (announcement?.status === 'sent') {
    return announcement.message_update_last_error
      ? {
        label: 'Published · update failed',
        detail: announcement.message_update_last_error,
        tone: 'failed',
      }
      : {
        label: 'Published in Slack',
        detail: announcement.provider_message_ts
          ? 'Future event edits update the stored announcement automatically.'
          : 'The announcement was delivered through the legacy webhook and cannot be updated automatically.',
        tone: 'success',
      };
  }
  if (announcement?.status === 'pending') return {
    label: 'Sending to Slack',
    detail: 'A delivery attempt is already in progress. A duplicate message will not be sent.',
    tone: 'pending',
  };
  if (announcement?.status === 'failed') return {
    label: 'Slack delivery failed',
    detail: announcement.last_error || 'Slack did not accept the announcement.',
    tone: 'failed',
  };
  if (props.website.state === 'pending') return {
    label: 'Waiting for website',
    detail: 'Slack delivery will start after the public event page becomes available.',
    tone: 'pending',
  };
  if (!props.slackEligible) return {
    label: 'Not available',
    detail: props.website.state === 'not_published'
      ? 'Slack announcements require a published event.'
      : 'Past events cannot be announced again.',
    tone: 'neutral',
  };
  return {
    label: 'Not sent',
    detail: 'The event is ready to announce in the Slack events channel.',
    tone: 'neutral',
  };
});

const lastSuccessfulSlackResult = computed(() => {
  if (props.announcement?.message_updated_at) {
    return `Last successful update ${accraTimestamp.format(new Date(props.announcement.message_updated_at))}`;
  }
  if (props.announcement?.sent_at) {
    return `Sent ${accraTimestamp.format(new Date(props.announcement.sent_at))}`;
  }
  return null;
});

function toneClass(tone: string) {
  if (tone === 'success') return 'bg-green-600';
  if (tone === 'pending') return 'bg-amber-500';
  if (tone === 'failed') return 'bg-red-600';
  return 'bg-dc-gray';
}
</script>

<template>
  <section class="overflow-hidden rounded-lg border border-dc-border bg-dc-paper" aria-labelledby="event-publication-status-heading">
    <header class="border-b border-dc-border bg-dc-paper-warm px-4 py-3 sm:px-5">
      <p id="event-publication-status-heading" class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-pink">Publication status</p>
      <p class="mt-1 text-xs leading-5 text-dc-gray">Website publication and Slack delivery are tracked independently.</p>
    </header>
    <div class="grid sm:grid-cols-2 sm:divide-x sm:divide-dc-border">
      <article class="border-b border-dc-border p-4 sm:border-b-0 sm:p-5">
        <p class="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-dc-gray">Website</p>
        <div class="mt-2 flex items-center gap-2" aria-live="polite">
          <span class="size-2 shrink-0 rounded-full" :class="toneClass(websitePresentation.tone)" aria-hidden="true" />
          <p class="text-sm font-semibold text-dc-ink">{{ websitePresentation.label }}</p>
        </div>
        <p class="mt-2 max-w-xl text-xs leading-5 text-dc-gray">{{ websitePresentation.detail }}</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <a
            v-if="website.state === 'published'"
            :href="website.url"
            target="_blank"
            rel="noreferrer"
            class="motion-press inline-flex min-h-10 items-center rounded-md border border-dc-ink bg-dc-paper px-3 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-dc-ink"
          >Open website ↗</a>
          <button
            v-else-if="website.state === 'pending' || website.state === 'failed'"
            type="button"
            class="motion-press min-h-10 rounded-md border border-dc-ink bg-dc-paper px-3 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-dc-ink disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="refreshing"
            @click="emit('refresh')"
          >{{ refreshing ? 'Checking…' : 'Check again' }}</button>
        </div>
      </article>

      <article class="p-4 sm:p-5">
        <p class="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-dc-gray">Slack events channel</p>
        <div class="mt-2 flex items-center gap-2" aria-live="polite">
          <span class="size-2 shrink-0 rounded-full" :class="toneClass(slackPresentation.tone)" aria-hidden="true" />
          <p class="text-sm font-semibold text-dc-ink">{{ slackPresentation.label }}</p>
        </div>
        <p class="mt-2 max-w-xl text-xs leading-5" :class="slackPresentation.tone === 'failed' ? 'text-red-700' : 'text-dc-gray'">{{ slackPresentation.detail }}</p>
        <p v-if="lastSuccessfulSlackResult" class="mt-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">{{ lastSuccessfulSlackResult }}</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <a
            v-if="announcement?.status === 'sent' && slackUrl"
            :href="slackUrl"
            target="_blank"
            rel="noreferrer"
            class="motion-press inline-flex min-h-10 items-center rounded-md border border-dc-ink bg-dc-paper px-3 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-dc-ink"
          >Open announcement ↗</a>
          <button
            v-if="slackEligible && website.state === 'published' && (!announcement || announcement.status === 'failed')"
            type="button"
            class="motion-press min-h-10 rounded-md border-2 border-dc-ink bg-dc-yellow px-3 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-dc-ink disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="slackSending"
            @click="emit('sendSlack')"
          >{{ slackSending ? 'Sending…' : announcement?.status === 'failed' ? 'Retry Slack' : 'Send to Slack' }}</button>
        </div>
      </article>
    </div>
  </section>
</template>
