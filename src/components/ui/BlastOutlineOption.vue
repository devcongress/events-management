<script setup lang="ts">
defineProps<{ count: number }>();
const enabled = defineModel<boolean>({ default: false });
</script>

<template>
  <div class="blast-outline-option">
    <label>
      <input v-model="enabled" type="checkbox" :disabled="count === 0">
      <span>
        <strong>Include event outline</strong>
        <span>{{ count ? `${count} session${count === 1 ? '' : 's'} · titles and speakers, without times` : 'Add a program outline to this event first.' }}</span>
      </span>
    </label>
  </div>
</template>

<style scoped>
.blast-outline-option {
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid var(--dc-border, #dedbd2);
  border-radius: 6px;
}
.blast-outline-option label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}
.blast-outline-option input {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: #111111;
  flex-shrink: 0;
}
.blast-outline-option strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
}
.blast-outline-option span span {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: #666666;
}
</style>
