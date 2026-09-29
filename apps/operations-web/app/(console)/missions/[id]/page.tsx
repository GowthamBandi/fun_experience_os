"use client";

import { useMissionId, useRedirectTo } from "@/components/missions/shared";

/** /missions/[id] opens the session's overview. */
export default function MissionRedirect() {
  const sessionId = useMissionId();
  useRedirectTo(`/missions/${sessionId}/overview`);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-ink-mut" aria-busy>
      Opening session…
    </div>
  );
}
