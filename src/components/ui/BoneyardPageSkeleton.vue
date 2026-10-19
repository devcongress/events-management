<script setup lang="ts">
import Skeleton from "boneyard-js/vue";
import "@/src/bones/registry";
import BoneyardPageSkeletonFixture from "./BoneyardPageSkeletonFixture.vue";

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

withDefaults(
  defineProps<{
    label: string;
    fixtureCount?: number;
    layout?: SkeletonLayout;
    name: string;
    showHeader?: boolean;
  }>(),
  {
    layout: "workspace",
    showHeader: true,
    fixtureCount: 3,
  },
);
</script>

<template>
  <section role="status" :aria-label="`Loading ${label}`">
    <Skeleton
      :loading="true"
      :name="name"
      animate="pulse"
      color="rgba(22, 22, 22, 0.09)"
      dark-color="rgba(229, 229, 229, 0.12)"
      :class="`boneyard-page-skeleton boneyard-page-skeleton--${layout}`"
    >
      <template #fixture>
        <BoneyardPageSkeletonFixture :label="label" :layout="layout" :show-header="showHeader" :fixture-count="fixtureCount" />
      </template>

      <BoneyardPageSkeletonFixture :aria-hidden="true" :label="label" :layout="layout" :show-header="showHeader" :fixture-count="fixtureCount" />

      <template #fallback>
        <section class="boneyard-page-skeleton__fallback" :aria-busy="true" :aria-label="`Loading ${label}`">
          <p>Loading {{ label }}…</p>
        </section>
      </template>
    </Skeleton>
  </section>
</template>
