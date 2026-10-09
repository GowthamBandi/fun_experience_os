"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Returns set(key, value): replaces one query param (null removes it) without scrolling. Use inside <Suspense>. */
export function useSearchParamSetter(): (key: string, value: string | null) => void {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  return useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null) next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
}

/** A `?tab=` deep link: the current id (falling back to `defaultId`) and a setter that drops the param for the default. */
export function useTabParam<T extends string>(ids: readonly T[], defaultId: T): [T, (id: string) => void] {
  const params = useSearchParams();
  const set = useSearchParamSetter();
  const raw = params.get("tab");
  const tab = ids.includes(raw as T) ? (raw as T) : defaultId;
  const setTab = useCallback((id: string) => set("tab", id === defaultId ? null : id), [set, defaultId]);
  return [tab, setTab];
}
