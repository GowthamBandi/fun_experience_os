/**
 * Fails a deployed (staging/production) console build before `next build`
 * when its environment is incomplete or points at the wrong Firebase project.
 *
 *   npm run build:production        (runs this, then next build)
 *
 * Checks:
 *   - NEXT_PUBLIC_DATA_MODE=firebase-live
 *   - NEXT_PUBLIC_APP_ENV is "staging" or "production"
 *   - every Firebase web config value + reCAPTCHA Enterprise site key is present
 *     and is not a template placeholder
 *   - the project id is not a demo-* project and matches the declared env:
 *       production → must NOT look like staging/dev/test/qa/demo
 *       staging    → MUST contain staging|stage|stg
 *   - EXPECTED_FIREBASE_PROJECT_ID (optional, set per CI environment) equals the project id exactly
 *   - authDomain / storageBucket, when on Firebase-owned domains, belong to the same project
 *   - the archived prototype flag is not enabled
 *
 * Pure `checkProductionEnv(env)` is exported for tests/unit/verify-production-env.test.ts.
 */
import { pathToFileURL } from "node:url";

export const REQUIRED_VARS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY",
];

const PLACEHOLDER = /(REPLACE|CHANGE[_-]?ME|YOUR[_-]|<[^>]*>|\.\.\.|xxxx|placeholder|^demo-key$|^000000000000$|:web:demo$)/i;
const NON_PROD_PROJECT = /(^|[-_])(staging|stage|stg|dev|development|test|testing|qa|sandbox|demo)([-_]|$)/i;
const STAGING_PROJECT = /(^|[-_])(staging|stage|stg)([-_]|$)/i;

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ errors: string[], warnings: string[], appEnv: string | null, projectId: string | null }}
 */
export function checkProductionEnv(env) {
  const errors = [];
  const warnings = [];
  const get = (key) => (env[key] ?? "").trim();

  if (get("NEXT_PUBLIC_DATA_MODE") !== "firebase-live") {
    errors.push("NEXT_PUBLIC_DATA_MODE must be firebase-live for a deployed (staging/production) build.");
  }

  const appEnv = get("NEXT_PUBLIC_APP_ENV").toLowerCase();
  if (appEnv !== "staging" && appEnv !== "production") {
    errors.push('NEXT_PUBLIC_APP_ENV must be "staging" or "production" (it drives the environment badge and the project-id cross-check).');
  }

  const missing = REQUIRED_VARS.filter((key) => !get(key));
  if (missing.length) errors.push(`Missing production environment variables: ${missing.join(", ")}`);

  const placeholders = REQUIRED_VARS.filter((key) => get(key) && PLACEHOLDER.test(get(key)));
  if (placeholders.length) errors.push(`These variables still hold template/placeholder values: ${placeholders.join(", ")}`);

  const projectId = get("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (projectId) {
    if (projectId.startsWith("demo-")) errors.push("A demo Firebase project cannot be used for a deployed build.");
    if (appEnv === "production" && NON_PROD_PROJECT.test(projectId)) {
      errors.push(`NEXT_PUBLIC_APP_ENV=production but the project id "${projectId}" looks like a non-production project.`);
    }
    if (appEnv === "staging" && !STAGING_PROJECT.test(projectId)) {
      errors.push(`NEXT_PUBLIC_APP_ENV=staging but the project id "${projectId}" does not contain staging/stage/stg. Staging must never point at production.`);
    }
    const expected = get("EXPECTED_FIREBASE_PROJECT_ID");
    if (expected && expected !== projectId) {
      errors.push(`EXPECTED_FIREBASE_PROJECT_ID is "${expected}" but NEXT_PUBLIC_FIREBASE_PROJECT_ID is "${projectId}".`);
    }
    if (!expected) warnings.push("EXPECTED_FIREBASE_PROJECT_ID is not set; set it per CI/hosting environment for an exact project-id check.");

    const authDomain = get("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
    const firebaseAuthHost = authDomain.match(/^([a-z0-9-]+)\.(firebaseapp\.com|web\.app)$/i);
    if (firebaseAuthHost && firebaseAuthHost[1] !== projectId) {
      errors.push(`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN (${authDomain}) belongs to a different project than ${projectId}.`);
    }
    const bucket = get("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
    const firebaseBucket = bucket.match(/^([a-z0-9-]+)\.(appspot\.com|firebasestorage\.app)$/i);
    if (firebaseBucket && firebaseBucket[1] !== projectId) {
      errors.push(`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET (${bucket}) belongs to a different project than ${projectId}.`);
    }
  }

  if (get("NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE") === "true") {
    errors.push("NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE must not be true in a deployed build (ADR-0006).");
  }

  return { errors, warnings, appEnv: appEnv || null, projectId: projectId || null };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { errors, warnings, appEnv, projectId } = checkProductionEnv(process.env);
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`error: ${error}`);
    process.exit(1);
  }
  console.log(`Production environment configuration is present (${appEnv} → ${projectId}).`);
}
