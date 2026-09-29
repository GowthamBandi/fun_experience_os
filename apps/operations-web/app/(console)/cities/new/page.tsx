"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { NewCityFlow } from "@/components/setup/flows";

function Inner() {
  const params = useSearchParams();
  return <NewCityFlow territoryId={params.get("territoryId") ?? undefined} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
