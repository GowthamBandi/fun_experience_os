"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { describeReadError } from "./console/errors";
import { subscribeAdminNotifications, subscribeAnnouncements, subscribeTemplates, type Rows } from "./notifications-api";
import { toAnnouncementRow, toNotificationRow, toTemplateRow } from "./notifications";

type Subscribe = (observer: (rows: Rows, truncated: boolean) => void, onError: (message: string) => void) => () => void;

function useLiveRows(subscribe: Subscribe, enabled: boolean) {
  const [state, setState] = useState<{ rows: Rows; truncated: boolean; loading: boolean; error: string | null }>({ rows: [], truncated: false, loading: enabled, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setState({ rows: [], truncated: false, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribe(
        (rows, truncated) => setState({ rows, truncated, loading: false, error: null }),
        (message) => setState((s) => ({ ...s, loading: false, error: describeReadError(message) })),
      );
    } catch (cause) {
      setState((s) => ({ ...s, loading: false, error: cause instanceof Error ? cause.message : "These records could not be loaded." }));
    }
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

/** Live announcements, newest-edited first (admins read them under firestore.rules). */
export function useAnnouncements(enabled = true) {
  const live = useLiveRows(subscribeAnnouncements, enabled);
  const rows = useMemo(() => live.rows.map((r) => toAnnouncementRow(r.id, r.raw)), [live.rows]);
  return { ...live, rows };
}

/** Live send history (adminNotifications), newest first. */
export function useAdminNotifications(enabled = true) {
  const live = useLiveRows(subscribeAdminNotifications, enabled);
  const rows = useMemo(() => live.rows.map((r) => toNotificationRow(r.id, r.raw)), [live.rows]);
  return { ...live, rows };
}

/** Live notificationTemplates, newest-edited first. */
export function useTemplates(enabled = true) {
  const live = useLiveRows(subscribeTemplates, enabled);
  const rows = useMemo(() => live.rows.map((r) => toTemplateRow(r.id, r.raw)), [live.rows]);
  return { ...live, rows };
}
