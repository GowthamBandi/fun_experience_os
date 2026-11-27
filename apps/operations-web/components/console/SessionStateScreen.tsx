"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { KeyRound, LogIn, MailCheck, RefreshCw, RotateCw, Smartphone } from "lucide-react";
import { Button, Empty } from "@/components/pulse";
import { EnvBadge } from "@/components/shell/EnvBadge";
import { PulseMark } from "@/components/shell/Rail";
import { useAdminSession, type AuthenticatorSetup } from "@/lib/firebase/auth";
import { friendlyAuthError } from "@/lib/console/auth-errors";

function Frame({ emoji, title, body, actions, children }: { emoji: string; title: string; body: string; actions: ReactNode; children?: ReactNode }) {
  return (
    <div className="relative flex h-screen items-center justify-center overflow-y-auto bg-ink p-6">
      <div aria-hidden className="page-glow" />
      <div role="alert" className="glass relative w-full max-w-md rounded-card px-2 pt-6 shadow-glow">
        <div className="flex items-center justify-center gap-3">
          <PulseMark className="h-9 w-9 rounded-[12px]" />
          <EnvBadge />
        </div>
        <Empty emoji={emoji} title={title} body={body} className="pb-8 pt-6" action={<div className="flex flex-wrap justify-center gap-2">{actions}</div>} />
        {children ? <div className="-mt-4 px-6 pb-6">{children}</div> : null}
      </div>
    </div>
  );
}

/** Every signed-in state that is not "ready": explains it and offers the next step. */
export function SessionStateScreen() {
  const session = useAdminSession();
  const router = useRouter();
  const signOut = <Button variant="ghost" onClick={() => void session.signOut()}>Sign out</Button>;
  const who = session.user?.email ?? "This account";

  switch (session.state) {
    case "unverified":
      return <VerifyEmail />;
    case "enroll-second-factor":
      return <SetUpAuthenticator />;
    case "second-factor-required":
      return (
        <Frame
          emoji="🔐"
          title="Sign in again with your code"
          body={`${who} has an authenticator app, but this session was opened without its code. Sign out, then sign in with your password and the 6-digit code.`}
          actions={signOut}
        />
      );
    case "disabled":
      return (
        <Frame emoji="⛔" title="Account suspended or disabled" body={`A Platform Owner has suspended or disabled console access for ${who}. Contact a Platform Owner if you believe this is a mistake.`} actions={signOut} />
      );
    case "no-role":
      return (
        <Frame
          emoji="🔑"
          title="Your account has no console access"
          body={`${who} is signed in and verified but has no console role. Ask a Platform Owner to grant you Super Admin or Auditor access (Operator access page), then choose “Check again”.`}
          actions={<>{signOut}<RefreshButton /></>}
        />
      );
    case "forbidden":
      return (
        <Frame
          emoji="🚫"
          title="Access unavailable"
          body={`This account's role${session.roleId ? ` (${session.roleId})` : ""} cannot use the Operations Console. Only Platform Owner, Super Admin and Auditor accounts can sign in here.`}
          actions={signOut}
        />
      );
    default:
      return (
        <Frame
          emoji="🧯"
          title="The console could not start"
          body={session.error ?? "Firebase could not be initialized."}
          actions={<>
            <Button variant="ghost" icon={<RotateCw />} onClick={() => window.location.reload()}>Reload</Button>
            <Button variant="volt" icon={<LogIn />} onClick={() => router.push("/login")}>Go to sign-in</Button>
          </>}
        />
      );
  }
}

function RefreshButton({ label = "Check again" }: { label?: string }) {
  const { refreshSession } = useAdminSession();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="volt" loading={busy} icon={<RefreshCw />} onClick={() => { setBusy(true); void refreshSession().finally(() => setBusy(false)); }}>
      {busy ? "Checking…" : label}
    </Button>
  );
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
    <Frame
      emoji="📬"
      title="Verify your email to continue"
      body={`The console only accepts verified operator accounts. ${session.user?.email ?? "Your address"} has not been verified yet.`}
      actions={<>
        <Button variant="ghost" loading={busy} icon={<MailCheck />} onClick={() => void send()}>{busy ? "Sending…" : "Send verification email"}</Button>
        <Button variant="volt" loading={checking} onClick={() => void verified()}>{checking ? "Checking…" : "I've verified — continue"}</Button>
        <Button variant="quiet" onClick={() => void session.signOut()}>Sign out</Button>
      </>}
    >
      {note ? (
        <p role="status" className={note.ok ? "rounded-control border border-[rgba(63,221,154,0.3)] bg-[rgba(63,221,154,0.08)] p-3 text-[13px] text-ok" : "rounded-control border border-[rgba(255,184,77,0.3)] bg-[rgba(255,184,77,0.08)] p-3 text-[13px] text-warn"}>
          {note.message}
        </p>
      ) : null}
    </Frame>
  );
}

