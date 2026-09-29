"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { NewVenueFlow } from "@/components/setup/flows";

function Inner() {
  const params = useSearchParams();
  return <NewVenueFlow cityId={params.get("cityId") ?? undefined} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
