"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onIdTokenChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";
import { getFirebaseClient } from "./client";
import { configurationProblemFromError, dataModeProblem, type DataModeProblem } from "./data-mode";
import { useStore } from "@/lib/store";
import { gateSession, verificationCooldownRemaining, type ConsoleRole } from "@/lib/console/capabilities";
import type { RoleId } from "@/lib/types";

/**
 * - ready            verified, active, platform-owner | super-admin | auditor
 * - unverified       signed in but email_verified=false (server refuses every call)
 * - disabled         disabled/suspended by a platform owner (claims.disabled)
 * - no-role          verified, active, no roleId claim
 * - forbidden        verified, active, a role the console does not support
 */
type SessionState = "loading" | "signed-out" | "ready" | "unverified" | "disabled" | "no-role" | "forbidden" | "error" | "misconfigured";

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
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  /** Sends the Firebase verification email (client-throttled). */
  sendVerification(): Promise<VerificationEmailResult>;
  /** Reloads the user and force-refreshes the ID token so new claims / email_verified take effect. */
  refreshSession(): Promise<void>;
}

const Context = createContext<AdminSession | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const prototypeStore = useStore();
  const [state, setState] = useState<SessionState>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [consoleRole, setConsoleRole] = useState<ConsoleRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configProblem, setConfigProblem] = useState<DataModeProblem | null>(null);
  const lastVerificationSentAt = useRef<number | null>(null);

  const evaluate = useCallback(async (nextUser: User, forceRefresh: boolean) => {
    // Never force a refresh from inside onIdTokenChanged: a forced refresh
    // notifies the same listener again and loops. Forced refreshes happen only
    // on an explicit refreshSession().
    const token = await nextUser.getIdTokenResult(forceRefresh);
    // The server trusts the token's email_verified claim (requireActor), so the console does too.
    const gate = gateSession({ emailVerified: token.claims.email_verified === true, claims: token.claims });
    const raw = String(token.claims.roleId ?? token.claims.role ?? "") || null;
    setRoleId(raw);
    setConsoleRole(gate.state === "ready" ? gate.role : null);
    if (gate.state === "ready") {
      prototypeStore.signIn("op-1", gate.role as RoleId);
      setState("ready");
      return;
    }
    setState(gate.state === "unsupported-role" ? "forbidden" : gate.state);
    // Store methods are stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          prototypeStore.signOut();
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
    // Store methods are stable callbacks; subscribing once avoids auth listener churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const problem = dataModeProblem(process.env.NEXT_PUBLIC_DATA_MODE);
    if (problem) throw new Error(problem.message);
    await signInWithEmailAndPassword(getFirebaseClient().auth, email.trim(), password);
  }, []);
  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseClient().auth);
    prototypeStore.signOut();
  }, [prototypeStore]);
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
    () => ({ state, configProblem, user, roleId, consoleRole, error, signIn, signOut, resetPassword, sendVerification, refreshSession }),
    [state, configProblem, user, roleId, consoleRole, error, signIn, signOut, resetPassword, sendVerification, refreshSession],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAdminSession(): AdminSession {
  const value = useContext(Context);
  if (!value) throw new Error("useAdminSession must be used inside AdminAuthProvider.");
  return value;
}
