import { Organizer360 } from "@/components/organizers/Organizer360";

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <Organizer360 orgId={decodeURIComponent(orgId)} />;
}
