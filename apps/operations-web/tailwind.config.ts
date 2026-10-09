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
          DEFAULT: "var(--ink)",
          lum: "var(--text)",
          sec: "var(--text-2)",
          mut: "var(--text-3)",
        },
        night: "var(--night)",
        surface: {
          DEFAULT: "var(--surface)",
          high: "var(--surface-high)",
          top: "var(--surface-top)",
        },
        line: { DEFAULT: "var(--line)", soft: "var(--line-soft)" },
        text: { DEFAULT: "var(--text)", 2: "var(--text-2)", 3: "var(--text-3)" },
        primary: { DEFAULT: "var(--primary)", strong: "var(--primary-strong)" },
        volt: "var(--volt)",
        "on-volt": "var(--on-volt)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        err: "var(--err)",
        info: "var(--info)",
        // aliases for screens not yet converted
        bg: { deep: "var(--ink)", base: "var(--night)", raised: "var(--surface)" },
        edge: "var(--line)",
        brand: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-strong)",
          subtle: "rgba(142,114,255,.14)",
        },
        warm: "var(--warn)",
        cool: "var(--info)",
        danger: "var(--err)",
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
