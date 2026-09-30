/**
 * Pure data-mode diagnostics (no Firebase imports) so the login screen can
 * explain a misconfiguration instead of failing generically. The console is
 * fail-closed: it never falls back to a fake/prototype sign-in.
 */

export const SUPPORTED_DATA_MODES = ["firebase-emulator", "firebase-live"] as const;
export type ConsoleDataMode = (typeof SUPPORTED_DATA_MODES)[number];

export const DATA_MODE_REQUIRED_MESSAGE =
  "Console requires NEXT_PUBLIC_DATA_MODE=firebase-emulator (local) or firebase-live";

export interface DataModeProblem {
  title: string;
  message: string;
  steps: string[];
}

/** Returns null when the raw NEXT_PUBLIC_DATA_MODE value can run the console. */
export function dataModeProblem(raw: string | undefined): DataModeProblem | null {
  if (raw === "firebase-emulator" || raw === "firebase-live") return null;
  const current = raw === undefined || raw === "" ? "unset" : raw === "prototype" ? "prototype" : `"${raw}" (not recognized)`;
  return {
    title: "Console is not configured",
    message: `${DATA_MODE_REQUIRED_MESSAGE}. NEXT_PUBLIC_DATA_MODE is currently ${current}.`,
    steps: [
      "Local: copy .env.example to .env.local (it sets NEXT_PUBLIC_DATA_MODE=firebase-emulator and the demo-experience-os project), start the Firebase emulators, then restart `next dev`.",
      "Deployed: set NEXT_PUBLIC_DATA_MODE=firebase-live with the real Firebase and reCAPTCHA Enterprise values, and build with `npm run build:production`.",
      "The old prototype mode is archived and cannot sign in to the governance console.",
    ],
  };
}

/** Classifies an initialization error thrown by getFirebaseClient() as a configuration problem. */
export function configurationProblemFromError(message: string): DataModeProblem | null {
  if (!/\[Firebase|FAIL CLOSED|environment variable|NEXT_PUBLIC_/i.test(message)) return null;
  return {
    title: "Firebase configuration is incomplete",
    message,
    steps: [
      "Check .env.local against .env.example and restart the dev server (NEXT_PUBLIC_* values are inlined at build time).",
    ],
  };
}
