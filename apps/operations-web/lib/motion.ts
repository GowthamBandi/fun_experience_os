import type { Variants } from "framer-motion";

/** The signature curve — fast start, long settle. Everything arrives. */
export const LIGHT_EASE = [0.19, 1, 0.22, 1] as const;

export const DURATION = {
  tick: 0.12,
  micro: 0.2,
  surface: 0.32,
  scene: 0.48,
  bloom: 0.9,
} as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.surface, ease: LIGHT_EASE } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.micro, ease: "easeOut" } },
};

export const panelIn: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.99 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.scene, ease: LIGHT_EASE } },
};

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

export const barIgnite: Variants = {
  hidden: { opacity: 0, scaleX: 0, transformOrigin: "left" },
  visible: (i: number) => ({
    opacity: 1,
    scaleX: 1,
    transition: { duration: 0.28, ease: LIGHT_EASE, delay: 0.12 * i },
  }),
};

export const exitUp: Variants = {
  hidden: { opacity: 1 },
  exit: { opacity: 0, y: -12, transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } },
};
