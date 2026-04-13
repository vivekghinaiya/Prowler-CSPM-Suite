/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"JetBrains Mono"', '"Fira Code"', "ui-monospace", "monospace"],
        display: ['"Orbitron"', '"Rajdhani"', "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "ui-monospace", "monospace"],
      },
      colors: {
        // Semantic design tokens (driven by CSS vars)
        page: "rgb(var(--c-page) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        "surface-alt": "rgb(var(--c-surface-alt) / <alpha-value>)",
        field: "rgb(var(--c-field) / <alpha-value>)",
        edge: "rgb(var(--c-edge) / <alpha-value>)",
        "edge-soft": "rgb(var(--c-edge-soft) / <alpha-value>)",
        "edge-row": "rgb(var(--c-edge-row) / <alpha-value>)",
        content: "rgb(var(--c-content) / <alpha-value>)",
        "content-secondary": "rgb(var(--c-content-secondary) / <alpha-value>)",
        "content-muted": "rgb(var(--c-content-muted) / <alpha-value>)",
        "content-faint": "rgb(var(--c-content-faint) / <alpha-value>)",
        overlay: "rgb(var(--c-overlay) / <alpha-value>)",
        // Cyberpunk accent tokens
        matrix: "rgb(var(--matrix) / <alpha-value>)",
        cyber: "rgb(var(--cyber) / <alpha-value>)",
        alert: "rgb(var(--alert) / <alpha-value>)",
      },
      boxShadow: {
        "glow-sm": "0 0 10px rgba(0,255,65,0.10)",
        glow: "0 0 18px rgba(0,255,65,0.15)",
        "glow-lg": "0 0 32px rgba(0,255,65,0.20)",
        "glow-cyber": "0 0 18px rgba(0,212,255,0.15)",
        "glow-alert": "0 0 18px rgba(255,0,60,0.20)",
      },
      animation: {
        "gradient-shift": "gradient-shift 15s ease infinite",
        "fade-in-up": "fade-in-up 0.4s ease both",
        blink: "blink 1s step-end infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        skeleton: "skeleton 1.5s ease-in-out infinite",
      },
      keyframes: {
        "gradient-shift": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "pulse-glow": {
          "0%,100%": { boxShadow: "0 0 4px rgba(0,255,65,0.3)" },
          "50%": { boxShadow: "0 0 14px rgba(0,255,65,0.7)" },
        },
        skeleton: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
    },
  },
  plugins: [],
};
