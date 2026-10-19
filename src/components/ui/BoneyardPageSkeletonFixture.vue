<script setup lang="ts">
type SkeletonLayout =
  | "cards"
  | "dashboard"
  | "detail"
  | "learning-room"
  | "form"
  | "list"
  | "mobile-actions"
  | "mobile-blasts"
  | "mobile-check-in"
  | "mobile-conference"
  | "mobile-event"
  | "mobile-events"
  | "registration"
  | "submissions"
  | "form-board"
  | "table"
  | "volunteer-follow-up"
  | "workspace";

const props = withDefaults(
  defineProps<{
    label: string;
    fixtureCount?: number;
    layout?: SkeletonLayout;
    showHeader?: boolean;
  }>(),
  {
    layout: "workspace",
    showHeader: true,
    fixtureCount: 3,
  },
);

const fixtureRows = props.layout === "table" || props.layout === "workspace" ? 5 : 3;
</script>

<template>
  <section class="boneyard-page-skeleton__fixture" :aria-label="label">
    <header v-if="showHeader" class="boneyard-page-skeleton__fixture-header">
      <span class="boneyard-page-skeleton__fixture-eyebrow">Loading</span>
      <h1>{{ label }}</h1>
      <p>Preparing the latest event information.</p>
    </header>

    <div v-if="layout === 'dashboard'" class="boneyard-page-skeleton__fixture-dashboard">
      <section>
        <span class="boneyard-page-skeleton__fixture-dashboard-kicker">Community tech talks</span>
        <h1>DEV::CON[]</h1>
        <p>A community-run space for talks, archives, and monthly meetups.</p>
        <button type="button">Explore talks</button>
      </section>
      <aside>
        <div class="boneyard-page-skeleton__fixture-dashboard-photo" />
        <p>Meetup photo 1 / 4</p>
      </aside>
    </div>

    <div v-else-if="layout === 'cards'" class="boneyard-page-skeleton__fixture-cards">
      <article v-for="index in 3" :key="index" class="boneyard-page-skeleton__fixture-card">
        <div class="boneyard-page-skeleton__fixture-media" />
        <h2>Event information</h2>
        <p>Loading event details and upcoming community activity.</p>
      </article>
    </div>

    <div v-else-if="layout === 'form'" class="boneyard-page-skeleton__fixture-form">
      <label v-for="index in 5" :key="index">
        <span>Form field</span>
        <input class="app-form-control" :value="`Loading field ${index}`" readonly />
      </label>
      <button type="button">Continue</button>
    </div>

    <div v-else-if="layout === 'detail'" class="boneyard-page-skeleton__fixture-detail">
      <div class="boneyard-page-skeleton__fixture-media boneyard-page-skeleton__fixture-media--wide" />
      <h2>Event details</h2>
      <p>Loading the description, schedule, speakers, and attendance information.</p>
      <p>Additional community event details will appear here.</p>
    </div>

    <div v-else-if="layout === 'learning-room'" class="boneyard-page-skeleton__fixture-learning-room">
      <div class="boneyard-page-skeleton__fixture-avatar" />
      <p>Live learning room</p>
      <h1>You're in</h1>
      <p>Your avatar is ready. Set your name while the facilitator prepares the room.</p>
      <div class="boneyard-page-skeleton__fixture-learning-form">
        <label>Room name<input class="app-form-control" readonly value="Participant" /></label>
        <button type="button">Save name</button>
      </div>
      <p>Waiting for the facilitator</p>
    </div>

    <div v-else-if="layout === 'mobile-actions'" class="boneyard-page-skeleton__fixture-mobile-actions">
      <article v-for="index in 2" :key="index" class="boneyard-page-skeleton__fixture-mobile-action">
        <span>Today</span>
        <h2>Action card</h2>
        <p>Loading your next organizer action.</p>
        <strong aria-hidden="true">→</strong>
      </article>
    </div>

    <div v-else-if="layout === 'mobile-events'" class="boneyard-page-skeleton__fixture-mobile-events">
      <article v-for="event in 3" :key="event">
        <span>Upcoming meetup</span>
        <h2>Community event</h2>
        <p>Thursday · 6:00 PM</p>
        <div><button type="button">Guest list</button><button type="button">Open event</button></div>
      </article>
    </div>

    <div v-else-if="layout === 'mobile-event'" class="boneyard-page-skeleton__fixture-mobile-event">
      <header>
        <span>Upcoming event</span>
        <h1>Community meetup</h1>
        <p>Thursday · 6:00 PM</p>
        <p>Accra, Ghana</p>
      </header>
      <section>
        <h2>Event operations</h2>
        <p>Guest list and check-in</p>
        <p>Presentation proposals</p>
      </section>
    </div>

    <div v-else-if="layout === 'mobile-conference'" class="boneyard-page-skeleton__fixture-mobile-conference">
      <header>
        <span>2026 edition</span>
        <h1>Annual Conference</h1>
        <p>Planning, progress, and your assigned work</p>
      </header>
      <div class="boneyard-page-skeleton__fixture-mobile-conference-stats">
        <div v-for="stat in 2" :key="stat"><strong>24</strong><span>Planning tasks</span></div>
      </div>
      <section>
        <h2>Next tasks</h2>
        <p v-for="task in 3" :key="task">Conference planning task</p>
      </section>
    </div>

    <div v-else-if="layout === 'mobile-check-in'" class="boneyard-page-skeleton__fixture-mobile-check-in">
      <h2>Find a guest</h2>
      <label>Name or email<input class="app-form-control" readonly value="Search guests" /></label>
      <div><span>All</span><span>A–Z</span><span>Registered</span></div>
      <p v-for="guest in 3" :key="guest">Guest name · awaiting check-in</p>
    </div>

    <div v-else-if="layout === 'mobile-blasts'" class="boneyard-page-skeleton__fixture-mobile-blasts">
      <section><span>Audience</span><strong>42</strong><p>Confirmed guests</p></section>
      <section><span>Safe today</span><strong>40</strong><p>Available email quota</p></section>
      <section><h2>Latest delivery</h2><p>No blast yet</p><label>Allocate today<input class="app-form-control" readonly value="40" /></label></section>
    </div>

    <div v-else-if="layout === 'volunteer-follow-up'" class="boneyard-page-skeleton__fixture-follow-up">
      <section class="boneyard-page-skeleton__fixture-follow-up-progress">
        <p>Campaign progress</p>
        <strong>18 invitations sent</strong>
        <div />
        <span>6 awaiting a response</span>
      </section>
      <section class="boneyard-page-skeleton__fixture-follow-up-setup">
        <p>Invitation setup</p>
        <div><span>Deadline</span><span>Message preview</span><span>Daily batch</span></div>
      </section>
      <section class="boneyard-page-skeleton__fixture-follow-up-inbox">
        <header><strong>Recipients</strong><span>Filter</span><span>Search</span></header>
        <div v-for="index in 3" :key="index"><span>Volunteer candidate</span><span>Pending</span></div>
      </section>
    </div>

    <div v-else-if="layout === 'registration'" class="boneyard-page-skeleton__fixture-registration">
      <nav aria-label="Registration sections">
        <span v-for="tab in ['Summary', 'Guests', 'Form & capacity', 'Emails', 'Blasts']" :key="tab">{{ tab }}</span>
      </nav>

      <article>
        <header>
          <div>
            <h2>Registration overview</h2>
            <p>Confirmed registrations and places left</p>
          </div>
          <button type="button">Refresh</button>
        </header>

        <div class="boneyard-page-skeleton__fixture-registration-stats">
          <div v-for="stat in 4" :key="stat">
            <strong>{{ stat * 12 }}</strong>
            <span>Registration metric</span>
          </div>
        </div>

        <section>
          <h3>Recent registrations</h3>
          <p v-for="row in 3" :key="row">Applicant name · confirmed admission</p>
        </section>
      </article>
    </div>

    <div v-else-if="layout === 'submissions'" class="boneyard-page-skeleton__fixture-submissions">
      <table>
        <thead>
          <tr>
            <th v-for="heading in ['Event', 'Contact', 'Submitted', 'Status', 'Type', 'Review', 'Open']" :key="heading">{{ heading }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in 4" :key="row">
            <td>Community event proposal</td>
            <td>Organizer contact</td>
            <td>Today</td>
            <td>Awaiting review</td>
            <td>Meetup</td>
            <td>Pending</td>
            <td>View</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="layout === 'form-board'" class="boneyard-page-skeleton__fixture-form-board">
      <article v-for="card in fixtureCount" :key="card">
        <h2>Community form</h2>
        <p>Scan to join</p>
        <div class="boneyard-page-skeleton__fixture-qr" />
        <span>go.devcongress.org/community</span>
      </article>
    </div>

    <div v-else class="boneyard-page-skeleton__fixture-table">
      <div v-for="index in fixtureRows" :key="index" class="boneyard-page-skeleton__fixture-row">
        <span>Event record</span>
        <span>Updated today</span>
        <button type="button">View</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.boneyard-page-skeleton__fixture-follow-up {
  display: grid;
  gap: 1rem;
}

.boneyard-page-skeleton__fixture-follow-up-progress,
.boneyard-page-skeleton__fixture-follow-up-setup,
.boneyard-page-skeleton__fixture-follow-up-inbox {
  border: 1px solid var(--dc-border, #d4d4d4);
  border-radius: 8px;
  padding: 1rem;
}

.boneyard-page-skeleton__fixture-follow-up-progress {
  display: grid;
  gap: 0.75rem;
}

.boneyard-page-skeleton__fixture-follow-up-progress div {
  height: 0.75rem;
  border-radius: 999px;
  background: #e5e5e5;
}

.boneyard-page-skeleton__fixture-follow-up-setup > div,
.boneyard-page-skeleton__fixture-follow-up-inbox > div,
.boneyard-page-skeleton__fixture-follow-up-inbox > header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 0.75rem;
  padding: 0.75rem 0;
}

.boneyard-page-skeleton__fixture-follow-up-inbox > div {
  border-top: 1px solid var(--dc-border, #d4d4d4);
}

@media (max-width: 639px) {
  .boneyard-page-skeleton__fixture-follow-up-setup > div {
    grid-template-columns: 1fr;
  }
}
</style>
