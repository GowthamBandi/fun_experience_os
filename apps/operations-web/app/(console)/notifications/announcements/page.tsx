import { ControlSuspense } from "@/components/control/ControlBits";
import { AnnouncementsLibrary } from "@/components/notifications/AnnouncementsLibrary";

export default function Page() {
  return (
    <ControlSuspense>
      <AnnouncementsLibrary />
    </ControlSuspense>
  );
}
