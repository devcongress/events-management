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
    heading: 600,
    display: 700,
  },

  // Common Styles
  styles: {
    // Button variants
    buttons: {
      primary: 'min-h-11 rounded-md border border-dc-ink bg-dc-yellow px-4 py-2 text-dc-ink font-mono text-xs font-semibold uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dc-pink',
      secondary: 'min-h-11 rounded-md border border-dc-ink bg-dc-paper px-4 py-2 text-dc-ink font-mono text-xs font-semibold uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dc-pink',
      ghost: 'min-h-11 rounded-md px-4 py-2 text-dc-ink font-mono text-xs font-semibold uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dc-pink',
    },

    // Card variants
    cards: {
      default: 'rounded-lg border border-dc-border bg-dc-paper',
      highlighted: 'rounded-lg border border-dc-ink bg-dc-paper',
      glow: 'rounded-lg border border-dc-ink bg-dc-paper shadow-[2px_2px_0_#111111]',
    },

    // Input styles
    inputs: {
      default: 'min-h-11 rounded-md border border-dc-border bg-dc-paper px-3 text-dc-ink outline-none focus-visible:border-dc-pink focus-visible:ring-2 focus-visible:ring-dc-pink/20',
    },

    // Badge styles
    badges: {
      yellow: 'rounded-md bg-dc-yellow px-3 py-1 text-dc-ink font-mono text-xs font-semibold uppercase tracking-wide',
      outline: 'rounded-md border border-dc-border bg-dc-paper px-3 py-1 text-dc-ink font-mono text-xs',
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
    pending: { bg: 'bg-dc-paper-warm', text: 'text-dc-gray', label: 'PENDING' },
    accepted: { bg: 'bg-green-50', text: 'text-green-800', label: 'ACCEPTED' },
    rejected: { bg: 'bg-red-50', text: 'text-red-800', label: 'REJECTED' },
    live: { bg: 'bg-dc-pink', text: 'text-white', label: '● LIVE' },
    completed: { bg: 'bg-dc-paper', text: 'text-dc-gray', label: 'COMPLETED' },
  };

  const variant = variants[status as keyof typeof variants] || variants.pending;

  return {
    className: `px-3 py-1 ${variant.bg} ${variant.text} font-mono text-xs font-semibold border border-current`,
    label: variant.label,
  };
}
