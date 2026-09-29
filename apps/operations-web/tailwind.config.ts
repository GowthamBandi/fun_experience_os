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
          sunken: "var(--bg-sunken)",
        },
        edge: {
          DEFAULT: "var(--edge)",
          strong: "var(--edge-strong)",
        },
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          subtle: "var(--brand-subtle)",
          ink: "var(--brand-ink)",
        },
        accent: "var(--accent)",
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
        mono: ["var(--font-mono)"],
      },
      boxShadow: {
        glass: "0 1px 2px rgba(16,19,39,0.04), 0 24px 48px -20px rgba(16,19,39,0.18)",
        panel: "0 1px 2px rgba(16,19,39,0.04), 0 12px 32px -16px rgba(16,19,39,0.14)",
        lift: "0 1px 2px rgba(16,19,39,0.06), 0 4px 12px -4px rgba(16,19,39,0.10)",
        brand: "0 8px 20px -8px rgba(91,76,245,0.55)",
      },
      backdropBlur: {
        frost: "24px",
        surface: "16px",
        control: "8px",
      },
      borderRadius: {
        panel: "20px",
        sheet: "16px",
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
