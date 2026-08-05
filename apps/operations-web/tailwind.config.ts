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
        bg: {
          deep: "var(--bg-deep)",
          base: "var(--bg-base)",
          raised: "var(--bg-raised)",
        },
        edge: "var(--edge)",
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          subtle: "var(--brand-subtle)",
        },
        warm: "var(--warm)",
        cool: "var(--cool)",
        ok: "var(--ok)",
        danger: "var(--danger)",
        ink: {
          lum: "var(--ink-lum)",
          sec: "var(--ink-sec)",
          mut: "var(--ink-mut)",
        },
      },
      fontFamily: {
        ui: ["var(--font-ui)"],
        display: ["var(--font-display)"],
        tabular: ["var(--font-ui)"],
      },
      boxShadow: {
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
        panel: "26px",
        sheet: "20px",
      },
      transitionTimingFunction: {
        light: "cubic-bezier(.19, 1, .22, 1)",
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
