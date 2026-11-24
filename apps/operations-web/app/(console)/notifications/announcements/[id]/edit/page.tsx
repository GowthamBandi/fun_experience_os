import { ControlSuspense } from "@/components/control/ControlBits";
import { AnnouncementComposer } from "@/components/notifications/AnnouncementComposer";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ControlSuspense>
      <AnnouncementComposer id={decodeURIComponent(id)} />
    </ControlSuspense>
  );
}
