/**
 * firebase/app-check.ts
 *
 * App Check boundary — PR-0B placeholder only.
 *
 * App Check is NOT initialized in emulator mode or prototype mode.
 * This file documents the future integration point without activating anything.
 *
 * Rules for future phases:
 * - Never call initializeAppCheck() until a real reCAPTCHA site key is configured.
 * - Never use a debug/fake provider in production code.
 * - App Check must not be initialized in firebase-emulator mode (emulators bypass it).
 * - In firebase-live mode, App Check will be mandatory before launch.
 *
 * DO NOT add any implementation to this file until the App Check phase is approved.
 */

export const APP_CHECK_INITIALIZED = false;

// Future integration point — do not implement yet.
// export function initializeFirebaseAppCheck(app: FirebaseApp): AppCheck { ... }
