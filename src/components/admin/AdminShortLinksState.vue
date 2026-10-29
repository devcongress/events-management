<script setup lang="ts">
import BoneyardPageSkeleton from '@/src/components/ui/BoneyardPageSkeleton.vue';

defineProps<{
  error: string;
  pending: boolean;
  statusFilter: 'active' | 'revoked';
  totalCount: number;
  visibleCount: number;
}>();
</script>

<template>
  <div class="audit-log-delivery-history audit-log-short-links__history">
    <BoneyardPageSkeleton v-if="pending" name="admin-short-links" label="admin short links" :show-header="false" />
    <div v-else-if="error" class="audit-log-delivery-history__empty" role="alert">{{ error }}</div>
    <div v-else-if="totalCount === 0" class="audit-log-delivery-history__empty">No open public forms are ready for a flyer link.</div>
    <div v-else-if="visibleCount === 0" class="audit-log-delivery-history__empty">No {{ statusFilter }} links.</div>
    <slot v-else />
  </div>
</template>

<style scoped>
.audit-log-delivery-history__empty {
  border-top: 1px solid #e4e0d8;
  padding: 1.5rem;
  color: #6f6c65;
  font-size: 0.875rem;
  line-height: 1.55;
}
</style>
