import type { Signal } from "../entities";
import type { PrototypeState } from "../scenarios";

export const nowLabel = (): string => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `Today, ${hh}:${mm}`;
};

export const uid = (prefix: string): string => `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

/** Deterministic-ish id: largest numeric suffix + 1 under a prefix. */
export function nextId(prefix: string, existing: string[]): string {
  const nums = existing.map((id) => {
    const m = id.match(new RegExp(`^${prefix}-(\\d+)$`));
    return m ? parseInt(m[1], 10) : 0;
  });
  return `${prefix}-${Math.max(0, ...nums) + 1}`;
}

export function pushAudit(
  state: PrototypeState,
  entry: { action: string; description: string; sessionId?: string; operatorId?: string }
): PrototypeState {
  return {
    ...state,
    audits: [
      {
        id: uid("aud"),
        sessionId: entry.sessionId,
        action: entry.action,
        operatorId: entry.operatorId ?? "system",
        timestamp: nowLabel(),
        description: entry.description
      },
      ...state.audits
    ]
  };
}

export function pushSignal(
  state: PrototypeState,
  entry: { kind: Signal["kind"]; message: string; sessionId?: string; at?: string; read?: boolean }
): PrototypeState {
  return {
    ...state,
    signals: [
      {
        id: uid("sg"),
        kind: entry.kind,
        message: entry.message,
        sessionId: entry.sessionId,
        at: entry.at ?? nowLabel(),
        read: entry.read ?? false
      },
      ...state.signals
    ]
  };
}
