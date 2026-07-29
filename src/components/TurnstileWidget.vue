<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { loadTurnstile, turnstileEnabled, turnstileSiteKey } from '@/src/lib/turnstile';

const props = withDefaults(defineProps<{
  action?: string;
  disabled?: boolean;
  size?: 'normal' | 'flexible' | 'compact';
  theme?: 'auto' | 'light' | 'dark';
}>(), {
  action: 'default',
  disabled: false,
  size: 'normal',
  theme: 'light',
});

const emit = defineEmits<{
  error: [message: string | null];
  'token-change': [token: string];
}>();

const container = ref<HTMLDivElement | null>(null);
const widgetId = ref<string | null>(null);
const loading = ref(false);
const widgetError = ref('');
const configured = computed(() => turnstileEnabled());

async function renderWidget() {
  if (!configured.value || !container.value || widgetId.value || loading.value) {
    return;
  }

  loading.value = true;
  widgetError.value = '';
  emit('error', null);

  try {
    const turnstile = await loadTurnstile();

    if (!container.value) {
      return;
    }

    widgetId.value = turnstile.render(container.value, {
      sitekey: turnstileSiteKey,
      action: props.action,
      size: props.size,
      theme: props.theme,
      callback: (token) => {
        widgetError.value = '';
        emit('error', null);
        emit('token-change', token);
      },
      'error-callback': () => {
        widgetError.value = 'Human check could not load. Please try again.';
        emit('token-change', '');
        emit('error', widgetError.value);
      },
      'expired-callback': () => {
        widgetError.value = 'Human check expired. Please try again.';
        emit('token-change', '');
        emit('error', widgetError.value);
        reset();
      },
      'timeout-callback': () => {
        widgetError.value = 'Human check timed out. Please try again.';
        emit('token-change', '');
        emit('error', widgetError.value);
        reset();
      },
    });
  } catch {
    widgetError.value = 'Human check could not load. Refresh and try again.';
    emit('error', widgetError.value);
  } finally {
    loading.value = false;
  }
}

function reset() {
  emit('token-change', '');

  if (widgetId.value && window.turnstile) {
    window.turnstile.reset(widgetId.value);
  }
}

defineExpose({ reset });

watch(() => props.disabled, (disabled) => {
  if (!disabled) {
    void nextTick(renderWidget);
  }
});

onMounted(() => {
  void renderWidget();
});

onBeforeUnmount(() => {
  emit('token-change', '');

  if (widgetId.value && window.turnstile) {
    window.turnstile.remove(widgetId.value);
  }
});
</script>

<template>
  <div class="turnstile-field">
    <div v-if="configured" ref="container" class="turnstile-widget" />
    <p v-else class="turnstile-note">
      Human check will appear automatically when Cloudflare Turnstile is configured for this environment.
    </p>
    <p v-if="loading" class="turnstile-note">Loading human check...</p>
    <p v-else-if="widgetError" class="turnstile-note turnstile-note--error">{{ widgetError }}</p>
  </div>
</template>

<style scoped>
.turnstile-field {
  display: grid;
  gap: 0.5rem;
}

.turnstile-widget {
  min-height: 4.25rem;
}

.turnstile-note {
  font-family: var(--font-mono), monospace;
  font-size: 0.7rem;
  font-weight: var(--font-weight-emphasis);
  letter-spacing: 0.04em;
  line-height: 1.4;
  color: #595959;
}

.turnstile-note--error {
  color: #b42318;
}
</style>
