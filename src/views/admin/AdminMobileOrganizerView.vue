<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { fetchAdminSession, queryKeys } from '@/src/lib/api';

const sessionQuery = useQuery({ queryKey: queryKeys.adminSession, queryFn: fetchAdminSession });
const firstName = computed(() => sessionQuery.data.value?.user?.display_name?.trim().split(/\s+/)[0] ?? 'organizer');
const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
});
const todayLabel = new Intl.DateTimeFormat('en-GH', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date());
</script>

<template>
  <section class="mobile-home-page">
    <div class="mobile-home-wrap">
      <header class="mobile-home-intro">
        <span>{{ todayLabel }}</span>
        <h1>{{ greeting }}, {{ firstName }}.</h1>
        <p>Your organizer workspace is ready whenever you need it.</p>
      </header>

      <section class="mobile-home-note">
        <span>From your phone</span>
        <h2>Keep the work moving.</h2>
        <p>Use the menu to move between event-day operations and Annual Conference planning.</p>
      </section>

      <section class="mobile-home-guide" aria-labelledby="mobile-home-guide-title">
        <header>
          <span>Quick guide</span>
          <h2 id="mobile-home-guide-title">Two focused workspaces</h2>
        </header>
        <dl>
          <div>
            <dt>Events</dt>
            <dd>Open event links and check in guests while you are on the move.</dd>
          </div>
          <div>
            <dt>Conference</dt>
            <dd>Manage tasks, phases, timelines, and volunteer applications.</dd>
          </div>
        </dl>
      </section>
    </div>
  </section>
</template>

<style scoped>
.mobile-home-page { min-height: 100%; background: #f5f2e8; color: #111; }
.mobile-home-wrap { display: grid; width: min(100%, 42rem); margin: 0 auto; gap: 1rem; padding: 1.35rem max(1rem, env(safe-area-inset-right)) max(1.35rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); }
.mobile-home-intro { padding: 1rem 0 1.25rem; }
.mobile-home-intro > span, .mobile-home-note > span, .mobile-home-guide header > span, .mobile-home-guide dt { color: #77736b; font-family: var(--font-mono), monospace; font-size: .6rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.mobile-home-intro h1 { margin: .55rem 0 0; max-width: 13ch; font-size: clamp(2.1rem, 10vw, 3rem); font-weight: var(--font-weight-display); letter-spacing: -.04em; line-height: .98; }
.mobile-home-intro p { margin: .85rem 0 0; max-width: 29rem; color: #5f5b54; font-size: .95rem; font-weight: var(--font-weight-emphasis); line-height: 1.55; }
.mobile-home-note { overflow: hidden; border: 1px solid #d9d5cc; border-radius: 12px; background: #f5e642; padding: 1.1rem; }
.mobile-home-note > span { color: #514d43; }
.mobile-home-note h2 { margin: .55rem 0 0; font-size: 1.35rem; letter-spacing: -.025em; line-height: 1.1; }
.mobile-home-note p { margin: .65rem 0 0; max-width: 34rem; font-size: .84rem; font-weight: var(--font-weight-emphasis); line-height: 1.5; }
.mobile-home-guide { overflow: hidden; border: 1px solid #d9d5cc; border-radius: 12px; background: #fff; }
.mobile-home-guide header { padding: 1rem; }
.mobile-home-guide h2 { margin: .35rem 0 0; font-size: 1.05rem; }
.mobile-home-guide dl { margin: 0; border-top: 1px solid #e1ddd4; }
.mobile-home-guide dl > div { padding: .9rem 1rem; }
.mobile-home-guide dl > div + div { border-top: 1px solid #e1ddd4; }
.mobile-home-guide dd { margin: .35rem 0 0; color: #5f5b54; font-size: .8rem; font-weight: var(--font-weight-emphasis); line-height: 1.5; }
</style>
