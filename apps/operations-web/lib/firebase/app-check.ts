/**
 * firebase/app-check.ts — App Check for firebase-live mode.
 *
 * Initialised only in firebase-live mode (emulators bypass App Check). Requires
 * NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY; never uses a debug provider.
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
