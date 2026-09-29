"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/** Catches rendering errors inside a console page; the shell and navigation stay usable. */
export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[console] page error", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="max-w-lg rounded-panel border border-edge bg-white p-8 text-center shadow-panel">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <TriangleAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-display text-xl font-bold text-ink-lum">This page ran into a problem</h1>
        <p className="mt-2 text-sm leading-6 text-ink-mut">
          Your data is safe — nothing was lost. Try again, or go back to the overview. If it keeps happening, export a backup from Workspace settings and report the page you were on.
        </p>
        {error.digest && <p className="mt-3 font-mono text-xs text-ink-mut">Reference: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
          <Link href="/">
            <Button variant="secondary">Go to overview</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
