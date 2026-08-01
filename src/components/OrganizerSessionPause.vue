<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  state: 'warning' | 'locked';
  remainingSeconds?: number;
}>();

const emit = defineEmits<{
  stay: [];
  signIn: [];
  signOut: [];
}>();

const remaining = computed(() => {
  const total = Math.max(0, props.remainingSeconds ?? 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
});
</script>

<template>
  <section class="organizer-session-pause" role="dialog" aria-modal="true" aria-labelledby="organizer-session-pause-title">
    <div class="organizer-session-pause__card">
      <template v-if="state === 'warning'">
        <h2 id="organizer-session-pause-title">Still working?</h2>
        <p>Your session will pause soon. Keep working if you’re still here.</p>
        <p class="organizer-session-pause__timer">Pausing in <strong>{{ remaining }}</strong></p>
        <div class="organizer-session-pause__actions">
          <button class="organizer-session-pause__primary motion-press" type="button" @click="emit('stay')">Stay signed in</button>
          <button class="organizer-session-pause__secondary" type="button" @click="emit('signOut')">Sign out now</button>
        </div>
      </template>

      <template v-else>
        <h2 id="organizer-session-pause-title">Welcome back.</h2>
        <p>Sign in to pick up where you left off.</p>
        <button class="organizer-session-pause__primary motion-press organizer-session-pause__sign-in" type="button" @click="emit('signIn')">Sign in</button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.organizer-session-pause {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgb(45 42 35 / 22%);
  backdrop-filter: blur(3px);
}

:global(.organizer-session-pause-enter-active),
:global(.organizer-session-pause-leave-active) {
  transition: opacity 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

:global(.organizer-session-pause-enter-active .organizer-session-pause__card),
:global(.organizer-session-pause-leave-active .organizer-session-pause__card) {
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

:global(.organizer-session-pause-enter-from),
:global(.organizer-session-pause-leave-to) {
  opacity: 0;
}

:global(.organizer-session-pause-enter-from .organizer-session-pause__card),
:global(.organizer-session-pause-leave-to .organizer-session-pause__card) {
  opacity: 0;
  transform: translate3d(0, 10px, 0) scale(0.98);
}

.organizer-session-pause__card {
  width: min(100%, 31rem);
  border: 1px solid rgb(17 17 17 / 20%);
  border-radius: 2px;
  background: #fffef6;
  box-shadow: 0 22px 65px rgb(33 30 24 / 22%), 0 3px 10px rgb(33 30 24 / 8%);
  padding: 2.1rem;
}

.organizer-session-pause__card h2 {
  margin: 0;
  color: #111111;
  font-size: clamp(1.85rem, 4vw, 2.65rem);
  font-weight: 800;
  letter-spacing: -0.06em;
  line-height: 1;
}

.organizer-session-pause__card p {
  max-width: 23rem;
  margin: 0.7rem 0 0;
  color: #625f58;
  font-size: 0.94rem;
  font-weight: 500;
  line-height: 1.55;
}

.organizer-session-pause__timer {
  margin-top: 1.1rem !important;
  font-family: var(--font-mono), monospace;
  font-size: 0.75rem !important;
  letter-spacing: 0.03em;
}

.organizer-session-pause__timer strong { color: #e8117f; }

.organizer-session-pause__actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.45rem;
}

.organizer-session-pause__primary {
  min-height: 2.55rem;
  border: 2px solid #111111;
  border-radius: 8px;
  background: #f5e642;
  box-shadow: 0 2px 0 rgb(17 17 17 / 16%);
  color: #111111;
  cursor: pointer;
  font-family: var(--font-mono), monospace;
  font-size: 0.69rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition:
    transform 100ms cubic-bezier(0.4, 0, 0.2, 1),
    background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

@media (hover: hover) and (pointer: fine) {
  .organizer-session-pause__primary:hover { background: #ffe900; }
  .organizer-session-pause__secondary:hover { color: #111111; }
}

.organizer-session-pause__secondary {
  border: 0;
  background: transparent;
  color: #706c64;
  cursor: pointer;
  font-family: var(--font-mono), monospace;
  font-size: 0.69rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-transform: uppercase;
}

.organizer-session-pause__sign-in {
  width: 100%;
  margin-top: 1.45rem;
}

@media (max-width: 40rem) {
  .organizer-session-pause__card { padding: 1.75rem 1.4rem; }
}

@media (prefers-reduced-motion: reduce) {
  :global(.organizer-session-pause-enter-active),
  :global(.organizer-session-pause-leave-active),
  :global(.organizer-session-pause-enter-active .organizer-session-pause__card),
  :global(.organizer-session-pause-leave-active .organizer-session-pause__card) {
    transition: none;
  }
}
</style>
