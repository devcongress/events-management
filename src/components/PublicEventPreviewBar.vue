<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { adminPath } from '@/src/admin-routes';

defineProps<{
  endpoint: string;
  eventCount?: number;
  detail?: boolean;
}>();
</script>

<template>
  <div class="public-preview-bar">
    <div class="public-preview-bar__inner">
      <div class="public-preview-bar__identity">
        <span class="public-preview-bar__badge">Consumer preview</span>
        <div>
          <p class="public-preview-bar__title">
            {{ detail ? 'Public event detail' : 'Public events collection' }}
          </p>
          <p class="public-preview-bar__description">
            Website-shaped preview of the data another service receives.
          </p>
        </div>
      </div>

      <div class="public-preview-bar__actions">
        <span v-if="eventCount !== undefined" class="public-preview-bar__count">
          {{ eventCount }} published
        </span>
        <code class="public-preview-bar__endpoint">GET {{ endpoint }}</code>
        <a
          :href="endpoint"
          target="_blank"
          rel="noopener noreferrer"
          class="public-preview-bar__link"
        >
          View JSON
          <span aria-hidden="true">↗</span>
        </a>
        <RouterLink :to="adminPath('events')" class="public-preview-bar__back">
          Back to Event Management
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.public-preview-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 2px solid #111111;
  background: #1c1c1c;
  color: #e5e5e5;
}

.public-preview-bar__inner {
  display: flex;
  width: min(100% - 2rem, 80rem);
  min-height: 4.75rem;
  margin-inline: auto;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-block: 0.75rem;
}

.public-preview-bar__identity,
.public-preview-bar__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.public-preview-bar__badge,
.public-preview-bar__count,
.public-preview-bar__endpoint,
.public-preview-bar__link,
.public-preview-bar__back {
  font-family: var(--font-mono), monospace;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  text-transform: uppercase;
}

.public-preview-bar__badge {
  flex: none;
  border: 1px solid #f5e642;
  border-radius: 0.375rem;
  background: #f5e642;
  padding: 0.55rem 0.65rem;
  color: #111111;
}

.public-preview-bar__title,
.public-preview-bar__description {
  margin: 0;
}

.public-preview-bar__title {
  color: #e5e5e5;
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.2;
}

.public-preview-bar__description {
  margin-top: 0.2rem;
  color: #a1a1a1;
  font-size: 0.72rem;
  line-height: 1.35;
}

.public-preview-bar__actions {
  justify-content: flex-end;
}

.public-preview-bar__count,
.public-preview-bar__endpoint {
  color: #a1a1a1;
}

.public-preview-bar__endpoint {
  max-width: 19rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.public-preview-bar__link,
.public-preview-bar__back {
  display: inline-flex;
  min-height: 2.5rem;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  border: 1px solid #5a5a5a;
  border-radius: 0.5rem;
  padding-inline: 0.75rem;
  color: #e5e5e5;
  text-decoration: none;
}

.public-preview-bar__back {
  border-color: #e5e5e5;
  background: #e5e5e5;
  color: #111111;
}

.public-preview-bar__link:focus-visible,
.public-preview-bar__back:focus-visible {
  outline: 2px solid #f5e642;
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .public-preview-bar__link:hover {
    border-color: #e5e5e5;
  }

  .public-preview-bar__back:hover {
    background: #f5e642;
  }
}

@media (max-width: 900px) {
  .public-preview-bar__inner,
  .public-preview-bar__actions {
    align-items: flex-start;
  }

  .public-preview-bar__inner {
    flex-direction: column;
  }

  .public-preview-bar__actions {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}

@media (max-width: 520px) {
  .public-preview-bar {
    position: relative;
  }

  .public-preview-bar__inner {
    width: min(100% - 1.25rem, 80rem);
  }

  .public-preview-bar__identity {
    align-items: flex-start;
  }

  .public-preview-bar__description,
  .public-preview-bar__endpoint {
    display: none;
  }

  .public-preview-bar__count {
    width: 100%;
  }

  .public-preview-bar__link,
  .public-preview-bar__back {
    min-height: 2.75rem;
  }
}
</style>
