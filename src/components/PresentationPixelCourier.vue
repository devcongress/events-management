<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const hidden = ref(false);

function updateVisibility() {
  hidden.value = document.hidden;
}

onMounted(() => {
  updateVisibility();
  document.addEventListener('visibilitychange', updateVisibility);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', updateVisibility);
});
</script>

<template>
  <div class="pixel-courier" :class="{ 'is-paused': hidden }">
    <div class="pixel-courier__lane" aria-hidden="true">
      <div v-for="direction in ['outbound', 'return']" :key="direction" class="pixel-courier__runner" :class="`pixel-courier__runner--${direction}`">
        <span class="pixel-courier__sprite">
          <span class="pixel-courier__trail"><i></i><i></i><i></i><i></i></span>
          <span class="pixel-courier__code">&lt;/&gt;</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pixel-courier {
  position: absolute;
  inset: auto 0 0;
  height: 40px;
  pointer-events: none;
}

.pixel-courier__lane {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.pixel-courier__runner {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
  animation: courier-outbound 28s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.pixel-courier__runner--return {
  animation-name: courier-return;
}

.pixel-courier__sprite {
  position: absolute;
  left: -160px;
  display: flex;
  align-items: center;
  gap: 9px;
  height: 36px;
  color: #c90076;
}

.pixel-courier__runner--return .pixel-courier__sprite {
  left: auto;
  right: -160px;
  flex-direction: row-reverse;
}

.pixel-courier__code {
  font: 600 clamp(24px, 2vw, 30px)/1 var(--font-mono), monospace;
}

.pixel-courier__trail {
  display: flex;
  align-items: center;
  gap: 9px;
}

.pixel-courier__runner--return .pixel-courier__trail {
  flex-direction: row-reverse;
}

.pixel-courier__trail i {
  width: 5px;
  height: 5px;
  background: currentColor;
  opacity: 0.12;
}

.pixel-courier__trail i:nth-child(2) {
  opacity: 0.24;
}
.pixel-courier__trail i:nth-child(3) {
  opacity: 0.4;
}
.pixel-courier__trail i:nth-child(4) {
  opacity: 0.65;
}

.is-paused .pixel-courier__runner {
  animation-play-state: paused;
}

/* Ten-second crossings alternate with four-second quiet intervals. */
@keyframes courier-outbound {
  0%, 5% {
    transform: translateX(0);
    opacity: 0;
  }
  7%, 39% {
    opacity: 0.7;
  }
  41%, 100% {
    transform: translateX(calc(100% + 180px));
    opacity: 0;
  }
}

@keyframes courier-return {
  0%, 55% {
    transform: translateX(0);
    opacity: 0;
  }
  57%, 89% {
    opacity: 0.7;
  }
  91%, 100% {
    transform: translateX(calc(-100% - 180px));
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce), print {
  .pixel-courier {
    display: none;
  }

  .pixel-courier__runner {
    animation: none;
  }
}
</style>
