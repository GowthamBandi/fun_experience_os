"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyPeopleNewRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/people/staff/new");
  }, [router]);

  return (
    <div className="p-8 text-center text-xs text-ink-mut">
      Redirecting to canonical Add Staff route...
    </div>
  );
}
