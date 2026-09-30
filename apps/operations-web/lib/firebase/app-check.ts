/**
 * firebase/app-check.ts
 *
 * App Check (reCAPTCHA Enterprise) for firebase-live builds.
 *
 * - Called only from client.ts in firebase-live mode; never in firebase-emulator
 *   mode (emulators do not enforce App Check and the callables skip it there).
 * - Fails closed: no site key → the console refuses to initialize Firebase
 *   (and scripts/verify-production-env.mjs refuses the build).
 * - No debug provider is ever installed; the backend callables run with
 *   enforceAppCheck outside the emulator, so an unattested console cannot act.
 * - The site key is public; restrict its allowed domains in reCAPTCHA
 *   Enterprise to the console's domain(s) and register it for the web app in
 *   Firebase Console → App Check.
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
