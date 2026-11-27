/** Friendly copy for Firebase Auth failures. Never show the SDK's raw "Firebase: Error (auth/…)" text. */
export function authErrorCode(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) return String((error as { code: unknown }).code);
  return "";
}

export function friendlyAuthError(error: unknown, fallback = "Sign-in didn't work. Try again."): string {
  const code = authErrorCode(error);
  if (code === "auth/wrong-password" || code === "auth/invalid-credential" || code === "auth/user-not-found") {
    return "That email and password don't match. Try again or reset your password.";
  }
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a minute, then try again.";
  if (code === "auth/network-request-failed") return "Can't reach the sign-in service. Check your connection.";
  if (code === "auth/user-disabled") return "This operator account is disabled. Ask a platform owner.";
  if (code === "auth/invalid-email") return "That doesn't look like an email address.";
  if (code === "auth/invalid-verification-code") return "That code didn't match. Enter the current 6-digit code from your authenticator app.";
  if (code === "auth/missing-code") return "Enter the 6-digit code from your authenticator app.";
  if (code === "auth/code-expired") return "That code expired. Enter the newest code from your authenticator app.";
  if (code === "auth/requires-recent-login") return "For your safety this needs a fresh sign-in. Sign out, sign in again, then try once more.";
  if (code === "auth/operation-not-allowed") return "Authenticator-app sign-in isn't switched on for this project yet. Ask a platform owner.";
  return fallback;
}
