/** Friendly copy for Firebase Auth failures. Never show the SDK's raw "Firebase: Error (auth/…)" text. */
export function authErrorCode(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) return String((error as { code: unknown }).code);
  return "";
}

export function friendlyAuthError(error: unknown): string {
  const code = authErrorCode(error);
  if (code === "auth/wrong-password" || code === "auth/invalid-credential" || code === "auth/user-not-found") {
    return "That email and password don't match. Try again or reset your password.";
  }
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a minute, then try again.";
  if (code === "auth/network-request-failed") return "Can't reach the sign-in service. Check your connection.";
  if (code === "auth/user-disabled") return "This operator account is disabled. Ask a platform owner.";
  if (code === "auth/invalid-email") return "That doesn't look like an email address.";
  return "Sign-in didn't work. Try again.";
}
