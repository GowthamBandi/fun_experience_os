"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="dusk-field flex h-screen flex-col items-center justify-center gap-4 text-center">
      <span className="mark h-12 w-12" />
      <p className="text-lg font-semibold text-ink-lum">This door isn&apos;t on the map.</p>
      <p className="text-sm text-ink-mut">The room you asked for doesn&apos;t exist — or the night moved it.</p>
      <Link href="/" className="text-sm text-[#9db4ff] transition-colors hover:text-ink-lum">
        Back to Command
      </Link>
    </div>
  );
}
