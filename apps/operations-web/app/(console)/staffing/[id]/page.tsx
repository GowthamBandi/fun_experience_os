"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyStaffingDetailRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/people/staff/${id}`);
  }, [id, router]);

  return (
    <div className="p-8 text-center text-xs text-ink-mut">
      Redirecting to canonical Staff Profile route...
    </div>
  );
}
