// Trips: multi-day group trips (docs/API_CONTRACT.md → Trips).
// Region asia-south1; App Check enforced outside the emulator (callable()).

import * as functions from "firebase-functions/v1";
import { callable, docId, obj, requestId, str } from "../platform/callable";
import { requirePhoneUser } from "../platform/actors";
import { requireAdmin } from "../platform/auth";
import { consumeLimit, consumeRateLimit } from "../platform/rateLimit";
import { DomainError } from "../platform/errors";
import { SECRET_NAMES, isEmulator, type SecretName } from "../platform/security";
import { RATE_LIMITS } from "../commerce/config";
import { runJob } from "../platform/jobs";
import { deleteTripDraftCommand, reviewTripCommand, saveTripDraftCommand, submitTripCommand, withdrawTripCommand } from "./drafts";
import {
  cancelTripBookingCommand, confirmTripPaymentCommand, createTripOrder, releaseExpiredTripHolds as releaseExpiredTripHoldsSvc,
  reserveTripSeatsCommand,
} from "./bookings";
import {
  addTripDepartureCommand, cancelDepartureCommand, getTripManifestQuery, postDepartureUpdateCommand, setDepartureSeatsCommand,
  setSalesClosedCommand,
} from "./operations";

const RZP: SecretName[] = [SECRET_NAMES.razorpayKeyId, SECRET_NAMES.razorpayKeySecret];
const bind = (s: SecretName[]) => (isEmulator() ? [] : s);

/* --------------------------------------------------------------- organizer */

export const saveTripDraft = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogSave", uid);
  return saveTripDraftCommand(uid, data);
});

export const deleteTripDraft = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogSave", uid);
  return deleteTripDraftCommand(uid, data);
});

export const submitTrip = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogSubmit", uid);
  return submitTripCommand(uid, data);
});

export const withdrawTrip = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogSubmit", uid);
  return withdrawTripCommand(uid, data);
});

export const setDepartureSeats = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogOps", uid);
  return setDepartureSeatsCommand(uid, data);
});

export const setSalesClosed = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogOps", uid);
  return setSalesClosedCommand(uid, data);
});

export const addTripDeparture = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogOps", uid);
  return addTripDepartureCommand(uid, data);
});

export const cancelDeparture = callable(
  async (data, context) => {
    const uid = requirePhoneUser(context).uid;
    await consumeLimit("eventCancel", uid);
    return cancelDepartureCommand(uid, data);
  },
  { secrets: RZP }
);

export const postDepartureUpdate = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogOps", uid);
  return postDepartureUpdateCommand(uid, data);
});

/** Departure manifest with traveller details: the trip's organizer team only (`attendees.view`). */
export const getTripManifest = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  return getTripManifestQuery(uid, data);
});

/* ----------------------------------------------------------------- console */

export const reviewTrip = callable(async (data, context) => reviewTripCommand(requireAdmin(context, "review trips"), data));

/* ---------------------------------------------------------------- customer */

export const reserveTripSeats = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeRateLimit({ bucket: `tripreserve_${uid}`, ...RATE_LIMITS.reserve, message: "Too many booking attempts. Please wait a few minutes." });
  return reserveTripSeatsCommand(uid, data);
});

function bookingIdOf(data: unknown) {
  const d = obj(data);
  requestId(d.requestId);
  return docId(d.bookingId, "bookingId");
}

export const createTripPaymentOrder = callable(
  async (data, context) => {
    const uid = requirePhoneUser(context).uid;
    const bookingId = bookingIdOf(data);
    await consumeRateLimit({ bucket: `trippayorder_${uid}`, ...RATE_LIMITS.paymentOrder });
    return createTripOrder(uid, bookingId, "initial");
  },
  { secrets: RZP }
);

/** Opens the Razorpay order for a confirmed booking's remaining balance. */
export const payTripBalance = callable(
  async (data, context) => {
    const uid = requirePhoneUser(context).uid;
    const bookingId = bookingIdOf(data);
    await consumeRateLimit({ bucket: `trippayorder_${uid}`, ...RATE_LIMITS.paymentOrder });
    return createTripOrder(uid, bookingId, "balance");
  },
  { secrets: RZP }
);

export const confirmTripPayment = callable(
  async (data, context) => {
    const uid = requirePhoneUser(context).uid;
    const d = obj(data);
    const paymentId = docId(d.paymentId, "paymentId");
    const providerPaymentId = str(d.providerPaymentId, "providerPaymentId", 4, 64);
    if (!/^[A-Za-z0-9_]+$/.test(providerPaymentId)) throw new DomainError("INVALID_INPUT", "providerPaymentId is not valid.");
    const providerSignature = str(d.providerSignature, "providerSignature", 64, 64);
    await consumeRateLimit({ bucket: `tripconfirm_${uid}`, ...RATE_LIMITS.confirmPayment });
    return confirmTripPaymentCommand(uid, { paymentId, providerPaymentId, providerSignature });
  },
  { secrets: RZP }
);

export const cancelTripBooking = callable(
  async (data, context) => {
    const uid = requirePhoneUser(context).uid;
    await consumeRateLimit({ bucket: `tripcancel_${uid}`, ...RATE_LIMITS.cancel });
    return cancelTripBookingCommand(uid, data);
  },
  { secrets: RZP }
);

/* ---------------------------------------------------------------- schedule */

export const releaseExpiredTripHolds = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 240, secrets: bind(RZP) })
  .pubsub.schedule("every 5 minutes")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    await runJob("releaseExpiredTripHolds", { holds: () => releaseExpiredTripHoldsSvc() });
  });
