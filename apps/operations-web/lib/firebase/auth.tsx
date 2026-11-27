"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getMultiFactorResolver,
  multiFactor,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from "firebase/auth";
import { getFirebaseClient } from "./client";
import { configurationProblemFromError, dataModeProblem, type DataModeProblem } from "./data-mode";
import { gateSession, operatorSecondFactor, verificationCooldownRemaining, type ConsoleRole } from "@/lib/console/capabilities";
import { authErrorCode } from "@/lib/console/auth-errors";

/**
 * - ready            verified, active, platform-owner | super-admin | auditor
 * - unverified       signed in but email_verified=false (server refuses every call)
 * - disabled         disabled/suspended by a platform owner (claims.disabled)
 * - no-role          verified, active, no roleId claim
 * - forbidden        verified, active, a role the console does not support
 * - enroll-second-factor    console role, authenticator app not set up yet (one-time setup)
 * - second-factor-required  authenticator app set up, but this session didn't use it: sign in again
 */
type SessionState =
  | "loading" | "signed-out" | "ready" | "unverified" | "disabled" | "no-role" | "forbidden" | "error" | "misconfigured"
  | "enroll-second-factor" | "second-factor-required";

/** Thrown by signIn when the password was right and the authenticator-app code is needed next. */
export class SecondStepNeeded extends Error {
  constructor() {
    super("Enter the 6-digit code from your authenticator app.");
    this.name = "SecondStepNeeded";
  }
}

export interface AuthenticatorSetup {
  /** The key to type into the authenticator app ("Enter a setup key"). */
  secretKey: string;
  /** otpauth:// link: opens the authenticator app on a phone. */
  link: string;
}

export interface VerificationEmailResult {
  ok: boolean;
  message: string;
}

interface AdminSession {
  state: SessionState;
  /** Set when state === "misconfigured": an actionable configuration message. Never falls back to fake auth. */
  configProblem: DataModeProblem | null;
  user: User | null;
  /** Raw role claim (may be unsupported). */
  roleId: string | null;
  /** Supported console role, or null. Use with can() from lib/console/capabilities. */
  consoleRole: ConsoleRole | null;
  error: string | null;
  /** Throws SecondStepNeeded when the account has an authenticator app: then call completeSignIn(code). */
  signIn(email: string, password: string): Promise<void>;
  completeSignIn(code: string): Promise<void>;
  /** One-time authenticator-app setup for a signed-in operator. */
  startAuthenticatorSetup(): Promise<AuthenticatorSetup>;
  /** Confirms the setup with a code from the app, then signs out: the next sign-in uses the code. */
  finishAuthenticatorSetup(code: string): Promise<void>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  /** Sends the Firebase verification email (client-throttled). */
  sendVerification(): Promise<VerificationEmailResult>;
  /** Reloads the user and force-refreshes the ID token so new claims / email_verified take effect. */
  refreshSession(): Promise<void>;
}

