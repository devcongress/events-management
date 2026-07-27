/**
 * DevCongress Design System
 *
 * Centralized design tokens for easy theming and portability.
 * To rebrand: update these values and restart dev server.
 */

export const designSystem = {
  // Brand Colors
  colors: {
    yellow: '#F5E642',
    yellowGlow: '#FFF8A8',
    pink: '#E8117F',
    info: '#0F766E',
    infoSoft: '#E6F7F4',
    success: '#15803D',
    successSoft: '#EAF7EE',
    cream: '#F5F2E8',
    ink: '#111111',
    paper: '#FFFFFF',
    paperWarm: '#FEFCE8',
    border: '#E0DDD4',
    dark: '#111111',
    dark1: '#F5F2E8',
    dark2: '#FFFFFF',
    dark3: '#E0DDD4',
    gray: '#555555',
    grayLight: '#888888',
  },

  // Quiz Answer Colors (functional - don't change)
  quizColors: {
    red: '#E21B3C',
    blue: '#1368CE',
    yellow: '#D89E00',
    green: '#26890C',
  },

  // Typography
  fonts: {
    sans: 'var(--font-sans)',
    mono: 'var(--font-mono)',
    display: 'var(--font-sans)',
  },
  fontWeights: {
    body: 400,
    emphasis: 500,
    label: 600,
    heading: 700,
    display: 800,
  },

  // Common Styles
  styles: {
    // Button variants
    buttons: {
      primary: 'bg-dc-yellow text-dc-dark font-semibold font-mono hover:shadow-glow transition-all uppercase tracking-wide',
      secondary: 'border-2 border-dc-yellow text-dc-yellow font-semibold font-mono hover:shadow-glow-sm transition-all uppercase tracking-wide',
      ghost: 'text-dc-yellow hover:text-dc-yellow-glow font-mono transition-colors',
    },

    // Card variants
    cards: {
      default: 'bg-dc-dark-1 border-2 border-dc-dark-3',
      highlighted: 'bg-dc-dark-1 border-2 border-dc-yellow',
      glow: 'bg-dc-dark-1 border-2 border-dc-yellow shadow-glow',
    },

    // Input styles
    inputs: {
      default: 'bg-dc-dark-2 border-2 border-dc-dark-3 focus:border-dc-yellow text-white font-mono outline-none transition-colors',
    },

    // Badge styles
    badges: {
      yellow: 'px-3 py-1 bg-dc-yellow text-dc-dark font-mono text-xs font-semibold uppercase tracking-wide',
      outline: 'px-3 py-1 bg-dc-dark-2 border border-dc-yellow/30 font-mono text-xs text-dc-yellow',
    },

    // Corner decorations
    corners: {
      tl: 'absolute -top-4 -left-4 w-20 h-20 border-t-4 border-l-4 border-dc-yellow/50',
      tr: 'absolute -top-4 -right-4 w-20 h-20 border-t-4 border-r-4 border-dc-yellow/50',
      bl: 'absolute -bottom-4 -left-4 w-20 h-20 border-b-4 border-l-4 border-dc-yellow/50',
      br: 'absolute -bottom-4 -right-4 w-20 h-20 border-b-4 border-r-4 border-dc-yellow/50',
    },
  },

  // Spacing
  spacing: {
    section: 'py-16',
    card: 'p-6',
    cardLg: 'p-8',
  },

  // Animations
  animations: {
    fadeIn: 'animate-slide-up',
    pulse: 'animate-pulse-glow',
  },
} as const;

/**
 * Status badge generator
 */
export function getStatusBadge(status: string) {
  const variants = {
    pending: { bg: 'bg-dc-dark-2', text: 'text-dc-gray', label: 'PENDING' },
    accepted: { bg: 'bg-green-900/30', text: 'text-green-400', label: 'ACCEPTED' },
    rejected: { bg: 'bg-red-900/30', text: 'text-red-400', label: 'REJECTED' },
    live: { bg: 'bg-red-500', text: 'text-white', label: '● LIVE' },
    completed: { bg: 'bg-dc-dark-2', text: 'text-dc-gray', label: 'COMPLETED' },
  };

  const variant = variants[status as keyof typeof variants] || variants.pending;

  return {
    className: `px-3 py-1 ${variant.bg} ${variant.text} font-mono text-xs font-semibold border border-current`,
    label: variant.label,
  };
}
