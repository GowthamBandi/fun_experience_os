import type { PrototypeState } from "./state";
import type { AuditEvent, Signal } from "../entities";
import {
  cancelBooking,
  confirmBookingPayment,
  createBookingReservation,
  failBookingPayment,
  joinWaitlist,
  type PaymentRecordInput,
} from "../services/bookings";
import { cancelSession } from "../services/operations";

export interface ScenarioDef {
  name: string;
  blurb: string;
}

export const SCENARIOS: ScenarioDef[] = [
  { name: "Normal Weekend", blurb: "Balanced baseline — steady fills, settled payments, one low-severity incident." },
  { name: "New City Launch", blurb: "City + venue + playing area + first sessions created under Hyderabad Central." },
  { name: "High Demand", blurb: "Sessions pushed to almost-full/full; waitlists growing; revenue spiking." },
  { name: "Waitlist Active", blurb: "Full sessions with waitlists; a cancellation frees a seat that is offered to the next person with a live countdown." },
  { name: "Staff Shortage", blurb: "Key crew marked off; coverage gaps on tonight's sessions." },
  { name: "Venue Conflict", blurb: "Venue in maintenance; impacted session cancelled; refunds queued." },
  { name: "Payment Failure", blurb: "Two payments recorded as failed (seats released) and one unpaid hold still counting down." },
  { name: "Weather Cancellation", blurb: "Outdoor session cancelled for rain; bookings cancelled; refunds queued." },
  { name: "Safety Incident", blurb: "High-severity incident escalated; session flagged; safety signal raised." },
  { name: "Tournament Day", blurb: "Brackets live, scores submitted, winners advancing across two tournaments." }
];

export const SCENARIO_NAMES = SCENARIOS.map((s) => s.name);

/* ------------------------------ local helpers ------------------------------ */

const clone = (state: PrototypeState): PrototypeState =>
  JSON.parse(JSON.stringify(state)) as PrototypeState;

const nowAudit = (name: string): AuditEvent => ({
  id: `aud-scn-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  sessionId: undefined,
  action: "Scenario Loaded",
  operatorId: "op-1",
  timestamp: "Just now",
  description: `Demo scenario "${name}" applied to prototype state.`
});

const signal = (kind: Signal["kind"], message: string, sessionId?: string, at = "Just now"): Signal => ({
  id: `sg-scn-${kind}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
  kind,
  message,
  sessionId,
  at,
  read: false
});

/* ---------------------------- booking helpers ---------------------------- */

const SCENARIO_OPERATOR = "op-5";

/** Book and record payment through the booking services, so data stays canonical. */
function bookPaid(state: PrototypeState, sessionId: string, alias: string, payment: PaymentRecordInput): PrototypeState {
  const held = createBookingReservation(state, { sessionId, alias, operatorId: SCENARIO_OPERATOR, source: "customer-app" });
  if (held.error || !held.booking) return state;
  const paid = confirmBookingPayment(held.state, held.booking.id, payment, SCENARIO_OPERATOR);
  return paid.error ? held.state : paid.state;
}

function hold(state: PrototypeState, sessionId: string, alias: string): { state: PrototypeState; bookingId?: string } {
  const held = createBookingReservation(state, { sessionId, alias, operatorId: SCENARIO_OPERATOR, source: "customer-app" });
  return { state: held.state, bookingId: held.booking?.id };
}

function waitlist(state: PrototypeState, sessionId: string, alias: string): PrototypeState {
  return joinWaitlist(state, { sessionId, alias, operatorId: SCENARIO_OPERATOR }).state;
}

/* ---------------------------- scenario transforms ---------------------------- */

