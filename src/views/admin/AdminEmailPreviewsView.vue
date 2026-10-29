<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import AppDropdown from "@/src/components/AppDropdown.vue";
import BoneyardPageSkeleton from "@/src/components/ui/BoneyardPageSkeleton.vue";
import { fetchAdminEmailPreviews, fetchJson, queryKeys } from "@/src/lib/api";

const previewQuery = useQuery({
  queryKey: queryKeys.adminEmailPreviews,
  queryFn: fetchAdminEmailPreviews,
});
const selectedId = ref("registration_confirmed");
const mode = ref<"html" | "text">("html");
const width = ref<"desktop" | "mobile">("desktop");
const sending = ref(false);
const sendMessage = ref("");
const sendError = ref(false);
const previews = computed(() => previewQuery.data.value?.previews ?? []);
const options = computed(() =>
  previews.value.map((preview) => ({
    value: preview.id,
    label: `${preview.category} · ${preview.label}`,
  })),
);
const selected = computed(
  () =>
    previews.value.find((preview) => preview.id === selectedId.value) ??
    previews.value[0] ??
    null,
);

watch(previews, (values) => {
  if (
    values.length &&
    !values.some((preview) => preview.id === selectedId.value)
  )
    selectedId.value = values[0].id;
});

watch(selectedId, () => {
  sendMessage.value = "";
});

