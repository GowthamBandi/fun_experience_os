import { Event360 } from "@/components/events/Event360";

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <Event360 eventId={decodeURIComponent(eventId)} />;
}
