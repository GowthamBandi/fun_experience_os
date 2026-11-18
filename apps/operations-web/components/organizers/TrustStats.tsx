"use client";

import { useEffect, useState } from "react";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { Stat } from "@/components/pulse";
import { getFirebaseClient } from "@/lib/firebase/client";

type Count = { value: number | null; loading: boolean; error: string | null };

function useCount(make: () => Promise<number>, key: string): Count & { retry: () => void } {
  const [n, setN] = useState(0);
  const [state, setState] = useState<Count>({ value: null, loading: true, error: null });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    make().then(
      (value) => live && setState({ value, loading: false, error: null }),
      (e: Error) => live && setState({ value: null, loading: false, error: e.message }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, n]);
  return { ...state, retry: () => setN((x) => x + 1) };
}

/**
 * Audience and trust signals for one organizer: how many people follow them
 * (they're told about new events) and how many blocked them (a warning sign
 * worth a look when it climbs).
 */
export function TrustStats({ orgId }: { orgId: string }) {
  const db = getFirebaseClient().firestore;
  const followers = useCount(async () => (await getCountFromServer(query(collection(db, "follows"), where("orgId", "==", orgId)))).data().count, `f-${orgId}`);
  const blockedBy = useCount(async () => (await getCountFromServer(query(collection(db, "userBlocks"), where("orgIds", "array-contains", orgId)))).data().count, `b-${orgId}`);
  return (
    <section aria-label="Audience and trust" className="grid gap-4 sm:grid-cols-2">
      <Stat label="Followers" value={followers.value === null ? "—" : String(followers.value)} hint="Notified when this organizer publishes" loading={followers.loading} error={followers.error} onRetry={followers.retry} />
      <Stat
        label="Blocked by"
        value={blockedBy.value === null ? "—" : String(blockedBy.value)}
        hint={blockedBy.value && blockedBy.value >= 5 ? "Several people blocked them: check Support and Risk" : "People who chose not to see this organizer"}
        loading={blockedBy.loading}
        error={blockedBy.error}
        onRetry={blockedBy.retry}
      />
    </section>
  );
}
