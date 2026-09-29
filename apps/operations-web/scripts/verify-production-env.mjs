const required = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY",
];

const missing = required.filter((key) => !process.env[key]?.trim());
if (process.env.NEXT_PUBLIC_DATA_MODE !== "firebase-live") {
  console.error("NEXT_PUBLIC_DATA_MODE must be firebase-live for a production build.");
  process.exit(1);
}
if (missing.length) {
  console.error(`Missing production environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.startsWith("demo-")) {
  console.error("A demo Firebase project cannot be used for a production build.");
  process.exit(1);
}
console.log("Production environment configuration is present.");
