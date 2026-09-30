"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onIdTokenChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";
import { getFirebaseClient } from "./client";
import { configurationProblemFromError, dataModeProblem, type DataModeProblem } from "./data-mode";
import { useStore } from "@/lib/store";
import type { RoleId } from "@/lib/types";

type SessionState = "loading" | "signed-out" | "ready" | "forbidden" | "error" | "misconfigured";
interface AdminSession {
  state: SessionState;
  /** Set when state === "misconfigured": an actionable configuration message. Never falls back to fake auth. */
  configProblem: DataModeProblem | null;
  user: User | null;
  roleId: string | null;
  error: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
}

const Context = createContext<AdminSession | null>(null);
const ALLOWED = new Set(["platform-owner", "super-admin"]);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const prototypeStore = useStore();
  const [state, setState] = useState<SessionState>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configProblem, setConfigProblem] = useState<DataModeProblem | null>(null);

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
          prototypeStore.signOut();
          setState("signed-out");
          return;
        }
        const token = await nextUser.getIdTokenResult(true);
        const role = String(token.claims.roleId ?? token.claims.role ?? "");
        const disabled = token.claims.disabled === true;
        if (!nextUser.emailVerified || disabled || !ALLOWED.has(role)) {
          setRoleId(role || null);
          setState("forbidden");
          return;
        }
        setRoleId(role);
        prototypeStore.signIn("op-1", role as RoleId);
        setState("ready");
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

  const value = useMemo(() => ({ state, configProblem, user, roleId, error, signIn, signOut, resetPassword }), [state, configProblem, user, roleId, error, signIn, signOut, resetPassword]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAdminSession(): AdminSession {
  const value = useContext(Context);
  if (!value) throw new Error("useAdminSession must be used inside AdminAuthProvider.");
  return value;
}
