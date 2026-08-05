import type { PrototypeState } from "../scenarios/state";
import type { TemporaryIdentity, IdentityPattern } from "../entities";
import { validateIdentityGeneration } from "../validators/identityValidation";
import { pushAudit, pushSignal } from "./helpers";

export function createIdentityPattern(
  state: PrototypeState,
  input: { name: string; prefix: string; separator?: string; numberLength?: number; aliasStyle?: string },
  operatorId: string = "op-master"
): { state: PrototypeState; pattern?: IdentityPattern; error?: string } {
  if (!input.name || !input.prefix) {
    return { state, error: "Pattern name and prefix are required." };
  }

  const newPattern: IdentityPattern = {
    id: `pat-${Date.now()}`,
    name: input.name,
    prefix: input.prefix.toUpperCase(),
    separator: input.separator ?? "-",
    numberLength: input.numberLength ?? 2,
    aliasStyle: input.aliasStyle ?? "Standard",
    example: `${input.prefix.toUpperCase()}${input.separator ?? "-"}${String(1).padStart(input.numberLength ?? 2, "0")}`,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let next = {
    ...state,
    identityPatterns: [...(state.identityPatterns ?? []), newPattern],
  };

  next = pushAudit(next, {
    action: "create-identity-pattern",
    operatorId,
    description: `Created Identity Pattern '${newPattern.name}' (${newPattern.example})`,
  });

  return { state: next, pattern: newPattern };
}

export function generateTemporaryIdentities(
  state: PrototypeState,
  sessionId: string,
  patternId?: string,
  operatorId: string = "op-master"
): PrototypeState {
  const sessionBookings = state.bookings.filter(
    (b) =>
      b.sessionId === sessionId &&
      (b.status === "confirmed" || b.status === "payment-confirmed" || b.bookingType === "complimentary")
  );

  if (sessionBookings.length === 0) return state;

  const patterns = state.identityPatterns ?? [];
  const selectedPattern = patterns.find((p) => p.id === patternId) ?? patterns[0] ?? {
    id: "pat-cr",
    prefix: "CR",
    separator: "-",
    numberLength: 2,
  };

  const existingIdentities = state.temporaryIdentities ?? [];
  let updatedIdentities = [...existingIdentities];
  let counter = 1;

  sessionBookings.forEach((b) => {
    const existing = updatedIdentities.find((t) => t.bookingId === b.id);
    if (existing && existing.status === "locked") return; // Immutable if locked

    const numStr = String(counter).padStart(selectedPattern.numberLength, "0");
    const code = `${selectedPattern.prefix}${selectedPattern.separator}${numStr}`;
    counter += 1;

    if (existing) {
      updatedIdentities = updatedIdentities.map((t) =>
        t.bookingId === b.id
          ? {
              ...t,
              temporaryCode: code,
              generationVersion: t.generationVersion + 1,
              regeneratedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : t
      );
    } else {
      const newIdentity: TemporaryIdentity = {
        id: `tid-${b.id}`,
        sessionId,
        bookingId: b.id,
        participantAlias: b.alias,
        temporaryCode: code,
        patternId: selectedPattern.id,
        generationVersion: 1,
        status: "generated",
        generatedAt: new Date().toISOString(),
        createdBy: operatorId,
        updatedAt: new Date().toISOString(),
      };
      updatedIdentities.push(newIdentity);
    }
  });

  let next: PrototypeState = {
    ...state,
    temporaryIdentities: updatedIdentities,
  };

  next = pushAudit(next, {
    sessionId,
    action: "generate-temporary-identities",
    operatorId,
    description: `Generated temporary identities for ${sessionBookings.length} participants using pattern '${selectedPattern.prefix}'`,
  });

  next = pushSignal(next, {
    kind: "system",
    sessionId,
    message: `Generated temporary identities for session ${sessionId}`,
    at: "Just now",
  });

  return next;
}

export function lockTemporaryIdentities(
  state: PrototypeState,
  sessionId: string,
  operatorId: string = "op-master"
): PrototypeState {
  const identities = (state.temporaryIdentities ?? []).map((t) =>
    t.sessionId === sessionId && t.status === "generated"
      ? { ...t, status: "locked" as const, lockedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      : t
  );

  let next = { ...state, temporaryIdentities: identities };

  next = pushAudit(next, {
    sessionId,
    action: "lock-temporary-identities",
    operatorId,
    description: `Locked temporary identities for session ${sessionId}`,
  });

  return next;
}

export function revokeTemporaryIdentity(
  state: PrototypeState,
  identityId: string,
  reason: string,
  operatorId: string = "op-master"
): PrototypeState {
  const identities = (state.temporaryIdentities ?? []).map((t) =>
    t.id === identityId
      ? {
          ...t,
          status: "revoked" as const,
          revokedAt: new Date().toISOString(),
          revocationReason: reason,
          updatedAt: new Date().toISOString(),
        }
      : t
  );

  let next = { ...state, temporaryIdentities: identities };

  next = pushAudit(next, {
    action: "revoke-temporary-identity",
    operatorId,
    description: `Revoked temporary identity ${identityId}: ${reason}`,
  });

  return next;
}
