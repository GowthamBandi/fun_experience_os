/**
 * The ID-token `firebase` claim of a console operator who signed in with the
 * authenticator-app code (TOTP). @firebase/rules-unit-testing's types don't
 * list sign_in_second_factor yet, hence the cast; the token carries it as is.
 */
export const TOTP_SIGN_IN = { sign_in_provider: "password", sign_in_second_factor: "totp" } as { sign_in_provider: "password" };
