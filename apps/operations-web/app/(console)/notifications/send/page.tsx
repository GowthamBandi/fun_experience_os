import { ControlSuspense } from "@/components/control/ControlBits";
import { SendNotificationView } from "@/components/notifications/SendNotificationView";

export default function Page() {
  return (
    <ControlSuspense>
      <SendNotificationView />
    </ControlSuspense>
  );
}