export const applyScenario = (name: string, state: PrototypeState): PrototypeState => {
  let next = clone(state);

  switch (name) {
    case "Normal Weekend": {
      next = bookPaid(next, "s-7", "MonopolyMan", { method: "upi", reference: "UTR401882310977" });
      next = bookPaid(next, "s-7", "PuzzlePete", { method: "card", reference: "POS-771204" });
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "New City Launch": {
      const cityId = "c-chn";
      if (!next.cities.some((c) => c.id === cityId)) {
        next.cities.push({
          id: cityId,
          territoryId: "hvd-central",
          name: "Chennai",
          state: "Tamil Nadu",
          launchDate: "Today",
          managerId: "op-4",
          supportedCategories: ["cat-cricket", "cat-badminton", "cat-tt"],
          status: "active",
          notes: "Launch city for the new expansion corridor."
        });
        next.venues.push({
          id: "v-7",
          territoryId: "hvd-central",
          cityId,
          name: "Marina Arena",
          address: "Kamarajar Salai, Marina, Chennai",
          contactPerson: "Priya V",
          contactNumber: "+91 98765 43270",
          type: "arena",
          operatingHours: "06:00 - 23:00",
          supportedActivities: ["cat-cricket", "cat-badminton", "cat-tt"],
          safetyCapacity: 110,
          staffCapacity: 7,
          spectatorAllowance: 30,
          equipmentAvailable: ["Cricket nets", "Badminton posts", "TT tables"],
          accessibility: true,
          parking: true,
          washrooms: true,
          lighting: true,
          isIndoor: true,
          weatherDependent: false,
          costPerSlot: 1600,
          revenueModel: "fixed",
          cancellationTerms: "24h prior full refund",
          emergencyExits: "2 hall exits",
          firstAid: true,
          safetyContact: "+91 98765 43271",
          incidentNotes: "Launch venue — induction pending.",
          verificationStatus: "pending",
          status: "ready"
        });
        next.playingAreas.push({
          id: "pa-8",
          venueId: "v-7",
          name: "Court 1",
          activityCompatibility: ["cat-badminton", "cat-tt"],
          maxCapacity: 8,
          staffCapacity: 1,
          spectatorCapacity: 6,
          equipment: ["Posts", "Nets"],
          operatingHours: "06:00 - 23:00",
          status: "active",
          restrictions: "Non-marking shoes mandatory"
        });
        next.sessions.push({
          id: "s-14",
          templateId: "et-2",
          categoryId: "cat-badminton",
          territoryId: "hvd-central",
          cityId,
          venueId: "v-7",
          playingAreaId: "pa-8",
          status: "scheduled",
          date: "Tomorrow",
          startTime: "19:00",
          duration: 120,
          timezone: "IST",
          recurrence: "none",
          bookingOpensAt: "5 Days ago",
          bookingClosesAt: "Tomorrow, 17:00",
          revealAt: "Tomorrow, 18:00",
          checkInOpensAt: "Tomorrow, 18:45",
          minParticipants: 10,
          targetParticipants: 16,
          maxParticipants: 16,
          compSlots: 1,
          blockedSlots: 0,
          waitlistEnabled: true,
          waitlistOfferExpiryMins: 15,
          basePrice: 349,
          discountAmount: 0,
          promoEligible: true,
          finalPrice: 349,
          leadCoordinatorId: "op-7",
          supportingCoordinatorId: "",
          refereeId: "",
          safetyContactId: "op-9",
          equipmentHandlerId: "",
          equipmentChecklist: ["Shuttles", "Net"],
          weatherRisk: "low",
          cancellationThreshold: 10
        });
      }
      next.signals.unshift(signal("system", "Chennai launch: Marina Arena + 1 session added under Hyderabad Central.", "s-14"));
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "High Demand": {
      // Night Badminton League is already full: demand builds on its waitlist.
      for (const alias of ["RallyKing", "ShuttleShark", "DinkQueen"]) next = waitlist(next, "s-2", alias);
      // Mumbai Turf Cricket fills up to almost full.
      const cricketers = ["SixShooter", "YorkerYash", "GoogleyGuru", "PowerPlay", "SillyPoint", "ReverseSweep", "SlogSweep"];
      cricketers.forEach((alias, i) => {
        next = bookPaid(next, "s-8", alias, i % 2 ? { method: "card", reference: `POS-88${1200 + i}` } : { method: "upi", reference: `UTR40199${7310 + i}` });
      });
      next.analytics = next.analytics.map((d) =>
        d.label === "Sat" ? { ...d, revenue: d.revenue + 2400, bookings: d.bookings + 6, fill: Math.min(96, d.fill + 4) } : d
      );
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "Waitlist Active": {
      // Women's Social Badminton is full: three people join its waitlist, then a
      // cancellation frees a seat that is offered automatically to the first.
      for (const alias of ["ShuttleSam", "NetNinja", "BaselineBea"]) next = waitlist(next, "s-3", alias);
      const cancelled = cancelBooking(next, "b-41", { reason: "Customer can no longer attend" }, SCENARIO_OPERATOR);
      if (!cancelled.error) next = cancelled.state;
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "Staff Shortage": {
      next.crew = next.crew.map((c) =>
        c.id === "c-1" || c.id === "c-5"
          ? { ...c, status: "off" as const, assignment: "Call out — coverage gap" }
          : c
      );
      next.sessions = next.sessions.map((s) =>
        s.id === "s-2" ? { ...s, supportingCoordinatorId: "" } : s
      );
      next.signals.unshift(signal("system", "STAFF SHORTAGE: Aisha Khan (lead) and Divya Reddy (safety) unavailable tonight.", "s-2"));
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "Venue Conflict": {
      next.venues = next.venues.map((v) => (v.id === "v-1" ? { ...v, status: "maintenance" as const } : v));
      const cancelled = cancelSession(next, "s-2", "Hitex Hall A closed for maintenance", "op-4");
      if (!cancelled.error) next = cancelled.state;
      next.incidents.push({
        id: "i-vc-1",
        sessionId: "s-2",
        reporterId: "op-4",
        type: "Venue conflict",
        severity: "high",
        time: "Just now",
        peopleInvolved: [],
        immediateAction: "Cancelled the affected session; refund requests created for Finance",
        medicalAssistance: false,
        escalatedToVenue: true,
        status: "escalated",
        notes: "Hitex Hall A flagged for maintenance; Night Badminton League cancelled.",
        ownerId: "op-4"
      });
      next.signals.unshift(signal("alert", "Venue conflict: Hitex Hall A in maintenance. Night Badminton League cancelled and refunds requested.", "s-2"));
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "Payment Failure": {
      const a = hold(next, "s-8", "ChaseMercy");
      next = a.state;
      if (a.bookingId) {
        const failed = failBookingPayment(next, a.bookingId, "UPI collect request declined by the customer", SCENARIO_OPERATOR);
        if (!failed.error) next = failed.state;
      }
      const b = hold(next, "s-7", "RollTheDice");
      next = b.state;
      if (b.bookingId) {
        const failed = failBookingPayment(next, b.bookingId, "Card declined by the issuing bank", SCENARIO_OPERATOR);
        if (!failed.error) next = failed.state;
      }
      next = hold(next, "s-8", "RetryRaj").state;
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "Weather Cancellation": {
      const cancelled = cancelSession(next, "s-1", "Heavy rain — outdoor cricket cancelled under the weather policy", "op-4");
      if (!cancelled.error) next = cancelled.state;
      next.incidents.push({
        id: "i-wx-1",
        sessionId: "s-1",
        reporterId: "op-4",
        type: "Weather — cancelled",
        severity: "high",
        time: "Just now",
        peopleInvolved: [],
        immediateAction: "Cancelled outdoor cricket; refund requests created for Finance",
        medicalAssistance: false,
        escalatedToVenue: true,
        status: "escalated",
        notes: "Heavy rain on Jubilee Grounds. Session s-1 cancelled under weather policy.",
        ownerId: "op-4"
      });
      next.signals.unshift(signal("system", "Weather: Evening Box Cricket cancelled (rain). Refund requests created for every paid booking.", "s-1"));
      next.analytics = next.analytics.map((d) =>
        d.label === "Sat" ? { ...d, revenue: Math.max(0, d.revenue - 3400), bookings: Math.max(0, d.bookings - 8), fill: Math.max(0, d.fill - 6) } : d
      );
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "Safety Incident": {
      // A high-severity injury on s-1, escalated to the venue, with a refund exception waiting for Finance.
      const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
      const session = next.sessions.find((s) => s.id === "s-1");
      const incidentId = "i-si-1";
      if (!next.incidents.some((i) => i.id === incidentId)) {
        next.incidents.push({
          id: incidentId,
          incidentCode: "INC-HVD-SI1",
          sessionId: "s-1",
          territoryId: session?.territoryId ?? "hvd-central",
          cityId: session?.cityId,
          venueId: session?.venueId,
          category: "injury",
          severity: "high",
          status: "escalated",
          reportedBy: "op-7",
          reportedAt: iso(12),
          occurredAt: iso(15),
          acknowledgedAt: iso(10),
          acknowledgedBy: "op-5",
          triagedAt: iso(8),
          triagedBy: "op-5",
          escalatedAt: iso(6),
          escalationReason: "Participant needs transport; venue duty manager informed.",
          participantTemporaryIds: ["CR-06"],
          staffIds: ["op-7", "op-5"],
          immediateAction: "Ice pack applied, transport called, venue duty manager informed",
          medicalAssistance: true,
          venueEscalated: true,
          followUpOwnerId: "op-9",
          followUpDueAt: iso(-24 * 60),
          evidenceItemIds: [],
          notes: "Twisted ankle on wet turf. Participant stable and waiting for pickup.",
          triageSeverityReview: "Severity confirmed as high",
          triageImmediateRisk: "Wet turf may cause further slips",
          triageRecommendation: "Pause play on the wet end of the pitch and escalate to the venue.",
          createdAt: iso(12),
          updatedAt: iso(6)
        });
      }
      next.sessions = next.sessions.map((s) => (s.id === "s-1" ? { ...s, weatherRisk: "high" as const } : s));
      if (!next.refundExceptions.some((r) => r.id === "rex-si-1")) {
        next.refundExceptions.push({
          id: "rex-si-1",
          incidentId,
          sessionId: "s-1",
          bookingId: "b-6",
          reason: "safety-incident",
          amount: 499,
          currency: "INR",
          status: "recommended",
          recommendedBy: "op-5",
          recommendedAt: iso(5),
          notes: "Injured participant (CR-06) could not finish the session.",
          createdAt: iso(5),
          updatedAt: iso(5)
        });
      }
      next.signals.unshift(signal("alert", "High-severity injury on Evening Box Cricket escalated to the venue.", "s-1"));
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "Tournament Day": {
      // Both semi-finals of the cricket knockout are played; the second waits for verification.
      // The badminton cup reaches its final. Every slot references entrant ids, never names.
      const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
      const revision = (scoreA: number, scoreB: number, winnerTeamId: string, recordedBy: string, minutesAgo: number, verifiedBy?: string) => ({
        revisionNumber: 1,
        scoreA,
        scoreB,
        winnerTeamId,
        resultType: "score" as const,
        recordedBy,
        recordedAt: iso(minutesAgo),
        ...(verifiedBy ? { verifiedBy, verifiedAt: iso(minutesAgo - 2) } : {})
      });
      next.tournaments = next.tournaments.map((t) =>
        t.id === "tr-1" ? { ...t, status: "live" as const, actualStart: iso(90), updatedAt: iso(5) } : t
      );
      next.tournamentMatches = next.tournamentMatches.map((m) => {
        if (m.id === "m-1") {
          return { ...m, refereeId: m.refereeId ?? "c-2", scoreA: 74, scoreB: 68, winnerTeamId: "tr-1-team-1", status: "verified" as const, resultType: "score" as const, startedAt: iso(90), endedAt: iso(55), verifiedAt: iso(53), verifiedBy: "op-5", resultRevisions: [revision(74, 68, "tr-1-team-1", "op-7", 55, "op-5")] };
        }
        if (m.id === "m-2") {
          return { ...m, refereeId: m.refereeId ?? "c-2", scoreA: 79, scoreB: 82, winnerTeamId: "tr-1-team-3", status: "awaiting-verification" as const, resultType: "score" as const, startedAt: iso(50), endedAt: iso(10), resultRevisions: [revision(79, 82, "tr-1-team-3", "op-7", 10)] };
        }
        if (m.id === "m-5") return { ...m, teamAId: "tr-1-team-1", status: "scheduled" as const };
        if (m.id === "m-4") {
          return { ...m, scoreA: 21, scoreB: 18, winnerTeamId: "tr-2-team-3", status: "verified" as const, resultType: "score" as const, endedAt: iso(12), verifiedAt: iso(11), verifiedBy: "op-2", resultRevisions: [revision(21, 18, "tr-2-team-3", "op-7", 12, "op-2")] };
        }
        if (m.id === "m-6") return { ...m, teamAId: "tr-2-team-1", teamBId: "tr-2-team-3", status: "live" as const, startedAt: iso(5) };
        return m;
      });

      next.signals.unshift(signal("alert", "Badminton Masters Cup final is live: Smash Order v Featherstorm.", undefined));
      next.signals.unshift(signal("system", "Sunday Cricket Knockout: a semi-final result is waiting for verification.", "s-10"));
      next.audits.unshift(nowAudit(name));
      break;
    }

    default:
      break;
  }

  return next;
};
