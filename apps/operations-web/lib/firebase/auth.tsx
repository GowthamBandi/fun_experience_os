"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { resolveDataMode, type DataMode } from "./mode";
import { useStore } from "@/lib/store";
import type { RoleId } from "@/lib/types";

type SessionState = "loading" | "signed-out" | "ready" | "forbidden" | "error";

interface AdminSession {
  mode: DataMode;
  state: SessionState;
  user: User | null;
  roleId: string | null;
  error: string | null;
  /** Firebase modes: email + password. */
  signIn(email: string, password: string): Promise<void>;
  /** Local workspace mode: sign in as an operator account from the workspace directory. */
  signInLocal(operatorId: string): void;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
}

const Context = createContext<AdminSession | null>(null);
const FIREBASE_ALLOWED = new Set(["platform-owner", "super-admin"]);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const mode = resolveDataMode();
  return mode === "prototype" ? <LocalAuthProvider>{children}</LocalAuthProvider> : <FirebaseAuthProvider mode={mode}>{children}</FirebaseAuthProvider>;
}

/* ------------------------------ local workspace ------------------------------ */

function LocalAuthProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const [error, setError] = useState<string | null>(null);
  const { hydrated, authed, operator, role, operators, signIn: storeSignIn, signOut: storeSignOut } = store;

  const state: SessionState = !hydrated ? "loading" : authed ? "ready" : "signed-out";

  const signInLocal = useCallback(
    (operatorId: string) => {
      const account = operators.find((o) => o.id === operatorId);
      if (!account) {
        setError("That operator account does not exist.");
        return;
      }
      if (account.status !== "active") {
        setError("This operator account is suspended. Ask a Platform Owner to reactivate it.");
        return;
      }
      setError(null);
      storeSignIn(account.id, account.role as RoleId);
    },
    [operators, storeSignIn],
  );

  const value = useMemo<AdminSession>(
    () => ({
      mode: "prototype",
      state,
      user: null,
      roleId: operator ? role.id : null,
      error,
      signIn: async () => {
        throw new Error("Email sign-in is available when the console is connected to Firebase.");
      },
      signInLocal,
      signOut: async () => storeSignOut(),
      resetPassword: async () => {
        throw new Error("Password reset is available when the console is connected to Firebase.");
      },
    }),
    [state, operator, role.id, error, signInLocal, storeSignOut],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/* --------------------------------- Firebase --------------------------------- */

function FirebaseAuthProvider({ mode, children }: { mode: DataMode; children: ReactNode }) {
  const prototypeStore = useStore();
  const [state, setState] = useState<SessionState>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    void (async () => {
      try {
        const [{ onIdTokenChanged }, { getFirebaseClient }] = await Promise.all([import("firebase/auth"), import("./client")]);
        if (cancelled) return;
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
          if (!nextUser.emailVerified || disabled || !FIREBASE_ALLOWED.has(role)) {
            setRoleId(role || null);
            setState("forbidden");
            return;
          }
          setRoleId(role);
          // The console shell resolves the operator profile from the workspace directory.
          const profile = prototypeStore.operators.find((o) => o.email && o.email === nextUser.email) ?? prototypeStore.operators.find((o) => o.role === role);
          prototypeStore.signIn(profile?.id ?? "op-1", role as RoleId);
          setState("ready");
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Firebase could not be initialized.");
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // Subscribing once avoids auth listener churn; store methods are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const [{ signInWithEmailAndPassword }, { getFirebaseClient }] = await Promise.all([import("firebase/auth"), import("./client")]);
    await signInWithEmailAndPassword(getFirebaseClient().auth, email.trim(), password);
  }, []);
  const signOut = useCallback(async () => {
    const [{ signOut: firebaseSignOut }, { getFirebaseClient }] = await Promise.all([import("firebase/auth"), import("./client")]);
    await firebaseSignOut(getFirebaseClient().auth);
    prototypeStore.signOut();
  }, [prototypeStore]);
  const resetPassword = useCallback(async (email: string) => {
    const [{ sendPasswordResetEmail }, { getFirebaseClient }] = await Promise.all([import("firebase/auth"), import("./client")]);
    await sendPasswordResetEmail(getFirebaseClient().auth, email.trim());
  }, []);

  const value = useMemo<AdminSession>(
    () => ({ mode, state, user, roleId, error, signIn, signInLocal: () => {}, signOut, resetPassword }),
    [mode, state, user, roleId, error, signIn, signOut, resetPassword],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAdminSession(): AdminSession {
  const value = useContext(Context);
  if (!value) throw new Error("useAdminSession must be used inside AdminAuthProvider.");
  return value;
}
