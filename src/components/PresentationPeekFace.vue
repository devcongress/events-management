<template>
  <div class="peek-window" aria-hidden="true">
    <svg class="peek-face" viewBox="0 0 100 110" focusable="false">
      <g stroke="#111" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M28 65C10 48 20 14 45 13C73 6 89 28 78 62" fill="#111" />
        <ellipse cx="23" cy="61" rx="7" ry="10" fill="#e7b488" />
        <ellipse cx="77" cy="61" rx="7" ry="10" fill="#e7b488" />
        <path d="M25 42Q26 27 49 29Q72 29 75 43V68Q73 94 50 96Q27 94 25 68Z" fill="#e7b488" />
        <path d="M25 43Q35 45 43 31Q54 47 75 43" fill="#111" />
        <path d="M30 50Q35 45 42 49M58 47Q65 43 70 48" fill="none" />
        <ellipse cx="37" cy="61" rx="9" ry="10" fill="white" />
        <ellipse cx="63" cy="61" rx="9" ry="10" fill="white" />
        <g class="peek-pupils" fill="#111" stroke="none">
          <circle cx="37" cy="62" r="4" />
          <circle cx="63" cy="62" r="4" />
        </g>
        <path d="M49 65L46 75H52M41 82Q50 88 59 82" fill="none" />
        <path d="M26 33Q31 8 60 17L71 32" fill="#f9ed32" />
        <path d="M24 35Q48 25 77 36" fill="none" stroke="#ed008c" stroke-width="6" />
        <path d="M20 104V98Q20 91 25 94Q29 90 32 95Q37 92 38 99V104M63 104V98Q64 92 68 95Q72 90 76 94Q81 92 81 99V104" fill="#e7b488" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.peek-window {
  position: relative;
  flex: 0 0 clamp(76px, 8vw, 136px);
  margin-bottom: .35em;
  aspect-ratio: 1 / 1.1;
  overflow: hidden;
  pointer-events: none;
}

.peek-window::after {
  content: '';
  position: absolute;
  inset: auto 10% 0;
  height: 3px;
  border-radius: 2px;
  background: #111;
}

.peek-face {
  display: block;
  width: 100%;
  height: 100%;
  transform: translateY(105%);
  animation: peek-hello 18s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}

.peek-pupils {
  animation: peek-look 18s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes peek-hello {
  0%, 12%, 27%, 100% {
    transform: translateY(105%);
  }

  13.4%, 25.6% {
    transform: translateY(0);
  }
}

@keyframes peek-look {
  0%, 14%, 23%, 100% {
    transform: translateX(0);
  }

  15%, 18% {
    transform: translateX(-3px);
  }

  19%, 22% {
    transform: translateX(3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .peek-face, .peek-pupils {
    animation: none;
    transform: none;
  }
}
</style>
