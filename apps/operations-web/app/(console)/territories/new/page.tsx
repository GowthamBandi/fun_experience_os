"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { NewTerritoryFlow } from "@/components/setup/flows";

function Inner() {
  const params = useSearchParams();
  return <NewTerritoryFlow franchiseId={params.get("franchiseId") ?? undefined} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
