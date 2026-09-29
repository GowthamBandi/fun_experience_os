"use client";

import { useParams } from "next/navigation";
import { NewCityFlow } from "@/components/setup/flows";

export default function NewCityInTerritoryPage() {
  const { id } = useParams<{ id: string }>();
  return <NewCityFlow territoryId={id} />;
}
