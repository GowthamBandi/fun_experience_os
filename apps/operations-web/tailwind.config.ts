import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "rgb(var(--ink-rgb) / <alpha-value>)",
          lum: "rgb(var(--text-rgb) / <alpha-value>)",
          sec: "rgb(var(--text-2-rgb) / <alpha-value>)",
          mut: "rgb(var(--text-3-rgb) / <alpha-value>)",
        },
        night: "rgb(var(--night-rgb) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--surface-rgb) / <alpha-value>)",
          high: "rgb(var(--surface-high-rgb) / <alpha-value>)",
          top: "rgb(var(--surface-top-rgb) / <alpha-value>)",
        },
        line: { DEFAULT: "rgb(var(--line-rgb) / <alpha-value>)", soft: "var(--line-soft)" },
        text: { DEFAULT: "rgb(var(--text-rgb) / <alpha-value>)", 2: "rgb(var(--text-2-rgb) / <alpha-value>)", 3: "rgb(var(--text-3-rgb) / <alpha-value>)" },
        primary: { DEFAULT: "rgb(var(--primary-rgb) / <alpha-value>)", strong: "rgb(var(--primary-strong-rgb) / <alpha-value>)" },
        volt: "rgb(var(--volt-rgb) / <alpha-value>)",
        "on-volt": "rgb(var(--on-volt-rgb) / <alpha-value>)",
        ok: "rgb(var(--ok-rgb) / <alpha-value>)",
        warn: "rgb(var(--warn-rgb) / <alpha-value>)",
        err: "rgb(var(--err-rgb) / <alpha-value>)",
        info: "rgb(var(--info-rgb) / <alpha-value>)",
        // aliases for screens not yet converted
        bg: { deep: "rgb(var(--ink-rgb) / <alpha-value>)", base: "rgb(var(--night-rgb) / <alpha-value>)", raised: "rgb(var(--surface-rgb) / <alpha-value>)" },
        edge: "rgb(var(--line-rgb) / <alpha-value>)",
        brand: {
          DEFAULT: "rgb(var(--primary-rgb) / <alpha-value>)",
          hover: "rgb(var(--primary-strong-rgb) / <alpha-value>)",
          subtle: "rgba(142,114,255,.14)",
        },
        warm: "rgb(var(--warn-rgb) / <alpha-value>)",
        cool: "rgb(var(--info-rgb) / <alpha-value>)",
        danger: "rgb(var(--err-rgb) / <alpha-value>)",
      },
      fontFamily: {
        ui: ["var(--font-ui)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        tabular: ["var(--font-ui)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 40px 120px -30px rgba(142,114,255,.35)",
        glass: "0 24px 64px -16px rgba(0,0,0,0.32)",
        panel: "0 12px 32px -8px rgba(0,0,0,0.20)",
        lift: "0 4px 12px -2px rgba(0,0,0,0.12)",
      },
      backdropBlur: {
        frost: "24px",
        surface: "16px",
        control: "8px",
      },
      borderRadius: {
        card: "24px",
        control: "16px",
        pill: "99px",
        panel: "26px",
        sheet: "20px",
      },
      transitionTimingFunction: {
        pulse: "cubic-bezier(.2,.8,.2,1)",
        light: "cubic-bezier(.2,.8,.2,1)",
      },
      keyframes: {
        grain: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "25%": { transform: "translate(-1px, 1px)" },
          "50%": { transform: "translate(1px, -1px)" },
          "75%": { transform: "translate(-1px, -1px)" },
        },
        breath: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(200%)" },
        },
      },
      animation: {
        grain: "grain 0.2s steps(2) infinite",
        breath: "breath 3s ease-in-out infinite",
        shimmer: "shimmer 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
