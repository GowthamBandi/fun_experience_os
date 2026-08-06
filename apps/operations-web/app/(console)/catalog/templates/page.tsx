"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyTemplatesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/catalog/experiences");
  }, [router]);

  return (
    <div className="p-8 text-center text-xs text-ink-mut">
      Redirecting to canonical experiences route...
    </div>
  );
}
