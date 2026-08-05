"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig } from "framer-motion";
import type { Operator, Role, RoleId, Signal, Territory, TerritoryId } from "@/lib/types";
import { OPERATORS, ROLES, repos, territoryById } from "@/lib/data/mock";
import { canAccess } from "@/lib/nav";

const AUTH_KEY = "xos.auth";
const CONSOLE_KEY = "xos.console";

interface PersistedAuth {
  operatorId: string;
  roleId: RoleId;
}

interface PersistedConsole {
  territoryId: TerritoryId;
  sidebarCollapsed: boolean;
}

interface StoreValue {
  authed: boolean;
  hydrated: boolean;
  operator: Operator | null;
  role: Role;
  territory: Territory;
  sidebarCollapsed: boolean;
  paletteOpen: boolean;
  signalOpen: boolean;
  signals: Signal[];
  unreadCount: number;
  signIn: (operatorId: string, roleId: RoleId) => void;
  signOut: () => void;
  switchRole: (roleId: RoleId) => void;
  switchTerritory: (id: TerritoryId) => void;
  toggleSidebar: () => void;
  setPaletteOpen: (open: boolean) => void;
  setSignalOpen: (open: boolean) => void;
  markAllRead: () => void;
  markSignalRead: (id: string) => void;
  canAccess: (href: string) => boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

function readAuth(): PersistedAuth | null {
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as PersistedAuth) : null;
  } catch {
    return null;
  }
}

function readConsole(): PersistedConsole {
  try {
    const raw = window.localStorage.getItem(CONSOLE_KEY);
    return raw ? (JSON.parse(raw) as PersistedConsole) : { territoryId: "hvd-central", sidebarCollapsed: false };
  } catch {
    return { territoryId: "hvd-central", sidebarCollapsed: false };
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<PersistedAuth | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [consolePrefs, setConsolePrefs] = useState<PersistedConsole>({
    territoryId: "hvd-central",
    sidebarCollapsed: false,
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [signalOpen, setSignalOpen] = useState(false);
  const [signals, setSignals] = useState<Signal[]>(repos.signals());

  useEffect(() => {
    setAuth(readAuth());
    setConsolePrefs(readConsole());
    setHydrated(true);
  }, []);

  const persist = useCallback((key: string, value: unknown) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* prototype: storage is best-effort */
    }
  }, []);

  const signIn = useCallback(
    (operatorId: string, roleId: RoleId) => {
      const next = { operatorId, roleId };
      setAuth(next);
      persist(AUTH_KEY, next);
    },
    [persist],
  );

  const signOut = useCallback(() => {
    setAuth(null);
    try {
      window.localStorage.removeItem(AUTH_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const switchRole = useCallback(
    (roleId: RoleId) => {
      setAuth((prev) => {
        if (!prev) return prev;
        const next = { ...prev, roleId };
        persist(AUTH_KEY, next);
        return next;
      });
    },
    [persist],
  );

  const switchTerritory = useCallback(
    (id: TerritoryId) => {
      setConsolePrefs((prev) => {
        const next = { ...prev, territoryId: id };
        persist(CONSOLE_KEY, next);
        return next;
      });
    },
    [persist],
  );

  const toggleSidebar = useCallback(() => {
    setConsolePrefs((prev) => {
      const next = { ...prev, sidebarCollapsed: !prev.sidebarCollapsed };
      persist(CONSOLE_KEY, next);
      return next;
    });
  }, [persist]);

  const markAllRead = useCallback(() => {
    setSignals((prev) => prev.map((s) => ({ ...s, read: true })));
  }, []);

  const markSignalRead = useCallback((id: string) => {
    setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, read: true } : s)));
  }, []);

  const value = useMemo<StoreValue>(() => {
    const operator = auth ? (OPERATORS.find((o) => o.id === auth.operatorId) ?? null) : null;
    const role = ROLES.find((r) => r.id === (auth?.roleId ?? "coordinator")) ?? ROLES[6];
    const territory = territoryById(consolePrefs.territoryId);
    const unreadCount = signals.filter((s) => !s.read).length;

    return {
      authed: !!auth && hydrated,
      hydrated,
      operator,
      role,
      territory,
      sidebarCollapsed: consolePrefs.sidebarCollapsed,
      paletteOpen,
      signalOpen,
      signals,
      unreadCount,
      signIn,
      signOut,
      switchRole,
      switchTerritory,
      toggleSidebar,
      setPaletteOpen,
      setSignalOpen,
      markAllRead,
      markSignalRead,
      canAccess: (href: string) => (auth ? canAccess(href, auth.roleId) : false),
    };
  }, [
    auth,
    hydrated,
    consolePrefs,
    paletteOpen,
    signalOpen,
    signals,
    signIn,
    signOut,
    switchRole,
    switchTerritory,
    toggleSidebar,
    markAllRead,
    markSignalRead,
  ]);

  return (
    <MotionConfig reducedMotion="user">
      <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
    </MotionConfig>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
