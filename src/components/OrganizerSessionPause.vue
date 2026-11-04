<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

const props = defineProps<{
  mode: 'warning' | 'locked' | 'offline' | 'signing-out';
  pageName?: string;
  accessDenied?: boolean;
  remainingSeconds?: number;
  busy?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  stay: [];
  signIn: [];
  retry: [];
  signOut: [];
}>();

const dialog = ref<HTMLDialogElement | null>(null);
const remaining = computed(() => {
  const total = Math.max(0, props.remainingSeconds ?? 0);

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
});

onMounted(async () => {
  await nextTick();
  dialog.value?.showModal();
});

onUnmounted(() => dialog.value?.close());
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="organizer-session-pause" aria-labelledby="organizer-session-pause-title" aria-describedby="organizer-session-pause-description" @cancel.prevent>
      <div class="organizer-session-pause__card">
        <div class="organizer-session-pause__heading">
          <div class="organizer-session-pause__motif" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M9 5v14M15 5v14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" /></svg>
          </div>
          <div>
            <p class="organizer-session-pause__eyebrow">Organizer workspace</p>
            <h2 id="organizer-session-pause-title" tabindex="-1" autofocus>{{ mode === 'signing-out' ? 'Signing out' : mode === 'locked' ? 'Your session has expired' : mode === 'offline' ? 'Session check unavailable' : 'Still working?' }}</h2>
          </div>
        </div>
        <div class="organizer-session-pause__content">
          <p v-if="mode === 'signing-out'" id="organizer-session-pause-description">Closing your organizer session…</p>
          <p v-else-if="mode === 'locked'" id="organizer-session-pause-description">Sign in with Google to return to {{ pageName || 'this page' }}.</p>
          <p v-else-if="mode === 'offline'" id="organizer-session-pause-description">Check your connection and try again to return to your workspace.</p>
          <template v-else>
            <p id="organizer-session-pause-description">Your session will pause soon. Keep working if you’re still here.</p>
            <p class="organizer-session-pause__timer">Pausing in <strong>{{ remaining }}</strong></p>
          </template>
          <p v-if="error" class="organizer-session-pause__error" role="alert">{{ error }}</p>
          <div v-if="mode !== 'signing-out'" class="organizer-session-pause__actions">
            <button class="organizer-session-pause__primary" type="button" :disabled="busy" @click="mode === 'locked' ? emit('signIn') : mode === 'offline' ? emit('retry') : emit('stay')">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path v-if="mode === 'locked'" d="M12 3h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4M3 10h10m-3.5-3.5L13 10l-3.5 3.5" />
                <path v-else-if="mode === 'offline'" d="M16.5 7a7 7 0 0 0-12-2L3 6.5M3 3v3.5h3.5M3.5 13a7 7 0 0 0 12 2l1.5-1.5M17 17v-3.5h-3.5" />
                <path v-else d="M3.5 10.5 8 15l8.5-9" />
              </svg>
              <span>{{ busy ? (mode === 'locked' ? 'Opening Google…' : 'Checking session…') : (mode === 'locked' ? (accessDenied ? 'Use another Google account' : 'Sign in again') : mode === 'offline' ? 'Try again' : 'Stay signed in') }}</span>
            </button>
            <button v-if="mode !== 'offline'" class="organizer-session-pause__secondary" type="button" :disabled="busy" @click="emit('signOut')">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M12 3h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4M13 10H3m3.5-3.5L3 10l3.5 3.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" /></svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.organizer-session-pause {
  position: fixed;
  inset: 0;
  width: min(calc(100% - 3rem), 32rem);
  max-width: none;
  max-height: calc(100% - 3rem);
  max-height: calc(100dvh - 3rem);
  margin: auto;
  padding: 0;
  overflow-y: auto;
  border: 0;
  border-radius: 12px;
  background: var(--surface-paper);
  color: hsl(var(--foreground));
  box-shadow: 0 22px 65px rgb(33 30 24 / 22%);
}

