"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyNewTemplateRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/catalog/experiences/new");
  }, [router]);

  return (
    <div className="p-8 text-center text-xs text-ink-mut">
      Redirecting to canonical create experience route...
    </div>
  );
}
