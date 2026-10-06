<script setup lang="ts">
const DEVCONGRESS_FORM_COLLABORATION_PATH = '/illustrations/devcongress-form-collaboration.png';
</script>

<template>
  <div class="page-view public-form-route-frame">
    <aside class="public-form-route-frame__art" aria-hidden="true">
      <div class="public-form-route-frame__art-window">
        <img
          :src="DEVCONGRESS_FORM_COLLABORATION_PATH"
          alt=""
          aria-hidden="true"
          :draggable="false"
          decoding="async"
        />
      </div>
    </aside>
    <div class="public-form-route-frame__content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.public-form-route-frame {
  position: relative;
  width: 100%;
  min-height: 100%;
  overflow: clip;
  isolation: isolate;
  background: #f5f2e8;
}

.public-form-route-frame__content {
  position: relative;
  z-index: 2;
  width: 100%;
  min-width: 0;
}

.public-form-route-frame__content > :deep(.page-view) {
  background: transparent;
}

.public-form-route-frame__art {
  position: fixed;
  z-index: 1;
  inset: 0;
  overflow: clip;
  pointer-events: none;
}

/*
 * Frame source pixels x: 700–1536 and y: 380–980, where the readable
 * collaboration group lives. The source asset intentionally has generous
 * transparent space, so this window frames the subject rather than scaling
 * that empty canvas into the viewport.
 */
.public-form-route-frame__art-window {
  position: absolute;
  right: max(env(safe-area-inset-right), -0.25rem);
  bottom: max(env(safe-area-inset-bottom), -0.25rem);
  width: min(24rem, 86vw);
  aspect-ratio: 836 / 600;
  overflow: hidden;
}

.public-form-route-frame__art-window img {
  position: absolute;
  top: -63.333%;
  left: -83.732%;
  display: block;
  width: 183.732%;
  max-width: none;
  height: auto;
}

:global(.public-form-route-frame.page-enter-active),
:global(.public-form-route-frame.page-leave-active) {
  transition: none;
  will-change: auto;
}

:global(.public-form-route-frame.page-enter-from),
:global(.public-form-route-frame.page-leave-to) {
  opacity: 1;
  transform: none;
}

@media (min-width: 64rem) {
  .public-form-route-frame__art-window {
    right: max(env(safe-area-inset-right), -0.5rem);
    bottom: max(env(safe-area-inset-bottom), -0.5rem);
    width: clamp(26rem, 40vw, 44rem);
  }
}

@media (min-width: 80rem) {
  .public-form-route-frame__content {
    width: calc(100% - clamp(20rem, 30vw, 30rem));
  }
}
</style>
