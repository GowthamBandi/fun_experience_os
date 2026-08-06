"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function MissionRedirect() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    if (params.id) {
      router.replace(`/missions/${params.id}/overview`);
    }
  }, [params.id, router]);

  return (
    <div className="flex h-screen items-center justify-center font-mono text-xs text-ink-mut">
      Redirecting to event overview...
    </div>
  );
}
