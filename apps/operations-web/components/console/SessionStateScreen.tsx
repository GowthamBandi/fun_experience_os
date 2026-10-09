"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogIn, MailCheck, RefreshCw, RotateCw } from "lucide-react";
import { Button, Empty } from "@/components/pulse";
import { EnvBadge } from "@/components/shell/EnvBadge";
import { PulseMark } from "@/components/shell/Rail";
import { useAdminSession } from "@/lib/firebase/auth";

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
