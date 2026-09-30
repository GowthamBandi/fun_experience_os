/**
 * HTTP security headers for the Operations Console (used by next.config.mjs).
 * Pure and dependency-free so tests/unit/security-headers.test.ts can check it.
 *
 * The CSP allows exactly what the console needs:
 *   - Firebase Auth         identitytoolkit / securetoken / www.googleapis.com
 *   - Firestore             firestore.googleapis.com (WebChannel over HTTPS)
 *   - Callables             <region>-<project>.cloudfunctions.net (v1) and *.run.app (v2)
 *   - App Check             content-firebaseappcheck.googleapis.com + reCAPTCHA Enterprise
 *                           (www.google.com/recaptcha, www.gstatic.com/recaptcha, recaptcha iframes)
 *   - Auth helper iframe    *.firebaseapp.com / *.web.app (and a custom auth domain if configured)
 *
 * 'unsafe-inline' for scripts is required by Next.js App Router hydration
 * without a per-request nonce (which would force every page to render
 * dynamically). Everything else is locked to 'self' or an explicit host.
 */

const FIREBASE_CONNECT = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://www.googleapis.com",
  "https://firestore.googleapis.com",
  "https://firebaseinstallations.googleapis.com",
  "https://content-firebaseappcheck.googleapis.com",
  "https://*.cloudfunctions.net",
  "https://*.run.app",
  "https://www.google.com/recaptcha/",
];

const RECAPTCHA_SCRIPT = ["https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"];
const RECAPTCHA_FRAME = ["https://www.google.com/recaptcha/", "https://recaptcha.google.com/recaptcha/"];

// firebase.json emulator ports (auth 9099, firestore 8080, functions 5001).
const EMULATOR_CONNECT = ["http://127.0.0.1:9099", "http://127.0.0.1:8080", "http://127.0.0.1:5001", "http://localhost:9099", "http://localhost:8080", "http://localhost:5001"];

function authDomainOrigin(authDomain) {
  const host = (authDomain ?? "").trim();
  if (!host || !/^[a-z0-9.-]+$/i.test(host)) return [];
  if (/\.(firebaseapp\.com|web\.app)$/i.test(host)) return []; // already covered by the wildcards
  return [`https://${host}`];
}

/**
 * @param {{ dataMode?: string, authDomain?: string, dev?: boolean }} options
 * @returns {string}
 */
export function buildContentSecurityPolicy({ dataMode, authDomain, dev = false } = {}) {
  const emulator = dataMode === "firebase-emulator";
  const live = dataMode === "firebase-live";
  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...RECAPTCHA_SCRIPT],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://www.gstatic.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...FIREBASE_CONNECT, ...(emulator ? EMULATOR_CONNECT : []), ...(dev ? ["ws:", "wss:"] : [])],
    "frame-src": ["'self'", ...RECAPTCHA_FRAME, "https://*.firebaseapp.com", "https://*.web.app", ...authDomainOrigin(authDomain)],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  // Only for deployed (HTTPS) builds: upgrading on http://127.0.0.1 would break local runs and the smoke test.
  if (live && !dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/**
 * @param {{ dataMode?: string, authDomain?: string, dev?: boolean }} options
 * @returns {{ key: string, value: string }[]}
 */
export function securityHeaders(options = {}) {
  const live = options.dataMode === "firebase-live" && !options.dev;
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()" },
    // Firebase Auth popups/redirect helpers need to talk back to the opener.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    ...(live ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
  ];
}
