<template>
  <div class="celebration-confetti" aria-hidden="true">
    <span v-for="piece in 14" :key="piece" class="celebration-confetti__piece" />
  </div>
</template>

<style scoped>
.celebration-confetti {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.celebration-confetti__piece {
  --confetti-x: 0rem;
  --confetti-y: 0rem;
  --confetti-rotate: 0deg;
  position: absolute;
  top: 48%;
  left: 50%;
  width: 0.48rem;
  height: 0.9rem;
  border-radius: 2px;
  background: #e8117f;
  opacity: 0;
  animation: celebration-confetti-burst 750ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.celebration-confetti__piece:nth-child(2n) {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: #f5e642;
}

.celebration-confetti__piece:nth-child(3n) { background: #7c3aed; }
.celebration-confetti__piece:nth-child(4n) { background: #111111; }
.celebration-confetti__piece:nth-child(5n) { background: #22c55e; }

.celebration-confetti__piece:nth-child(1) { --confetti-x: -11rem; --confetti-y: -8rem; --confetti-rotate: -42deg; }
.celebration-confetti__piece:nth-child(2) { --confetti-x: -8rem; --confetti-y: -11rem; --confetti-rotate: 64deg; animation-delay: 30ms; }
.celebration-confetti__piece:nth-child(3) { --confetti-x: -4rem; --confetti-y: -9rem; --confetti-rotate: 118deg; animation-delay: 70ms; }
.celebration-confetti__piece:nth-child(4) { --confetti-x: 2.5rem; --confetti-y: -10rem; --confetti-rotate: -72deg; animation-delay: 20ms; }
.celebration-confetti__piece:nth-child(5) { --confetti-x: 7rem; --confetti-y: -8rem; --confetti-rotate: 46deg; animation-delay: 90ms; }
.celebration-confetti__piece:nth-child(6) { --confetti-x: 11rem; --confetti-y: -4rem; --confetti-rotate: 126deg; animation-delay: 50ms; }
.celebration-confetti__piece:nth-child(7) { --confetti-x: -11rem; --confetti-y: 1rem; --confetti-rotate: 78deg; animation-delay: 110ms; }
.celebration-confetti__piece:nth-child(8) { --confetti-x: -8rem; --confetti-y: 6rem; --confetti-rotate: -118deg; animation-delay: 40ms; }
.celebration-confetti__piece:nth-child(9) { --confetti-x: -2rem; --confetti-y: 8rem; --confetti-rotate: 52deg; animation-delay: 130ms; }
.celebration-confetti__piece:nth-child(10) { --confetti-x: 4rem; --confetti-y: 7rem; --confetti-rotate: 142deg; animation-delay: 80ms; }
.celebration-confetti__piece:nth-child(11) { --confetti-x: 8rem; --confetti-y: 5rem; --confetti-rotate: -54deg; animation-delay: 120ms; }
.celebration-confetti__piece:nth-child(12) { --confetti-x: 11rem; --confetti-y: 1rem; --confetti-rotate: 96deg; animation-delay: 60ms; }
.celebration-confetti__piece:nth-child(13) { --confetti-x: -5rem; --confetti-y: 10rem; --confetti-rotate: 156deg; animation-delay: 100ms; }
.celebration-confetti__piece:nth-child(14) { --confetti-x: 6rem; --confetti-y: 10rem; --confetti-rotate: -132deg; animation-delay: 45ms; }

@keyframes celebration-confetti-burst {
  0% {
    opacity: 0;
    transform: translate3d(0, 1rem, 0) scale(0.4) rotate(0deg);
  }

  55% { opacity: 0.9; }

  100% {
    opacity: 0.28;
    transform: translate3d(var(--confetti-x), var(--confetti-y), 0) scale(1) rotate(var(--confetti-rotate));
  }
}

@media (prefers-reduced-motion: reduce) {
  .celebration-confetti__piece {
    opacity: 0.18;
    animation: none;
    transform: translate3d(var(--confetti-x), var(--confetti-y), 0) rotate(var(--confetti-rotate));
  }
}
</style>
