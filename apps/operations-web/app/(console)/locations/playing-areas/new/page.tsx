"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { NewPlayingAreaFlow } from "@/components/setup/flows";

function Inner() {
  const params = useSearchParams();
  return <NewPlayingAreaFlow venueId={params.get("venueId") ?? undefined} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
