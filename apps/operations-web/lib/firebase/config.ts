/**
 * firebase/config.ts
 *
 * Reads Firebase configuration from environment variables.
 * Used only when NEXT_PUBLIC_DATA_MODE=firebase-emulator or firebase-live.
 * Never imported during prototype mode.
 *
 * IMPORTANT: every variable is read with a STATIC `process.env.NEXT_PUBLIC_*`
 * expression. Next.js inlines only static references into the browser bundle;
 * a dynamic lookup (process.env indexed by a computed key) is always undefined in the
 * browser, which made the console fail with "configuration is incomplete"
 * even when every variable was set (see tests/unit/firebase-config.test.ts).
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/** Static references — do not replace with a loop over key names. */
export function readFirebaseEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function requireEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(
      `[Firebase] Required environment variable "${key}" is missing or empty. ` +
        `Ensure your .env.local (local) or build environment (deployed) sets it.`
    );
  }
  return value;
}

/**
 * Returns the Firebase client configuration object.
 * Throws immediately if any required variable is absent.
 */
export function getFirebaseConfig(env: Record<string, string | undefined> = readFirebaseEnv()): FirebaseConfig {
  return {
    apiKey: requireEnv(env, "NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requireEnv(env, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requireEnv(env, "NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: requireEnv(env, "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: requireEnv(env, "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: requireEnv(env, "NEXT_PUBLIC_FIREBASE_APP_ID"),
  };
}