const Context = createContext<AdminSession | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [consoleRole, setConsoleRole] = useState<ConsoleRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configProblem, setConfigProblem] = useState<DataModeProblem | null>(null);
  const lastVerificationSentAt = useRef<number | null>(null);
  const resolver = useRef<MultiFactorResolver | null>(null);
  const pendingSecret = useRef<TotpSecret | null>(null);

  const evaluate = useCallback(async (nextUser: User, forceRefresh: boolean) => {
    // Never force a refresh from inside onIdTokenChanged: a forced refresh
    // notifies the same listener again and loops. Forced refreshes happen only
    // on an explicit refreshSession().
    const token = await nextUser.getIdTokenResult(forceRefresh);
    // The server trusts the token's email_verified claim (requireActor), so the console does too.
    const emulated = process.env.NEXT_PUBLIC_DATA_MODE === "firebase-emulator";
    const secondFactor = operatorSecondFactor({
      claims: token.claims,
      email: nextUser.email,
      enrolledFactorIds: multiFactor(nextUser).enrolledFactors.map((f) => f.factorId),
      emulatorProjectId: emulated ? (getFirebaseClient().auth.app.options.projectId ?? null) : null,
    });
    const gate = gateSession({ emailVerified: token.claims.email_verified === true, claims: token.claims, secondFactor });
    const raw = String(token.claims.roleId ?? token.claims.role ?? "") || null;
    setRoleId(raw);
    setConsoleRole(gate.state === "ready" ? gate.role : null);
    if (gate.state === "ready") {
      setState("ready");
      return;
    }
    setState(gate.state === "unsupported-role" ? "forbidden" : gate.state);
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    // Fail closed with an explicit, actionable message when the data mode can't run the console.
    const modeProblem = dataModeProblem(process.env.NEXT_PUBLIC_DATA_MODE);
    if (modeProblem) {
      setConfigProblem(modeProblem);
      setState("misconfigured");
      return unsubscribe;
    }
    try {
      const { auth } = getFirebaseClient();
      unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
        setUser(nextUser);
        setError(null);
        if (!nextUser) {
          setRoleId(null);
          setConsoleRole(null);
          setState("signed-out");
          return;
        }
        try {
          await evaluate(nextUser, false);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Your session could not be verified.");
          setState("error");
        }
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Firebase could not be initialized.";
      const problem = configurationProblemFromError(message);
      if (problem) {
        setConfigProblem(problem);
        setState("misconfigured");
      } else {
        setError(message);
        setState("error");
      }
    }
    return unsubscribe;
    // Subscribe once to avoid auth listener churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const problem = dataModeProblem(process.env.NEXT_PUBLIC_DATA_MODE);
    if (problem) throw new Error(problem.message);
    resolver.current = null;
    try {
      await signInWithEmailAndPassword(getFirebaseClient().auth, email.trim(), password);
    } catch (cause) {
      if (authErrorCode(cause) !== "auth/multi-factor-auth-required") throw cause;
      resolver.current = getMultiFactorResolver(getFirebaseClient().auth, cause as MultiFactorError);
      throw new SecondStepNeeded();
    }
  }, []);
  const completeSignIn = useCallback(async (code: string) => {
    const r = resolver.current;
    if (!r) throw new Error("Start again: enter your email and password.");
    const hint = r.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!hint) throw Object.assign(new Error("No authenticator app on this account."), { code: "auth/operation-not-allowed" });
    await r.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.replace(/\s/g, "")));
    resolver.current = null;
  }, []);
  const startAuthenticatorSetup = useCallback(async (): Promise<AuthenticatorSetup> => {
    const current = getFirebaseClient().auth.currentUser;
    if (!current) throw new Error("Sign in again to set up your authenticator app.");
    const secret = await TotpMultiFactorGenerator.generateSecret(await multiFactor(current).getSession());
    pendingSecret.current = secret;
    return { secretKey: secret.secretKey, link: secret.generateQrCodeUrl(current.email ?? "operator", "PULSE Console") };
  }, []);
  const finishAuthenticatorSetup = useCallback(async (code: string) => {
    const current = getFirebaseClient().auth.currentUser;
    const secret = pendingSecret.current;
    if (!current || !secret) throw new Error("Start the setup again.");
    await multiFactor(current).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code.replace(/\s/g, "")), "Authenticator app");
    pendingSecret.current = null;
    // This session was opened with the password only: the next sign-in uses the code.
    await firebaseSignOut(getFirebaseClient().auth);
  }, []);
  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseClient().auth);
  }, []);
  const resetPassword = useCallback(async (email: string) => sendPasswordResetEmail(getFirebaseClient().auth, email.trim()), []);

  const sendVerification = useCallback(async (): Promise<VerificationEmailResult> => {
    const current = getFirebaseClient().auth.currentUser;
    if (!current) return { ok: false, message: "Sign in again, then request the verification email." };
    const wait = verificationCooldownRemaining(lastVerificationSentAt.current, Date.now());
    if (wait > 0) return { ok: false, message: `A verification email was just sent. You can request another in ${Math.ceil(wait / 1000)} s.` };
    try {
      await sendEmailVerification(current);
      lastVerificationSentAt.current = Date.now();
      return { ok: true, message: `Verification email sent to ${current.email ?? "your address"}. Open the link, then choose “I've verified — continue”.` };
    } catch (cause) {
      const code = typeof cause === "object" && cause && "code" in cause ? String((cause as { code: unknown }).code) : "";
      if (code.includes("too-many-requests")) {
        lastVerificationSentAt.current = Date.now();
        return { ok: false, message: "Too many verification emails were requested. Wait a few minutes and try again." };
      }
      return { ok: false, message: "The verification email could not be sent. Check your connection and try again." };
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const current = getFirebaseClient().auth.currentUser;
    if (!current) return;
    await current.reload();
    await evaluate(current, true);
  }, [evaluate]);

  const value = useMemo(
    () => ({
      state, configProblem, user, roleId, consoleRole, error, signIn, completeSignIn, startAuthenticatorSetup, finishAuthenticatorSetup,
      signOut, resetPassword, sendVerification, refreshSession,
    }),
    [
      state, configProblem, user, roleId, consoleRole, error, signIn, completeSignIn, startAuthenticatorSetup, finishAuthenticatorSetup,
      signOut, resetPassword, sendVerification, refreshSession,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAdminSession(): AdminSession {
  const value = useContext(Context);
  if (!value) throw new Error("useAdminSession must be used inside AdminAuthProvider.");
  return value;
}
