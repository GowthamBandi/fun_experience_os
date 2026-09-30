"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { useAdminSession } from "@/lib/firebase/auth";
import { ConfigurationNotice } from "@/components/console/ConfigurationNotice";
import { EnvironmentBadge } from "@/components/console/EnvironmentBadge";
import { landingRoute } from "@/lib/console/capabilities";

/** Signed in but not ready: the console layout explains the state (verify email, no role, disabled…). */
const EXPLAINED_STATES = new Set(["unverified", "disabled", "no-role", "forbidden"]);

function messageFor(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code.includes("invalid-credential")) return "The email or password is incorrect.";
  if (code.includes("too-many-requests")) return "Sign-in is temporarily locked after repeated attempts. Try again later.";
  if (code.includes("network-request-failed")) return "The authentication service could not be reached.";
  return error instanceof Error ? error.message : "Sign-in failed. Try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const session = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session.state === "ready") router.replace(landingRoute(session.consoleRole));
    else if (EXPLAINED_STATES.has(session.state)) router.replace("/");
  }, [router, session.state, session.consoleRole]);

  const misconfigured = session.state === "misconfigured" && !!session.configProblem;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password || busy || misconfigured) return;
    setBusy(true);
    setNotice(null);
    try {
      await session.signIn(email, password);
    } catch (error) {
      setNotice(messageFor(error));
      setBusy(false);
    }
  }

  async function reset() {
    if (misconfigured) return;
    if (!email.trim()) {
      setNotice("Enter your work email first, then request a reset link.");
      return;
    }
    try {
      await session.resetPassword(email);
      setNotice("A password reset link has been sent if the account exists.");
    } catch {
      setNotice("A password reset link could not be sent right now.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a111a] p-6">
      <div className="w-full max-w-md">
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-400/10 text-indigo-300"><ShieldCheck className="h-6 w-6" /></span>
          <div className="mt-4 flex justify-center"><EnvironmentBadge /></div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">Operations Console</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in with your verified Experience OS account.</p>
        </div>

        {misconfigured && session.configProblem && <div className="mt-8"><ConfigurationNotice problem={session.configProblem} /></div>}

        <form onSubmit={submit} className="mt-8 rounded-2xl border border-white/10 bg-[#111925] p-6 shadow-2xl">
          <label className="block"><span className="text-xs font-medium text-slate-300">Work email</span><input type="email" autoComplete="username" required disabled={misconfigured} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0a111a] px-3.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/10" placeholder="admin@company.com" /></label>
          <label className="mt-4 block"><span className="text-xs font-medium text-slate-300">Password</span><span className="relative mt-2 block"><input type={show ? "text" : "password"} autoComplete="current-password" required disabled={misconfigured} value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0a111a] px-3.5 pr-11 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/10" /><button type="button" onClick={() => setShow((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200" aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
          {(notice || session.error || session.state === "forbidden") && <div role="alert" className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-200">{notice ?? session.error ?? "This account cannot use the Operations Console."}</div>}
          <button type="submit" disabled={!email.trim() || !password || busy || misconfigured} className="mt-5 flex h-11 w-full items-center justify-between rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"><span>{busy ? "Signing in…" : "Sign in"}</span><ArrowRight className="h-4 w-4" /></button>
          <button type="button" onClick={reset} disabled={misconfigured} className="mt-4 disabled:opacity-40 inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300"><KeyRound className="h-3.5 w-3.5" />Forgot password?</button>
        </form>
        <p className="mt-5 text-center text-[11px] leading-5 text-slate-600">Access is restricted by verified email, account status and server-managed role claims. All privileged actions are audited.</p>
      </div>
    </main>
  );
}
