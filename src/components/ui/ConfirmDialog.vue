<script setup lang="ts">
withDefaults(defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
}>(), {
  confirmLabel: 'Confirm',
  busyLabel: 'Working...',
  cancelLabel: 'Cancel',
  busy: false,
  danger: false,
});

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 px-4 py-6"
      role="presentation"
      @click.self="emit('cancel')"
    >
      <section
        class="w-full max-w-md rounded-lg border-2 border-dc-ink bg-white p-5 shadow-[6px_6px_0_#111111]"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-title`"
      >
        <h2 :id="`${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-title`" class="text-2xl font-black leading-tight text-dc-ink">
          {{ title }}
        </h2>
        <p class="mt-3 text-sm leading-6 text-dc-gray">{{ message }}</p>
        <div class="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            class="rounded-md border-2 border-dc-ink bg-white px-4 py-3 font-mono text-xs font-bold uppercase tracking-wide text-dc-ink disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="busy"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="rounded-md border-2 border-dc-ink px-4 py-3 font-mono text-xs font-bold uppercase tracking-wide text-white shadow-[3px_3px_0_#111111] disabled:cursor-not-allowed disabled:opacity-60"
            :class="danger ? 'bg-red-600' : 'bg-dc-pink'"
            :disabled="busy"
            @click="emit('confirm')"
          >
            {{ busy ? busyLabel : confirmLabel }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
