/**
 * firebase/config.ts
 *
 * Reads Firebase configuration from environment variables.
 * Used only when NEXT_PUBLIC_DATA_MODE=firebase-emulator (or firebase-live, which is blocked in PR-0B).
 * Never imported during prototype mode.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[Firebase] Required environment variable "${key}" is missing or empty. ` +
        `Ensure your .env.local is configured for firebase-emulator mode.`
    );
  }
  return value;
}

/**
 * Returns the Firebase client configuration object.
 * Throws immediately if any required variable is absent.
 */
export function getFirebaseConfig(): FirebaseConfig {
  return {
    apiKey: requireEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requireEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requireEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: requireEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: requireEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: requireEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
  };
}
