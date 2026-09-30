/**
 * Which environment this console build talks to — shown as a badge in the
 * console header and on the sign-in screen so operators always know whether
 * they are acting on staging or production.
 *
 * NEXT_PUBLIC_APP_ENV declares the environment for firebase-live builds
 * ("staging" | "production"); scripts/verify-production-env.mjs refuses a
 * live build without it and cross-checks it against the project id.
 */

export type AppEnvironmentId = "emulator" | "staging" | "production" | "undeclared" | "unconfigured";

export interface AppEnvironment {
  id: AppEnvironmentId;
  label: string;
  /** Visual tone: production is deliberately loud (red) so it is never mistaken for staging. */
  tone: "danger" | "warn" | "info" | "neutral";
  projectId: string | null;
}

export function resolveAppEnvironment(input: {
  dataMode: string | undefined;
  appEnv: string | undefined;
  projectId: string | undefined;
}): AppEnvironment {
  const projectId = input.projectId?.trim() || null;
  if (input.dataMode === "firebase-emulator") return { id: "emulator", label: "Local emulator", tone: "info", projectId };
  if (input.dataMode !== "firebase-live") return { id: "unconfigured", label: "Not configured", tone: "neutral", projectId };
  const appEnv = input.appEnv?.trim().toLowerCase();
  if (appEnv === "production") return { id: "production", label: "Production", tone: "danger", projectId };
  if (appEnv === "staging") return { id: "staging", label: "Staging", tone: "warn", projectId };
  return { id: "undeclared", label: "Live · environment not declared", tone: "warn", projectId };
}

/** Static references so Next.js inlines them into the browser bundle. */
export function currentAppEnvironment(): AppEnvironment {
  return resolveAppEnvironment({
    dataMode: process.env.NEXT_PUBLIC_DATA_MODE,
    appEnv: process.env.NEXT_PUBLIC_APP_ENV,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}
