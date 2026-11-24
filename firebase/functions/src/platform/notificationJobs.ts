/**
 * Scheduled jobs of the notification center (docs/NOTIFICATION_CENTER_CONTRACT.md §5),
 * both through runJob() so the console's System page shows their runs:
 *  - runNotificationJobs, every 5 minutes: due scheduled notifications, and
 *    announcement windows (scheduled → live with its push, → ended).
 *  - expireAccountStatuses, daily 03:00 IST: a passed `until` returns the
 *    account to active.
 */
import * as functions from "firebase-functions/v1";
import { runJob } from "./jobs";
import { sendDueNotifications } from "./adminNotifications";
import { advanceAnnouncementWindows } from "./announcements";
import { expireStatuses } from "./accountControls";

export function runNotificationJobsOnce() {
  return runJob("runNotificationJobs", {
    scheduledNotifications: () => sendDueNotifications(),
    announcementWindows: () => advanceAnnouncementWindows(),
  });
}

export function expireAccountStatusesOnce() {
  return runJob("expireAccountStatuses", { expire: () => expireStatuses() });
}

export const runNotificationJobs = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("every 5 minutes")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    await runNotificationJobsOnce();
  });

export const expireAccountStatuses = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300 })
  .pubsub.schedule("every day 03:00")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    await expireAccountStatusesOnce();
  });
