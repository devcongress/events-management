<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION, mobileAnnualConferencePath } from '@/src/annual-conference';
import { fetchAdminSession, queryKeys } from '@/src/lib/api';
import { ORGANIZER_PHONE_EVENTS_ROUTE_PATH } from '@/src/organizer-viewport';

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
        <div class="mobile-home-intro__meta">
          <span>{{ todayLabel }}</span>
          <span><i aria-hidden="true"></i> Ops ready</span>
        </div>
        <h1>{{ greeting }}, {{ firstName }}.</h1>
        <p>Where do you want to pick up?</p>
        <span class="mobile-home-intro__mark" aria-hidden="true">DC</span>
      </header>

      <section class="mobile-home-workspaces" aria-labelledby="mobile-home-workspaces-title">
        <header>
          <span>Workspaces</span>
          <h2 id="mobile-home-workspaces-title">Jump back in</h2>
        </header>
        <div class="mobile-home-workspace-grid">
          <RouterLink :to="ORGANIZER_PHONE_EVENTS_ROUTE_PATH" class="mobile-home-workspace mobile-home-workspace--events">
            <div class="mobile-home-workspace__topline">
              <span>01 · Event operations</span>
              <span class="mobile-home-workspace__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6 3v3M18 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /><path d="m8 15 2.2 2L16 11.5" /></svg>
              </span>
            </div>
            <div>
              <h3>Events</h3>
              <p>Guest lists, check-in, proposals, and the links you need on event day.</p>
            </div>
            <strong>Open events <span aria-hidden="true">→</span></strong>
          </RouterLink>

          <RouterLink :to="mobileAnnualConferencePath()" class="mobile-home-workspace mobile-home-workspace--conference">
            <div class="mobile-home-workspace__topline">
              <span>02 · Annual conference</span>
              <span class="mobile-home-workspace__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg>
              </span>
            </div>
            <div>
              <h3>Conference</h3>
              <p>Move the work plan, timeline, and volunteer team toward {{ ACTIVE_ANNUAL_CONFERENCE_EDITION.label }}.</p>
            </div>
            <strong>Open conference <span aria-hidden="true">→</span></strong>
          </RouterLink>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.mobile-home-page { min-height: 100%; background: #f5f2e8; color: #111; }
.mobile-home-wrap { display: grid; width: min(100%, 42rem); margin: 0 auto; gap: 1.25rem; padding: 1rem max(1rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); }
.mobile-home-intro { position: relative; overflow: hidden; min-height: 15.5rem; border-radius: 12px; background: #111; padding: 1.2rem; color: #fff; }
.mobile-home-intro::after { position: absolute; right: -4.5rem; bottom: -5rem; width: 12rem; height: 12rem; border: 2.5rem solid #e8117f; border-radius: 50%; content: ''; opacity: .92; }
.mobile-home-intro__meta { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.mobile-home-intro__meta > span, .mobile-home-workspaces > header > span, .mobile-home-workspace__topline > span:first-child { font-family: var(--font-mono), monospace; font-size: .6rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.mobile-home-intro__meta > span { color: #c6c2ba; }
.mobile-home-intro__meta > span:last-child { display: inline-flex; align-items: center; gap: .35rem; color: #fff; }
.mobile-home-intro__meta i { width: .45rem; height: .45rem; border-radius: 50%; background: #f5e642; }
.mobile-home-intro h1 { position: relative; z-index: 1; margin: 3.1rem 0 0; max-width: 10ch; font-size: clamp(2.35rem, 11vw, 3.2rem); font-weight: var(--font-weight-display); letter-spacing: -.045em; line-height: .94; }
.mobile-home-intro p { position: relative; z-index: 1; margin: .85rem 0 0; color: #c6c2ba; font-size: .92rem; font-weight: var(--font-weight-emphasis); line-height: 1.45; }
.mobile-home-intro__mark { position: absolute; z-index: 1; right: 1.15rem; bottom: 1rem; color: #111; font-family: var(--font-mono), monospace; font-size: 1.1rem; font-weight: 800; letter-spacing: -.08em; }
.mobile-home-workspaces > header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; padding: 0 .15rem; }
.mobile-home-workspaces > header > span { color: #77736b; }
.mobile-home-workspaces h2 { margin: 0; font-size: 1.15rem; letter-spacing: -.02em; }
.mobile-home-workspace-grid { display: grid; gap: .8rem; margin-top: .8rem; }
.mobile-home-workspace { display: grid; min-height: 13.5rem; gap: 1.4rem; border: 1px solid #111; border-radius: 12px; padding: 1rem; color: #111; text-decoration: none; transition: transform 100ms cubic-bezier(.4, 0, .2, 1); }
.mobile-home-workspace--events { background: #e8117f; color: #fff; }
.mobile-home-workspace--conference { background: #f5e642; }
.mobile-home-workspace__topline { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.mobile-home-workspace--events .mobile-home-workspace__topline > span:first-child { color: #fff; }
.mobile-home-workspace--conference .mobile-home-workspace__topline > span:first-child { color: #514d43; }
.mobile-home-workspace__icon { display: grid; width: 2.75rem; height: 2.75rem; flex: 0 0 auto; place-items: center; border: 1px solid currentColor; border-radius: 8px; }
.mobile-home-workspace__icon svg { width: 1.35rem; height: 1.35rem; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.mobile-home-workspace h3 { margin: 0; font-size: 2rem; letter-spacing: -.04em; line-height: 1; }
.mobile-home-workspace p { margin: .65rem 0 0; max-width: 31rem; font-size: .85rem; font-weight: var(--font-weight-emphasis); line-height: 1.5; }
.mobile-home-workspace--events p { color: #fff; }
.mobile-home-workspace--conference p { color: #514d43; }
.mobile-home-workspace > strong { display: flex; min-height: 2.75rem; align-items: center; justify-content: space-between; gap: 1rem; align-self: end; border-top: 1px solid currentColor; padding-top: .8rem; font-family: var(--font-mono), monospace; font-size: .65rem; letter-spacing: .08em; text-transform: uppercase; }
.mobile-home-workspace > strong span { font-size: 1.15rem; }
.mobile-home-workspace:active { transform: scale(.97); }
@media (prefers-reduced-motion: reduce) { .mobile-home-workspace { transition: none; } }
</style>
