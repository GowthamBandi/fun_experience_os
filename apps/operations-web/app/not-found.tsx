import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="dusk-field flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-panel border border-edge bg-white p-8 text-center shadow-glass">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-subtle text-brand">
          <SearchX className="h-6 w-6" />
        </span>
        <p className="mt-5 eyebrow text-brand">Error 404</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink-lum">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-ink-mut">The address may be mistyped, or the page has moved. Nothing in your workspace was changed.</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/" className="inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-brand transition hover:bg-brand-hover">
            Go to Overview
          </Link>
          <Link href="/setup" className="inline-flex h-10 items-center justify-center rounded-xl border border-edge-strong bg-white px-4 text-sm font-semibold text-ink-lum shadow-lift transition hover:bg-bg-sunken">
            Open Setup
          </Link>
        </div>
      </div>
    </main>
  );
}
