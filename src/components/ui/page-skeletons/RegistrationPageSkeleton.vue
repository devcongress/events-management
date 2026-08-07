<template>
  <div class="view-skeleton registration-page-skeleton" aria-busy="true" aria-label="Loading event registration">
    <header class="registration-page-skeleton__brand">
      <div class="skeleton-stat-card registration-page-skeleton__mark" />
      <div class="registration-page-skeleton__brand-copy">
        <div class="skeleton-eyebrow" />
        <div class="skeleton-line skeleton-line--third" />
      </div>
    </header>

    <div class="registration-page-skeleton__layout">
      <section class="skeleton-panel registration-page-skeleton__event">
        <div class="skeleton-card-media registration-page-skeleton__cover" />
        <div class="registration-page-skeleton__event-copy">
          <div class="skeleton-eyebrow" />
          <div class="skeleton-title" />
          <div class="skeleton-line" />
          <div class="skeleton-line skeleton-line--two-thirds" />
          <div class="registration-page-skeleton__meta">
            <div class="skeleton-form-card skeleton-form-card--compact" />
            <div class="skeleton-form-card skeleton-form-card--compact" />
          </div>
        </div>
      </section>

      <section class="skeleton-panel registration-page-skeleton__form">
        <div class="skeleton-eyebrow" />
        <div class="skeleton-form-card skeleton-form-card--compact" />
        <div class="skeleton-form-card skeleton-form-card--compact" />
        <div class="skeleton-button registration-page-skeleton__button" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.registration-page-skeleton {
  min-height: 100%;
}

.registration-page-skeleton__brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.registration-page-skeleton__mark {
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
}

.registration-page-skeleton__brand-copy {
  display: grid;
  min-width: 0;
  gap: 0.45rem;
  width: min(100%, 14rem);
}

.registration-page-skeleton__layout {
  display: grid;
  gap: 1rem;
}

.registration-page-skeleton__event {
  overflow: hidden;
  padding: 0;
}

.registration-page-skeleton__cover {
  min-height: 10rem;
  border-radius: 0;
}

.registration-page-skeleton__event-copy {
  display: grid;
  gap: 0.85rem;
  padding: clamp(1rem, 3vw, 1.75rem);
}

.registration-page-skeleton__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.35rem;
}

.registration-page-skeleton__form {
  display: grid;
  gap: 0.85rem;
  padding: clamp(1rem, 3vw, 1.75rem);
}

.registration-page-skeleton__button {
  width: 100%;
  margin-top: 0.25rem;
}

@media (min-width: 900px) {
  .registration-page-skeleton__layout {
    grid-template-columns: minmax(0, 1.25fr) minmax(18rem, 0.75fr);
    align-items: start;
  }
}

@media (max-width: 560px) {
  .registration-page-skeleton__meta {
    grid-template-columns: 1fr;
  }
}
</style>
