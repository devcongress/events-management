import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{vue,ts}",
    "./index.html",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Courier New', 'monospace'],
      },
      fontWeight: {
        normal: 'var(--font-weight-body)',
        medium: 'var(--font-weight-emphasis)',
        semibold: 'var(--font-weight-label)',
        bold: 'var(--font-weight-heading)',
        extrabold: 'var(--font-weight-display)',
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        quiz: {
          red: "#E21B3C",
          blue: "#1368CE",
          yellow: "#D89E00",
          green: "#26890C",
        },
        dc: {
          yellow: "#F5E642",
          "yellow-glow": "#FFF8A8",
          pink: "#E8117F",
          info: "#0F766E",
          "info-soft": "#E6F7F4",
          success: "#15803D",
          "success-soft": "#EAF7EE",
          cream: "#F5F2E8",
          ink: "#111111",
          paper: "#FFFFFF",
          "paper-warm": "#FEFCE8",
          border: "#E0DDD4",
          dark: "#111111",
          "dark-1": "#F5F2E8",
          "dark-2": "#FFFFFF",
          "dark-3": "#E0DDD4",
          gray: "#555555",
          "gray-light": "#888888",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        'glow-sm': '0 5px 0 rgba(17, 17, 17, 0.9)',
        'glow': '0 6px 0 rgba(17, 17, 17, 0.9)',
        'glow-lg': '0 10px 0 rgba(17, 17, 17, 0.9)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(249, 225, 94, 0.4)" },
          "50%": { boxShadow: "0 0 40px rgba(249, 225, 94, 0.6)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "slide-up": "slide-up 0.5s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
