"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAdminSession } from "@/lib/firebase/auth";
import { ConfigurationNotice } from "@/components/console/ConfigurationNotice";
import { Button, useToast } from "@/components/pulse";
import { EnvBadge } from "@/components/shell/EnvBadge";
import { landingRoute } from "@/lib/console/capabilities";

/** Signed in but not ready: the console layout explains the state (verify email, no role, disabled…). */
const STICKERS = ["🪪 Approve hosts", "🛡 Keep it safe", "💸 Move the money", "📈 Watch it grow"];

const FIELD =
  "mt-1.5 h-12 w-full rounded-control border border-line bg-night px-3.5 text-[14px] text-text outline-none transition-[border-color,box-shadow] duration-200 ease-pulse placeholder:text-text-3 focus:border-primary focus:shadow-[0_0_0_4px_rgba(142,114,255,0.18)] disabled:cursor-not-allowed disabled:opacity-50";

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
  const toast = useToast();
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
      setNotice(null);
      toast.show({ tone: "ok", title: "A password reset link has been sent if the account exists." });
    } catch {
      toast.show({ tone: "err", title: "A password reset link could not be sent right now." });
    }
  }

  const alert = notice ?? session.error ?? (session.state === "forbidden" ? "This account cannot use the Operations Console." : null);
  const disabled = !email.trim() || !password || misconfigured;

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-ink lg:grid-cols-[1.1fr_1fr]">
      <div aria-hidden className="page-glow" />
      <section className="relative z-10 flex flex-col justify-between gap-10 px-6 pb-6 pt-8 sm:px-10 lg:min-h-screen lg:px-14 lg:py-14">
        <div className="flex items-center gap-3">
          <svg aria-hidden width="34" height="24" viewBox="0 0 34 24" className="shrink-0">
            <polyline points="0,13 9.5,13 13.6,3 18.7,22 23.1,9.6 25.8,13 34,13" fill="none" stroke="#D9FF3F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-display text-[18px] font-bold tracking-[-0.02em] text-text">
            PULSE <span className="font-medium text-text-3">Admin</span>
          </span>
        </div>
        <div>
          <h2 className="font-display text-[44px] font-bold leading-none tracking-[-0.04em] text-text sm:text-[56px]">
            Run the city&rsquo;s<br />
            <em className="hl">pulse.</em>
          </h2>
          <ul className="mt-5 flex flex-wrap gap-2">
            {STICKERS.map((sticker) => (
              <li key={sticker} className="rounded-[12px] border border-line-soft bg-[rgba(255,255,255,0.06)] px-3 py-2 text-[13px] text-text">{sticker}</li>
            ))}
          </ul>
        </div>
        <p className="hidden text-[12px] text-text-3 lg:block">Operators only · every action is audited</p>
      </section>

      <section className="relative z-10 flex items-center justify-center px-6 pb-10 pt-2 sm:px-10 lg:justify-start lg:px-14 lg:py-14">
        <div className="w-full max-w-[420px]">
          {misconfigured && session.configProblem && <div className="mb-4"><ConfigurationNotice problem={session.configProblem} /></div>}
          <form onSubmit={submit} className="glass rounded-card p-[30px] shadow-glow">
            <h1 className="font-display text-[24px] font-bold tracking-[-0.02em] text-text">Welcome back 👋</h1>
            <p className="mt-1 text-[14px] text-text-2">Sign in with your verified work email.</p>

            <label className="mt-5 block">
              <span className="text-[12px] font-semibold text-text-3">Email</span>
              <input type="email" autoComplete="username" required disabled={misconfigured} value={email} onChange={(event) => setEmail(event.target.value)} className={FIELD} placeholder="admin@company.com" />
            </label>
            <label className="mt-4 block">
              <span className="text-[12px] font-semibold text-text-3">Password</span>
              <span className="relative block">
                <input type={show ? "text" : "password"} autoComplete="current-password" required disabled={misconfigured} value={password} onChange={(event) => setPassword(event.target.value)} className={`${FIELD} pr-12`} />
                <button type="button" onClick={() => setShow((value) => !value)} className="focus-ring absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-[10px] text-text-3 transition-colors duration-200 hover:text-text" aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            {alert && <div role="alert" className="mt-4 rounded-control border border-[rgba(255,97,120,0.35)] bg-[rgba(255,97,120,0.1)] p-3 text-[13px] leading-5 text-err">{alert}</div>}

            <Button type="submit" variant="volt" size="lg" loading={busy} disabled={disabled} className="mt-6 w-full">
              {busy ? "Signing in…" : "Sign in →"}
            </Button>

            <div className="mt-4 flex items-center justify-center gap-3 text-[12px]">
              <button type="button" onClick={reset} disabled={misconfigured} className="focus-ring rounded-[8px] px-1 text-text-3 transition-colors duration-200 hover:text-text disabled:opacity-40">Forgot password?</button>
              <EnvBadge />
            </div>
          </form>
          <p className="mt-5 text-center text-[12px] text-text-3 lg:hidden">Operators only · every action is audited</p>
        </div>
      </section>
    </main>
  );
}
