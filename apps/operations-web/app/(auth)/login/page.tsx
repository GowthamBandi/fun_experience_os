"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, Eye, EyeOff, FileClock, KeyRound, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useAdminSession } from "@/lib/firebase/auth";
import { useStore } from "@/lib/store";
import { ROLES } from "@/lib/data/mock";
import { Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

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

  useEffect(() => {
    if (session.state === "ready") router.replace("/");
  }, [router, session.state]);

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      <BrandPanel />
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="mark h-10 w-10" />
            <p className="font-display text-lg font-bold text-ink-lum">Experience OS</p>
          </div>
          {session.mode === "prototype" ? <LocalSignIn /> : <FirebaseSignIn />}
        </div>
      </section>
    </main>
  );
}

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#4f3fe8] via-[#6d4cf0] to-[#c0409a] p-12 text-white lg:flex lg:flex-col">
      <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-32 left-10 h-96 w-96 rounded-full bg-amber-300/20 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <span className="mark h-10 w-10" />
        <p className="font-display text-lg font-bold">Experience OS</p>
      </div>
      <div className="relative mt-auto max-w-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/70">Super Admin console</p>
        <h1 className="mt-3 font-display text-[40px] font-extrabold leading-[1.1] tracking-tight">Run the marketplace with confidence.</h1>
        <p className="mt-4 text-base leading-7 text-white/80">
          Approve organizers and arenas, operate sessions end-to-end, protect customers and keep a permanent record of every decision.
        </p>
        <ul className="mt-8 space-y-3 text-sm">
          {[
            { icon: ShieldCheck, text: "Role-scoped access for every position" },
            { icon: FileClock, text: "Every action recorded with who, what and why" },
            { icon: BadgeCheck, text: "No-oversell capacity and audited emergency access" },
          ].map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                <Icon className="h-4 w-4" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <p className="relative mt-12 text-xs text-white/60">© {new Date().getFullYear()} Experience OS</p>
    </aside>
  );
}

function LocalSignIn() {
  const { operators, hydrated } = useStore();
  const session = useAdminSession();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return operators.filter((o) => !needle || `${o.name} ${o.title} ${o.role}`.toLowerCase().includes(needle));
  }, [operators, q]);

  return (
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
        <Sparkles className="h-3.5 w-3.5" /> Local workspace
      </span>
      <h2 className="mt-4 font-display text-[28px] font-bold tracking-tight text-ink-lum">Choose your operator profile</h2>
      <p className="mt-2 text-sm leading-6 text-ink-mut">
        This console is running on this device. Pick who you are — your role decides what you can see, and every action is recorded under your name.
      </p>

      <label className="relative mt-6 block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mut" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or role" aria-label="Search operators" className="field h-11 w-full rounded-xl pl-10 pr-3 text-sm" />
      </label>

      <div className="mt-4 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
        {!hydrated && [0, 1, 2, 3].map((i) => <div key={i} className="shimmer h-16 rounded-2xl" />)}
        {hydrated &&
          list.map((o) => {
            const suspended = o.status !== "active";
            return (
              <button
                key={o.id}
                disabled={suspended}
                onClick={() => session.signInLocal(o.id)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-2xl border border-edge bg-white p-3 text-left shadow-lift transition-all",
                  suspended ? "cursor-not-allowed opacity-50" : "hover:-translate-y-0.5 hover:border-brand hover:shadow-panel",
                )}
              >
                <Avatar initials={o.initials} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-lum">{o.name}</span>
                  <span className="block truncate text-xs text-ink-mut">
                    {ROLES.find((r) => r.id === o.role)?.name ?? o.role}
                    {suspended ? " · suspended" : ""}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-brand" />
              </button>
            );
          })}
        {hydrated && list.length === 0 && <p className="py-8 text-center text-sm text-ink-mut">No operator matches “{q}”.</p>}
      </div>
      {session.error && (
        <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {session.error}
        </p>
      )}
      <p className="mt-6 text-xs leading-5 text-ink-mut">
        Data is stored in this browser and can be backed up from Workspace settings. Connect Firebase (NEXT_PUBLIC_DATA_MODE) for shared, multi-user operation.
      </p>
    </div>
  );
}

function FirebaseSignIn() {
  const session = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password || busy) return;
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
    <div>
      <h2 className="font-display text-[28px] font-bold tracking-tight text-ink-lum">Sign in</h2>
      <p className="mt-2 text-sm text-ink-mut">Use your verified Experience OS work account.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Work email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="field h-12 w-full rounded-xl px-4 text-sm" placeholder="admin@company.com" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Password</span>
          <span className="relative block">
            <input type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="field h-12 w-full rounded-xl px-4 pr-12 text-sm" />
            <button type="button" onClick={() => setShow((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-mut hover:text-ink-lum" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        {(notice || session.error || session.state === "forbidden") && (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-800">
            {notice ?? session.error ?? "This account is not verified or has no Super Admin access."}
          </div>
        )}
        <button type="submit" disabled={!email.trim() || !password || busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white shadow-brand transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"} <ArrowRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={reset} className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:text-brand-hover">
          <KeyRound className="h-4 w-4" /> Forgot password?
        </button>
      </form>
      <p className="mt-8 text-xs leading-5 text-ink-mut">Access is restricted by verified email, account status and server-managed role claims. All privileged actions are audited.</p>
    </div>
  );
}
