#!/usr/bin/env node
/**
 * Release guardrails: fails (exit 1) if the repository tracks credentials,
 * signing material, real environment files, or configuration that could let
 * one environment reach another. Runs locally and in CI; no dependencies.
 *
 *   node scripts/check-release-guardrails.mjs
 *
 * Complements gitleaks (history scan) with project-specific rules.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const problems = [];
const fail = (file, why) => problems.push(`${file}: ${why}`);

// 1. Files that must never be committed (examples/templates are fine).
const FORBIDDEN_FILES = [
  [/(^|\/)google-services\.json$/, "Firebase Android config comes from the owner's console per environment"],
  [/(^|\/)GoogleService-Info\.plist$/, "Firebase iOS config comes from the owner's console per environment"],
  [/(^|\/)key\.properties$/, "Android signing credentials"],
  [/\.(jks|keystore|p12|p8|mobileprovision|pem|key)$/i, "signing key / certificate material"],
  [/(^|\/)\.env(\.[\w-]+)?$/, "real environment file (commit a *.example instead)"],
  [/(^|\/)(service-?account|credentials|adc)[\w.-]*\.json$/i, "service-account credentials"],
  [/(^|\/)\.runtimeconfig\.json$/, "functions runtime config may contain secrets"],
  [/(^|\/)\.secret\.local$/, "local functions secrets"],
];
for (const f of tracked) {
  if (/\.example$|\.template$/.test(f)) continue;
  for (const [re, why] of FORBIDDEN_FILES) if (re.test(f)) fail(f, `must not be committed (${why})`);
}

// 2. Secret-looking content in tracked text files.
const SECRET_PATTERNS = [
  [/-----BEGIN (RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/, "private key"],
  [/rzp_live_[A-Za-z0-9]{8,}/, "Razorpay LIVE key id"],
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, "GitHub token"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/AIza[0-9A-Za-z_-]{35}/, "Google API key (pass via --dart-define / env, never hardcode)"],
  [/"private_key_id"\s*:/, "service-account JSON"],
];
const SKIP_DIRS = /(^|\/)(node_modules|build|\.next|\.dart_tool|coverage)\//;
const BINARY = /\.(png|jpe?g|gif|webp|ico|ttf|otf|woff2?|pdf|zip|jar|lock)$/i;
for (const f of tracked) {
  if (SKIP_DIRS.test(f) || BINARY.test(f) || !existsSync(f)) continue;
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  if (text.length > 2_000_000) continue;
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) fail(f, `contains what looks like a ${what}`);
}

// 3. Firebase project aliases: demo-* only for development; staging and
//    production must be distinct real ids that can't be mistaken for each other.
if (existsSync(".firebaserc")) {
  const projects = JSON.parse(readFileSync(".firebaserc", "utf8")).projects ?? {};
  const nonProd = /(stag|dev|test)/i;
  for (const [alias, id] of Object.entries(projects)) {
    if (alias === "development" || alias === "default") {
      if (!String(id).startsWith("demo-")) fail(".firebaserc", `"${alias}" must be an offline demo-* project, got "${id}"`);
    } else if (alias === "staging") {
      if (String(id).startsWith("demo-") || !nonProd.test(id)) fail(".firebaserc", `staging id "${id}" must be real and contain staging/dev/test`);
    } else if (alias === "production") {
      if (String(id).startsWith("demo-") || nonProd.test(id)) fail(".firebaserc", `production id "${id}" looks like a non-production project`);
    } else {
      fail(".firebaserc", `unknown alias "${alias}" (allowed: development, staging, production)`);
    }
  }
  if (projects.staging && projects.staging === projects.production) fail(".firebaserc", "staging and production point at the same project");
}

// 4. Debug switches that must never reach a production build script.
const SELF = "scripts/check-release-guardrails.mjs";
for (const f of tracked.filter((p) => /\.(sh|ya?ml|json|mjs|md)$/.test(p) && !SKIP_DIRS.test(p) && p !== SELF)) {
  const text = readFileSync(f, "utf8");
  for (const line of text.split("\n")) {
    if (/PULSE_ENV=production/.test(line) && /APP_CHECK_DEBUG=true/.test(line)) fail(f, "production build line enables APP_CHECK_DEBUG");
  }
}

if (problems.length) {
  console.error(`Release guardrails FAILED (${problems.length}):\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`Release guardrails passed (${tracked.length} tracked files checked).`);