async function sendTest() {
  if (!selected.value || sending.value) return;

  sending.value = true;
  sendMessage.value = "";
  sendError.value = false;

  try {
    const result = await fetchJson<{ recipient: string }>(
      `/api/admin/email-previews/${encodeURIComponent(selected.value.id)}/send-test`,
      {
        method: "POST",
        credentials: "include",
      },
    );

    sendMessage.value = `Test email accepted for ${result.recipient}. Check your inbox.`;
  } catch (error) {
    sendError.value = true;
    sendMessage.value =
      error instanceof Error ? error.message : "Unable to send the test email.";
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <section class="email-preview" aria-labelledby="email-preview-heading">
    <header class="email-preview__header">
      <div>
        <h2 id="email-preview-heading">Email previews</h2>
        <p>
          Choose a template, then send yourself a test to see it in your inbox.
        </p>
      </div>
      <button
        type="button"
        class="email-preview__send"
        :disabled="!selected || sending"
        @click="sendTest"
      >
        {{ sending ? "Sending…" : "Send me a test" }}
      </button>
    </header>

    <p
      v-if="sendMessage"
      class="email-preview__message"
      :class="{ 'email-preview__message--error': sendError }"
      role="status"
    >
      {{ sendMessage }}
    </p>
    <BoneyardPageSkeleton
      v-if="previewQuery.isPending.value"
      name="admin-email-previews"
      label="admin email previews"
      :show-header="false"
    />
    <div
      v-else-if="previewQuery.isError.value"
      class="email-preview__state"
      role="alert"
    >
      <p>Could not load email templates.</p>
      <button type="button" @click="previewQuery.refetch()">Try again</button>
    </div>
    <template v-else-if="selected">
      <div class="email-preview__controls">
        <AppDropdown
          v-model="selectedId"
          label="Email template"
          :options="options"
          :disabled="sending"
          teleport
        />
        <div class="email-preview__switches">
          <div class="email-preview__switch" aria-label="Email format">
            <button
              type="button"
              :aria-pressed="mode === 'html'"
              @click="mode = 'html'"
            >
              Visual
            </button>
            <button
              type="button"
              :aria-pressed="mode === 'text'"
              @click="mode = 'text'"
            >
              Plain text
            </button>
          </div>
          <div
            v-if="mode === 'html'"
            class="email-preview__switch"
            aria-label="Preview width"
          >
            <button
              type="button"
              :aria-pressed="width === 'desktop'"
              @click="width = 'desktop'"
            >
              Desktop
            </button>
            <button
              type="button"
              :aria-pressed="width === 'mobile'"
              @click="width = 'mobile'"
            >
              Mobile
            </button>
          </div>
        </div>
      </div>
      <div class="email-preview__envelope">
        <p><strong>Scenario</strong> {{ selected.recipient }} · {{ selected.trigger }}</p>
        <p><strong>From</strong> {{ selected.from }}</p>
        <p><strong>Sample to</strong> {{ selected.to }}</p>
        <p><strong>Subject</strong> {{ selected.subject }}</p>
      </div>
      <div class="email-preview__stage">
        <iframe
          v-if="mode === 'html'"
          :key="selected.id"
          :class="{ 'email-preview__frame--mobile': width === 'mobile' }"
          class="email-preview__frame"
          :src="`/api/admin/email-previews/${encodeURIComponent(selected.id)}/html`"
          :title="`${selected.label} rendered email`"
          sandbox=""
        />
        <pre v-else class="email-preview__text">{{ selected.text }}</pre>
      </div>
      <details
        v-if="previewQuery.data.value?.planned.length"
        class="email-preview__planned"
      >
        <summary>Planned templates</summary>
        <ul>
          <li
            v-for="scenario in previewQuery.data.value.planned"
            :key="scenario.id"
          >
            {{ scenario.subject_pattern }}
          </li>
        </ul>
      </details>
    </template>
  </section>
</template>

<style scoped>
.email-preview {
  border: 1px solid #e0ddd4;
  border-radius: 8px;
  background: #fff;
  color: #111;
}
.email-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1.5rem;
  border-bottom: 1px solid #e0ddd4;
}
.email-preview__header h2 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
}
.email-preview__header p {
  margin: 0.25rem 0 0;
  color: #555;
}
.email-preview__send {
  min-height: 44px;
  border: 1px solid #111;
  border-radius: 6px;
  padding: 0.6rem 1rem;
  background: #e8117f;
  color: white;
  font-weight: 700;
}
.email-preview__send:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.email-preview__controls {
  display: grid;
  grid-template-columns: minmax(14rem, 24rem) 1fr;
  align-items: end;
  gap: 1rem;
  padding: 1rem 1.5rem;
}
.email-preview__switches {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.email-preview__switch {
  display: flex;
  gap: 0.25rem;
  padding: 0.2rem;
  background: #f5f2e8;
  border-radius: 6px;
}
.email-preview__switch button {
  min-height: 40px;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  color: #555;
}
.email-preview__switch button[aria-pressed="true"] {
  background: #fff;
  color: #111;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
}
.email-preview__envelope {
  padding: 0.75rem 1.5rem;
  border-top: 1px solid #e0ddd4;
  border-bottom: 1px solid #e0ddd4;
}
.email-preview__envelope p {
  margin: 0.25rem 0;
  overflow-wrap: anywhere;
}
.email-preview__envelope strong {
  display: inline-block;
  min-width: 4.5rem;
  color: #555;
  font-size: 0.8rem;
}
.email-preview__stage {
  display: flex;
  justify-content: center;
  padding: 1.5rem;
  background: #f5f2e8;
}
.email-preview__frame {
  display: block;
  width: 100%;
  height: 700px;
  border: 1px solid #e0ddd4;
  border-radius: 8px;
  background: #fff;
}
.email-preview__frame--mobile {
  max-width: 375px;
}
.email-preview__text {
  width: 100%;
  margin: 0;
  padding: 1rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: #fff;
}
.email-preview__message,
.email-preview__state,
.email-preview__planned {
  margin: 1rem 1.5rem;
}
.email-preview__message {
  color: #176748;
}
.email-preview__message--error {
  color: #a12626;
}
.email-preview button:focus-visible {
  outline: 2px solid #e8117f;
  outline-offset: 2px;
}
@media (max-width: 767px) {
  .email-preview__controls {
    grid-template-columns: 1fr;
  }
  .email-preview__switches {
    justify-content: flex-start;
  }
  .email-preview__stage {
    padding: 0.75rem;
  }
}
</style>
