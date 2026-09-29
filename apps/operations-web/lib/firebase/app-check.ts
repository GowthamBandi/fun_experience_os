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

import type { FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";

let instance: AppCheck | null = null;

export function initializeFirebaseAppCheck(app: FirebaseApp): AppCheck {
  if (instance) return instance;
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
  if (!siteKey) throw new Error("[Firebase] NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY is required in live mode.");
  instance = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return instance;
}
