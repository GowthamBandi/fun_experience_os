/**
 * `reserveSeat` callable — the only client entry point that can take a seat.
 *
 * The actor (uid, role, name, territories) comes from the verified auth token
 * and a live account check; the request body supplies only what to book.
 * Roles: BOOKING_ROLES (platform-owner, super-admin, city-manager, ops-manager,
 * coordinator, support). Platform-scope admins may book in any territory; every
 * other role is limited to the `territoryIds` custom claim that
 * `setOperatorAccess` sets.
 */
import * as functions from "firebase-functions/v1";
import { ADMIN_ROLES, BOOKING_ROLES, requireCurrentActor } from "../platform/auth";
import { enforceAppCheck, toHttpsError } from "../platform/callable";
import { invalidInput } from "../platform/errors";
import { reserveSeat as reserveSeatTransaction } from "./reserveSeat";

function parse(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw invalidInput("The booking request is invalid.");
  const value = data as Record<string, unknown>;
  const kind = value.kind ?? "sellable";
  if (kind !== "sellable" && kind !== "complimentary") throw invalidInput("That booking type isn't recognised.");
  return {
    requestId: typeof value.requestId === "string" ? value.requestId.trim() : "",
    sessionId: typeof value.sessionId === "string" ? value.sessionId.trim() : "",
    alias: typeof value.alias === "string" ? value.alias : "",
    kind: kind as "sellable" | "complimentary",
  };
}

export const reserveSeat = functions.runWith({ enforceAppCheck }).https.onCall(async (data, context) => {
  try {
    const actor = await requireCurrentActor(context, BOOKING_ROLES, "reserve seats");
    const unrestricted = (ADMIN_ROLES as readonly string[]).includes(actor.roleId) || actor.scope === "platform";
    return await reserveSeatTransaction({
      ...parse(data),
      actor: { uid: actor.uid, roleId: actor.roleId, displayName: actor.displayName },
      allowedTerritoryIds: unrestricted ? null : actor.territoryIds ?? [],
      source: "admin-console",
    });
  } catch (error) {
    throw toHttpsError(error, "The seat could not be reserved.");
  }
});