/** Groups a setup key in fours so it can be typed into an authenticator app without mistakes. */
const grouped = (key: string) => key.replace(/(.{4})/g, "$1 ").trim();

function SetUpAuthenticator() {
  const session = useAdminSession();
  const [setup, setSetup] = useState<AuthenticatorSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);

  async function start() {
    setBusy(true);
    setNote(null);
    try {
      setSetup(await session.startAuthenticatorSetup());
    } catch (error) {
      setNote({ ok: false, message: friendlyAuthError(error) });
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setNote(null);
    try {
      // Signs out on success: the login page then asks for password + code.
      await session.finishAuthenticatorSetup(code);
    } catch (error) {
      setNote({ ok: false, message: friendlyAuthError(error) });
      setBusy(false);
    }
  }

  return (
    <Frame
      emoji="🔐"
      title="Set up your authenticator app"
      body={`The console needs a second step at sign-in: a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator or similar). It takes a minute, once.`}
      actions={setup ? <Button variant="quiet" onClick={() => void session.signOut()}>Sign out</Button> : <>
        <Button variant="ghost" onClick={() => void session.signOut()}>Sign out</Button>
        <Button variant="volt" loading={busy} icon={<KeyRound />} onClick={() => void start()}>{busy ? "Preparing…" : "Start setup"}</Button>
      </>}
    >
      {setup ? (
        <div className="space-y-4 text-[13px] text-text-2">
          <ol className="list-decimal space-y-2 pl-5">
            <li>In your authenticator app choose <b className="text-text">Add account → Enter a setup key</b>, and type this key (time-based):</li>
          </ol>
          <p data-testid="totp-key" className="select-all break-all rounded-control border border-line bg-night p-3 text-center font-mono text-[15px] tracking-[0.12em] text-text">{grouped(setup.secretKey)}</p>
          <p>
            On this phone?{" "}
            <a href={setup.link} className="focus-ring inline-flex items-center gap-1 rounded-[8px] text-primary underline-offset-2 hover:underline">
              <Smartphone className="h-3.5 w-3.5" /> Open in the authenticator app
            </a>
          </p>
          <label className="block">
            <span className="text-[12px] font-semibold text-text-3">2. Enter the 6-digit code it shows</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/[^0-9 ]/g, ""))}
              className="mt-1.5 h-12 w-full rounded-control border border-line bg-night px-3.5 text-center font-mono text-[20px] tracking-[0.3em] text-text outline-none focus:border-primary"
              placeholder="123456"
            />
          </label>
          <Button variant="volt" className="w-full" loading={busy} disabled={code.replace(/\s/g, "").length !== 6} onClick={() => void confirm()}>
            {busy ? "Checking…" : "Confirm and sign in again"}
          </Button>
          <p className="text-[12px] text-text-3">Keep the key private. If you lose the phone, a Platform Owner has to reset your second step.</p>
        </div>
      ) : null}
      {note ? <p role="status" className="mt-3 rounded-control border border-[rgba(255,184,77,0.3)] bg-[rgba(255,184,77,0.08)] p-3 text-[13px] text-warn">{note.message}</p> : null}
    </Frame>
  );
}

/** Shown when a signed-in role opens a governance route it cannot use. */
export function RoleRestricted({ pathname, landing }: { pathname: string; landing: string }) {
  const router = useRouter();
  return (
    <div className="relative mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-5 py-10" data-testid="role-restricted">
      <Empty
        emoji="🔒"
        title="Not available for your role"
        body={`${pathname} needs a role you don't have. The server enforces the same rule.`}
        action={<Button variant="volt" size="lg" onClick={() => router.push(landing)}>Go to your console home</Button>}
      />
    </div>
  );
}
