import { ControlSuspense } from "@/components/control/ControlBits";
import { AnnouncementComposer } from "@/components/notifications/AnnouncementComposer";

export default function Page() {
  return (
    <ControlSuspense>
      <AnnouncementComposer />
    </ControlSuspense>
  );
}
