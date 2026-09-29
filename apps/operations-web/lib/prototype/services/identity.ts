import type { PrototypeState } from "../scenarios/state";
import type { TemporaryIdentity, IdentityPattern } from "../entities";
import { patternCapacity, validateIdentityGeneration, validatePatternSafety } from "../validators/identityValidation";
import { formatIdentityCode, selectSessionParticipantPool } from "../selectors/identity";
import { pushAudit, pushSignal } from "./helpers";

type Result = { state: PrototypeState; error?: string };

export function createIdentityPattern(
  state: PrototypeState,
  input: { name: string; prefix: string; separator?: string; numberLength?: number; aliasStyle?: string },
  operatorId: string = "system",
): { state: PrototypeState; pattern?: IdentityPattern; error?: string } {
  const name = input.name?.trim() ?? "";
  const prefix = input.prefix?.trim().toUpperCase() ?? "";
  const separator = input.separator ?? "-";
  const numberLength = input.numberLength ?? 2;

  if (name.length < 3) return { state, error: "Give the pattern a name of at least 3 characters." };
  const safety = validatePatternSafety({ prefix, separator, numberLength });
  if (!safety.safe) return { state, error: safety.reason };

  const patterns = state.identityPatterns ?? [];
  if (patterns.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) return { state, error: `A pattern named '${name}' already exists.` };
  if (patterns.some((p) => p.prefix.toUpperCase() === prefix && p.separator === separator && p.status !== "deprecated")) {
    return { state, error: `Prefix '${prefix}${separator}' is already used by an active pattern. Codes would collide.` };
  }

  const now = new Date().toISOString();
  const newPattern: IdentityPattern = {
    id: `pat-${Date.now().toString(36)}`,
    name,
    prefix,
    separator,
    numberLength,
    aliasStyle: input.aliasStyle?.trim() || "Standard",
    example: formatIdentityCode({ prefix, separator, numberLength }, 7),
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  let next: PrototypeState = { ...state, identityPatterns: [...patterns, newPattern] };
  next = pushAudit(next, { action: "create-identity-pattern", operatorId, description: `Created identity pattern '${name}' (${newPattern.example}).` });
  return { state: next, pattern: newPattern };
}

/** Retire or reinstate a pattern. Retired patterns cannot be used for new identities. */
export function setIdentityPatternStatus(state: PrototypeState, patternId: string, status: "active" | "deprecated", operatorId: string = "system"): Result {
  const pattern = (state.identityPatterns ?? []).find((p) => p.id === patternId);
  if (!pattern) return { state, error: "Identity pattern not found." };
  if (pattern.status === status) return { state, error: `Pattern is already ${status === "active" ? "active" : "retired"}.` };
  if (status === "active") {
    const clash = (state.identityPatterns ?? []).find(
      (p) => p.id !== patternId && p.status === "active" && p.prefix.toUpperCase() === pattern.prefix.toUpperCase() && p.separator === pattern.separator,
    );
    if (clash) return { state, error: `'${clash.name}' already uses this prefix.` };
  }
  let next: PrototypeState = {
    ...state,
    identityPatterns: (state.identityPatterns ?? []).map((p) => (p.id === patternId ? { ...p, status, updatedAt: new Date().toISOString() } : p)),
  };
  next = pushAudit(next, {
    action: status === "active" ? "reinstate-identity-pattern" : "retire-identity-pattern",
    operatorId,
    description: `${status === "active" ? "Reinstated" : "Retired"} identity pattern '${pattern.name}'.`,
  });
  return { state: next };
}

/**
 * Give every confirmed participant a temporary code. Locked and revealed codes
 * are kept; everyone else gets the next free number in the chosen pattern.
 */
export function generateTemporaryIdentities(state: PrototypeState, sessionId: string, patternId?: string, operatorId: string = "system"): Result {
  if (!state.sessions.some((s) => s.id === sessionId)) return { state, error: "Session not found." };
  const eligible = selectSessionParticipantPool(state, sessionId).filter((p) => p.isEligible);
  if (eligible.length === 0) return { state, error: "No confirmed participants to generate codes for." };

  const patterns = (state.identityPatterns ?? []).filter((p) => p.status === "active");
  const pattern = patternId ? (state.identityPatterns ?? []).find((p) => p.id === patternId) : patterns[0];
  if (!pattern) return { state, error: patternId ? "Identity pattern not found." : "Create an identity pattern first." };
  if (pattern.status !== "active") return { state, error: `Pattern '${pattern.name}' is retired. Choose an active pattern.` };
  const safety = validatePatternSafety(pattern);
  if (!safety.safe) return { state, error: `Pattern '${pattern.name}' is not safe to use: ${safety.reason}` };
  if (eligible.length > patternCapacity(pattern.numberLength)) {
    return { state, error: `Pattern '${pattern.name}' has room for ${patternCapacity(pattern.numberLength)} codes; this session has ${eligible.length} participants.` };
  }

  const all = state.temporaryIdentities ?? [];
  const sessionIds = all.filter((t) => t.sessionId === sessionId);
  const usedCodes = new Set(sessionIds.filter((t) => t.status === "locked" || t.status === "revealed").map((t) => t.temporaryCode));
  const now = new Date().toISOString();
  let n = 1;
  const nextCode = () => {
    let code = formatIdentityCode(pattern, n++);
    while (usedCodes.has(code)) code = formatIdentityCode(pattern, n++);
    usedCodes.add(code);
    return code;
  };

  let generated = 0;
  let kept = 0;
  const updated = new Map<string, TemporaryIdentity>();
  for (const p of eligible) {
    const check = validateIdentityGeneration(state, sessionId, p.booking.id);
    const existing = sessionIds.find((t) => t.bookingId === p.booking.id);
    if (!check.isValid) {
      kept++;
      continue; // locked or revealed codes never change
    }
    const code = nextCode();
    generated++;
    updated.set(
      p.booking.id,
      existing
        ? {
            ...existing,
            temporaryCode: code,
            patternId: pattern.id,
            generationVersion: existing.generationVersion + 1,
            status: "generated",
            regeneratedAt: now,
            revokedAt: undefined,
            revocationReason: undefined,
            updatedAt: now,
          }
        : {
            id: `tid-${p.booking.id}`,
            sessionId,
            bookingId: p.booking.id,
            participantAlias: p.booking.alias,
            temporaryCode: code,
            patternId: pattern.id,
            generationVersion: 1,
            status: "generated",
            generatedAt: now,
            createdBy: operatorId,
            updatedAt: now,
          },
    );
  }

  if (generated === 0) return { state, error: "Every participant already has a locked code. Nothing to generate." };

  const untouched = all.filter((t) => !(t.sessionId === sessionId && updated.has(t.bookingId)));
  let next: PrototypeState = { ...state, temporaryIdentities: [...untouched, ...updated.values()] };
  next = pushAudit(next, {
    sessionId,
    action: "generate-temporary-identities",
    operatorId,
    description: `Generated ${generated} temporary code(s) with pattern '${pattern.name}'${kept ? `; ${kept} locked code(s) kept` : ""}.`,
  });
  next = pushSignal(next, { kind: "system", sessionId, message: `Temporary codes generated for session ${sessionId}` });
  return { state: next };
}

/** Lock codes so they cannot change. Every confirmed participant must have one. */
export function lockTemporaryIdentities(state: PrototypeState, sessionId: string, operatorId: string = "system"): Result {
  const eligible = selectSessionParticipantPool(state, sessionId).filter((p) => p.isEligible);
  const missing = eligible.filter((p) => !p.temporaryIdentity || p.temporaryIdentity.status === "not-generated" || p.temporaryIdentity.status === "revoked");
  if (eligible.length === 0) return { state, error: "No confirmed participants yet." };
  if (missing.length > 0) return { state, error: `${missing.length} participant(s) have no active code. Generate codes first.` };
  const toLock = eligible.filter((p) => p.temporaryIdentity?.status === "generated");
  if (toLock.length === 0) return { state, error: "All codes are already locked." };

  const now = new Date().toISOString();
  const lockIds = new Set(toLock.map((p) => p.temporaryIdentity!.id));
  let next: PrototypeState = {
    ...state,
    temporaryIdentities: (state.temporaryIdentities ?? []).map((t) => (lockIds.has(t.id) ? { ...t, status: "locked" as const, lockedAt: now, updatedAt: now } : t)),
  };
  next = pushAudit(next, { sessionId, action: "lock-temporary-identities", operatorId, description: `Locked ${toLock.length} temporary code(s).` });
  return { state: next };
}

/** Withdraw one code (for example, it was shared publicly). A new one can then be generated. */
export function revokeTemporaryIdentity(state: PrototypeState, identityId: string, reason: string, operatorId: string = "system"): Result {
  const identity = (state.temporaryIdentities ?? []).find((t) => t.id === identityId);
  if (!identity) return { state, error: "Temporary code not found." };
  if (identity.status === "revoked") return { state, error: "This code is already revoked." };
  if (identity.status === "revealed") return { state, error: "This code has been revealed to participants. Cancel the reveal before revoking it." };
  if (!reason || reason.trim().length < 5) return { state, error: "Give a reason (at least 5 characters) for revoking the code." };

  const now = new Date().toISOString();
  let next: PrototypeState = {
    ...state,
    temporaryIdentities: (state.temporaryIdentities ?? []).map((t) =>
      t.id === identityId ? { ...t, status: "revoked" as const, revokedAt: now, revocationReason: reason.trim(), updatedAt: now } : t,
    ),
  };
  next = pushAudit(next, {
    sessionId: identity.sessionId,
    action: "revoke-temporary-identity",
    operatorId,
    description: `Revoked code ${identity.temporaryCode} (${identity.participantAlias}). Reason: ${reason.trim()}`,
  });
  return { state: next };
}
