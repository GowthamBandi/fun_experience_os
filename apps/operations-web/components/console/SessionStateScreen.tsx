"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { MailCheck, RefreshCw, ShieldOff } from "lucide-react";
import { useAdminSession } from "@/lib/firebase/auth";
import { EnvironmentBadge } from "./EnvironmentBadge";

function Frame({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="dusk-field grain flex h-screen items-center justify-center p-6">
      <div role="alert" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111925] p-6 text-center">
        <div className="mb-3 flex justify-center"><EnvironmentBadge /></div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <div className="mt-2 text-xs leading-5 text-slate-400">{children}</div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

const secondary = "h-9 rounded-lg border border-white/10 px-3 text-xs text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40";
const primary = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-500 px-3 text-xs font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50";

/** Every signed-in state that is not "ready": explains it and offers the next step. */
export function SessionStateScreen() {
  const session = useAdminSession();
  const signOut = <button onClick={() => void session.signOut()} className={secondary}>Sign out</button>;

  switch (session.state) {
    case "unverified":
      return <VerifyEmail />;
    case "disabled":
      return <Frame title="Account suspended or disabled" actions={signOut}>
        <p>A Platform Owner has suspended or disabled console access for <span className="text-slate-200">{session.user?.email ?? "this account"}</span>. Contact a Platform Owner if you believe this is a mistake.</p>
      </Frame>;
    case "no-role":
      return <Frame title="Your account has no console access" actions={<>{signOut}<RefreshButton /></>}>
        <p><span className="text-slate-200">{session.user?.email ?? "This account"}</span> is signed in and verified but has no console role. Ask a Platform Owner to grant you Super Admin or Auditor access (Operator access page), then choose “Check again”.</p>
      </Frame>;
    case "forbidden":
      return <Frame title="Access unavailable" actions={signOut}>
        <p>This account&apos;s role{session.roleId ? <> (<code className="text-slate-300">{session.roleId}</code>)</> : null} cannot use the Operations Console. Only Platform Owner, Super Admin and Auditor accounts can sign in here.</p>
      </Frame>;
    default:
      return <Frame title="The console could not start" actions={<><button onClick={() => window.location.reload()} className={secondary}>Reload</button><Link href="/login" className={primary}>Go to sign-in</Link></>}>
        <p>{session.error ?? "Firebase could not be initialized."}</p>
      </Frame>;
  }
}

function RefreshButton({ label = "Check again" }: { label?: string }) {
  const { refreshSession } = useAdminSession();
  const [busy, setBusy] = useState(false);
  return <button disabled={busy} onClick={() => { setBusy(true); void refreshSession().finally(() => setBusy(false)); }} className={primary}><RefreshCw className="h-3.5 w-3.5" />{busy ? "Checking…" : label}</button>;
}

function VerifyEmail() {
  const session = useAdminSession();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);

  async function send() {
    setBusy(true);
    setNote(await session.sendVerification());
    setBusy(false);
  }
  async function verified() {
    setChecking(true);
    try {
      await session.refreshSession();
      // Still here after a refresh → the link has not been opened yet.
      setNote({ ok: false, message: "Your email is still not verified. Open the link in the verification email, then try again." });
    } catch {
      setNote({ ok: false, message: "Your session could not be refreshed. Check your connection and try again." });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Frame title="Verify your email to continue" actions={<>
      <button onClick={() => void send()} disabled={busy} className={secondary}><MailCheck className="mr-1.5 inline h-3.5 w-3.5" />{busy ? "Sending…" : "Send verification email"}</button>
      <button onClick={() => void verified()} disabled={checking} className={primary}>{checking ? "Checking…" : "I've verified — continue"}</button>
      <button onClick={() => void session.signOut()} className={secondary}>Sign out</button>
    </>}>
      <p>The console only accepts verified operator accounts. <span className="text-slate-200">{session.user?.email ?? "Your address"}</span> has not been verified yet.</p>
      {note && <p role="status" className={note.ok ? "mt-3 rounded-lg border border-emerald-400/25 bg-emerald-400/5 p-2 text-emerald-100" : "mt-3 rounded-lg border border-amber-400/25 bg-amber-400/5 p-2 text-amber-100"}>{note.message}</p>}
    </Frame>
  );
}

/** Shown when a signed-in role opens a governance route it cannot use. */
export function RoleRestricted({ pathname, landing }: { pathname: string; landing: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-5 py-10 text-center" data-testid="role-restricted">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-400/20 bg-slate-400/10 text-slate-300"><ShieldOff className="h-5 w-5" /></span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Not available for your role</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400"><code className="rounded bg-white/5 px-1.5 py-0.5 text-slate-300">{pathname}</code> needs a role you don&apos;t have. The server enforces the same rule.</p>
      <Link href={landing} className="mt-6 inline-flex h-11 items-center rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400">Go to your console home</Link>
    </div>
  );
}