.organizer-session-pause::backdrop {
  background: rgb(45 42 35 / 18%);
  backdrop-filter: blur(3px);
}

.organizer-session-pause__card {
  padding: 2rem;
}

.organizer-session-pause__heading {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.organizer-session-pause__motif {
  display: grid;
  flex: 0 0 3.5rem;
  height: 3.5rem;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, hsl(var(--accent)) 9%, var(--surface-paper));
  color: color-mix(in srgb, hsl(var(--accent)) 90%, black);
}

.organizer-session-pause__motif svg {
  width: 1.5rem;
  height: 1.5rem;
}

.organizer-session-pause__eyebrow {
  margin: 0 0 0.35rem;
  color: hsl(var(--muted-foreground));
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.organizer-session-pause__heading > div:last-child {
  min-width: 0;
}

.organizer-session-pause h2 {
  margin: 0;
  overflow-wrap: anywhere;
  outline: none;
  font-family: var(--font-display), system-ui, sans-serif;
  font-size: clamp(1.55rem, 4vw, 1.9rem);
  font-weight: 700;
  line-height: 1.15;
}

.organizer-session-pause__content {
  margin-top: 1.5rem;
}

.organizer-session-pause__content p {
  margin: 0;
  color: hsl(var(--muted-foreground));
  line-height: 1.5;
}

.organizer-session-pause__content .organizer-session-pause__timer {
  margin-top: 1rem;
  color: hsl(var(--foreground));
}

.organizer-session-pause__timer strong {
  color: color-mix(in srgb, hsl(var(--accent)) 90%, black);
  font-variant-numeric: tabular-nums;
}

.organizer-session-pause__content .organizer-session-pause__error {
  margin-top: 1rem;
  color: #b42318;
}

.organizer-session-pause__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.organizer-session-pause__actions button {
  position: relative;
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  padding: 0.7rem 1.5rem;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  text-decoration: none;
  overflow-wrap: anywhere;
  transition: transform 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.organizer-session-pause__actions svg {
  width: 1.25em;
  height: 1.25em;
  flex: none;
}

.organizer-session-pause__actions button span {
  min-width: 0;
}

.organizer-session-pause__primary {
  background: color-mix(in srgb, hsl(var(--accent)) 90%, black);
  color: hsl(var(--accent-foreground));
}

.organizer-session-pause__secondary {
  background: var(--surface-soft);
  color: hsl(var(--foreground));
}

.organizer-session-pause__actions button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.organizer-session-pause__actions button:focus-visible {
  outline: none;
  background: color-mix(in srgb, hsl(var(--foreground)) 85%, hsl(var(--accent)));
  color: white;
}

.organizer-session-pause__actions button:focus-visible::before {
  position: absolute;
  top: 50%;
  left: 0.6rem;
  width: 3px;
  height: 1.1rem;
  border-radius: 2px;
  background: currentColor;
  content: "";
  transform: translateY(-50%);
}

.organizer-session-pause__actions button:active:not(:disabled) {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .organizer-session-pause__actions button:hover:not(:disabled) {
    filter: brightness(0.94);
  }

  .organizer-session-pause__actions button:hover:not(:focus-visible) {
    outline: none;
  }
}

@media (max-width: 40rem) {
  .organizer-session-pause {
    inset: auto 0 0;
    width: 100%;
    max-height: calc(100% - 1rem);
    max-height: calc(100dvh - 1rem);
    margin: 0;
    border-radius: 12px 12px 0 0;
  }

  .organizer-session-pause__card {
    padding: 1.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom));
  }

  .organizer-session-pause__actions {
    flex-direction: column;
  }

  .organizer-session-pause__actions button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .organizer-session-pause__actions button {
    transition: none;
  }

  .organizer-session-pause__actions button:active:not(:disabled) {
    transform: none;
  }
}
@media (forced-colors: active) {
  .organizer-session-pause__actions button:focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
}
</style>
