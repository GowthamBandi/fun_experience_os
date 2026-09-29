"use client";

import { useParams } from "next/navigation";
import { NewPlayingAreaFlow } from "@/components/setup/flows";

export default function NewPlayingAreaInVenuePage() {
  const { id } = useParams<{ id: string }>();
  return <NewPlayingAreaFlow venueId={id} lockVenue />;
}
