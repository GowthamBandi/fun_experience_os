import type { PrototypeState } from "./state";
import type { AuditEvent, Signal } from "../entities";

export interface ScenarioDef {
  name: string;
  blurb: string;
}

export const SCENARIOS: ScenarioDef[] = [
  { name: "Normal Weekend", blurb: "Balanced baseline — steady fills, settled payments, one low-severity incident." },
  { name: "New City Launch", blurb: "City + venue + playing area + first sessions created under Hyderabad Central." },
  { name: "High Demand", blurb: "Sessions pushed to almost-full/full; waitlists growing; revenue spiking." },
  { name: "Waitlist Active", blurb: "Waitlist offers extended with countdown expiries across three sessions." },
  { name: "Staff Shortage", blurb: "Key crew marked off; coverage gaps on tonight's sessions." },
  { name: "Venue Conflict", blurb: "Venue in maintenance; impacted session cancelled; refunds queued." },
  { name: "Payment Failure", blurb: "Failed payments + failed transactions on the Mumbai turf session." },
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

/* ---------------------------- scenario transforms ---------------------------- */

export const applyScenario = (name: string, state: PrototypeState): PrototypeState => {
  const next = clone(state);

  switch (name) {
    case "Normal Weekend": {
      next.sessions = next.sessions.map((s) => (s.id === "s-2" ? { ...s, status: "almost-full" as const } : s));
      next.bookings.push(
        { id: "b-nw-1", sessionId: "s-7", alias: "MonopolyMan", phoneMask: "•••• 71", tempId: "BG-04", amount: 199, status: "payment-confirmed", createdAt: "Today, 17:20", method: "upi" },
        { id: "b-nw-2", sessionId: "s-7", alias: "PuzzlePete", phoneMask: "•••• 72", tempId: "BG-05", amount: 199, status: "payment-confirmed", createdAt: "Today, 17:32", method: "card" }
      );
      next.transactions.push(
        { id: "t-nw-1", sessionId: "s-7", territoryId: "blr-south", bookingId: "b-nw-1", kind: "payment", amount: 199, method: "upi", status: "settled", at: "17:20" },
        { id: "t-nw-2", sessionId: "s-7", territoryId: "blr-south", bookingId: "b-nw-2", kind: "payment", amount: 199, method: "card", status: "settled", at: "17:32" }
      );
      next.transactions = next.transactions.map((t) => (t.id === "t-9" ? { ...t, status: "settled" as const } : t));
      next.signals.unshift(signal("join", "MonopolyMan joined Board Games Parlour", "s-7"));
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
      next.sessions = next.sessions.map((s) =>
        s.id === "s-2" ? { ...s, status: "full" as const }
        : s.id === "s-8" ? { ...s, status: "almost-full" as const }
        : s
      );
      next.bookings.push(
        { id: "b-hd-1", sessionId: "s-2", alias: "RallyKing", phoneMask: "•••• 81", tempId: "BM-15", amount: 349, status: "payment-confirmed", createdAt: "Today, 16:10", method: "card" },
        { id: "b-hd-2", sessionId: "s-2", alias: "ShuttleShark", phoneMask: "•••• 82", tempId: "BM-16", amount: 349, status: "payment-confirmed", createdAt: "Today, 16:18", method: "upi" },
        { id: "b-hd-3", sessionId: "s-2", alias: "DinkQueen", phoneMask: "•••• 83", tempId: "", amount: 349, status: "waitlist-joined", createdAt: "Today, 16:25", method: "card", waitlistOrder: 3 },
        { id: "b-hd-4", sessionId: "s-8", alias: "SixShooter", phoneMask: "•••• 84", tempId: "MCR-06", amount: 599, status: "payment-confirmed", createdAt: "Today, 16:30", method: "card" },
        { id: "b-hd-5", sessionId: "s-8", alias: "YorkerYash", phoneMask: "•••• 85", tempId: "", amount: 599, status: "waitlist-joined", createdAt: "Today, 16:35", method: "upi", waitlistOrder: 2 }
      );
      next.transactions.push(
        { id: "t-hd-1", sessionId: "s-2", territoryId: "hvd-central", bookingId: "b-hd-1", kind: "payment", amount: 349, method: "card", status: "settled", at: "16:10" },
        { id: "t-hd-2", sessionId: "s-2", territoryId: "hvd-central", bookingId: "b-hd-2", kind: "payment", amount: 349, method: "upi", status: "settled", at: "16:18" },
        { id: "t-hd-3", sessionId: "s-8", territoryId: "mum-west", bookingId: "b-hd-4", kind: "payment", amount: 599, method: "card", status: "settled", at: "16:30" }
      );
      next.signals.unshift(
        signal("alert", "Night Badminton League is FULL. Waitlist has 3.", "s-2"),
        signal("alert", "Mumbai Turf Cricket is almost full. 1 seat left.", "s-8")
      );
      next.analytics = next.analytics.map((d) =>
        d.label === "Sat" ? { ...d, revenue: d.revenue + 2400, bookings: d.bookings + 6, fill: Math.min(96, d.fill + 4) } : d
      );
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "Waitlist Active": {
      next.bookings = next.bookings.map((b) =>
        b.id === "b-w1" || b.id === "b-w2" || b.id === "b-w3" || b.id === "b-w8"
          ? { ...b, status: "waitlist-promoted" as const, waitlistOfferExpiresAt: "19:45" }
          : b
      );
      next.signals.unshift(
        signal("system", "Waitlist offer extended to SquareTurn (s-1). Expires 19:45.", "s-1"),
        signal("system", "Waitlist offers extended on Night Badminton League (2 offers). Expires 19:45.", "s-2"),
        signal("system", "Waitlist offer extended to BlazerFox (s-8). Expires 19:45.", "s-8")
      );
      next.promoCodes = next.promoCodes.map((p) =>
        p.code === "DOUBLESUP" ? p : p
      );
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
      next.sessions = next.sessions.map((s) => (s.id === "s-2" ? { ...s, status: "cancelled" as const } : s));
      next.bookings = next.bookings.map((b) =>
        b.sessionId === "s-2"
          ? { ...b, status: ("cancelled" as const) }
          : b
      );
      next.bookings.filter((b) => b.sessionId === "s-2" && b.status === "cancelled").forEach((b) => {
        if (b.amount > 0 && !next.transactions.some((t) => t.bookingId === b.id && t.kind === "refund")) {
          next.transactions.push({
            id: `t-vc-${b.id}`,
            sessionId: "s-2",
            territoryId: "hvd-central",
            bookingId: b.id,
            kind: "refund",
            amount: -b.amount,
            method: "card",
            status: "pending",
            at: "Just now"
          });
        }
      });
      next.incidents.push({
        id: "i-vc-1",
        sessionId: "s-2",
        reporterId: "op-4",
        type: "Venue conflict",
        severity: "high",
        time: "Just now",
        peopleInvolved: [],
        immediateAction: "Cancelled impacted session, queued refunds",
        medicalAssistance: false,
        escalatedToVenue: true,
        status: "escalated",
        notes: "Hitex Hall A flagged for maintenance; Night Badminton League cancelled.",
        ownerId: "op-4"
      });
      next.signals.unshift(signal("alert", "VENUE CONFLICT: Hitex Hall A in maintenance. s-2 cancelled, refunds queued.", "s-2"));
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "Payment Failure": {
      next.bookings.push({
        id: "b-pf-1",
        sessionId: "s-8",
        alias: "ChaseMercy",
        phoneMask: "•••• 91",
        tempId: "",
        amount: 599,
        status: "payment-failed",
        createdAt: "Today, 17:15",
        method: "upi"
      });
      next.transactions.push(
        { id: "t-pf-1", sessionId: "s-8", territoryId: "mum-west", bookingId: "b-pf-1", kind: "payment", amount: 599, method: "upi", status: "failed", at: "17:15" },
        { id: "t-pf-2", sessionId: "s-7", territoryId: "blr-south", bookingId: "b-49", kind: "payment", amount: 199, method: "upi", status: "failed", at: "17:20" }
      );
      next.bookings = next.bookings.map((b) => (b.id === "b-49" ? { ...b, status: "payment-pending" as const } : b));
      next.signals.unshift(
        signal("system", "UPI payment failed for ChaseMercy on Mumbai Turf Cricket (₹599).", "s-8"),
        signal("system", "Payment retry pending for DiceRoller on Board Games Parlour.", "s-7")
      );
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "Weather Cancellation": {
      next.sessions = next.sessions.map((s) => (s.id === "s-1" ? { ...s, status: "cancelled" as const } : s));
      next.bookings = next.bookings.map((b) =>
        b.sessionId === "s-1" ? { ...b, status: ("cancelled" as const) } : b
      );
      next.bookings.filter((b) => b.sessionId === "s-1").forEach((b) => {
        if (b.amount > 0 && !next.transactions.some((t) => t.bookingId === b.id && t.kind === "refund")) {
          next.transactions.push({
            id: `t-wx-${b.id}`,
            sessionId: "s-1",
            territoryId: "hvd-central",
            bookingId: b.id,
            kind: "refund",
            amount: -b.amount,
            method: "card",
            status: "pending",
            at: "Just now"
          });
        }
      });
      next.incidents.push({
        id: "i-wx-1",
        sessionId: "s-1",
        reporterId: "op-4",
        type: "Weather — cancelled",
        severity: "high",
        time: "Just now",
        peopleInvolved: [],
        immediateAction: "Cancelled outdoor cricket, refunds queued",
        medicalAssistance: false,
        escalatedToVenue: true,
        status: "escalated",
        notes: "Heavy rain on Jubilee Grounds. Session s-1 cancelled under weather policy.",
        ownerId: "op-4"
      });
      next.signals.unshift(signal("system", "WEATHER: Evening Box Cricket cancelled (rain). 8 refunds queued.", "s-1"));
      next.analytics = next.analytics.map((d) =>
        d.label === "Sat" ? { ...d, revenue: Math.max(0, d.revenue - 3400), bookings: Math.max(0, d.bookings - 8), fill: Math.max(0, d.fill - 6) } : d
      );
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "Safety Incident": {
      next.incidents.push({
        id: "i-si-1",
        sessionId: "s-1",
        reporterId: "op-7",
        type: "Participant injury",
        severity: "high",
        time: "Just now",
        peopleInvolved: ["CR-06"],
        immediateAction: "Ice pack applied, transport called, escalated to venue",
        medicalAssistance: true,
        escalatedToVenue: true,
        status: "escalated",
        notes: "Twisted ankle on wet turf. Participant stable, awaiting pickup.",
        ownerId: "op-4"
      });
      next.sessions = next.sessions.map((s) => (s.id === "s-1" ? { ...s, weatherRisk: "high" as const } : s));
      next.transactions.push({
        id: "t-si-1",
        sessionId: "s-1",
        territoryId: "hvd-central",
        bookingId: "b-6",
        kind: "adjustment",
        amount: -99,
        method: "adjustment",
        status: "pending",
        at: "Just now"
      });
      next.signals.unshift(signal("alert", "CRITICAL: Safety incident on Evening Box Cricket. Escalated to venue.", "s-1"));
      next.audits.unshift(nowAudit(name));
      break;
    }

    case "Tournament Day": {
      next.tournaments = next.tournaments.map((t) => {
        if (t.id === "tr-1") {
          return {
            ...t,
            status: "live" as const,
            brackets: [
              { id: "m-1", tournamentId: "tr-1", round: "Semi-finals", teamA: "Ravi's XI", teamB: "Midnight Drive", scoreA: 74, scoreB: 68, winner: "Ravi's XI", status: "completed" as const, refereeId: "op-5" },
              { id: "m-2", tournamentId: "tr-1", round: "Semi-finals", teamA: "Net Runners", teamB: "Smash Order", scoreA: 82, scoreB: 79, winner: "Net Runners", status: "completed" as const, refereeId: "op-5" },
              { id: "m-5", tournamentId: "tr-1", round: "Final", teamA: "Ravi's XI", teamB: "Net Runners", status: "live" as const, refereeId: "op-5" }
            ]
          };
        }
        if (t.id === "tr-2") {
          return {
            ...t,
            brackets: [
              { id: "m-3", tournamentId: "tr-2", round: "Semi-finals", teamA: "Smash Order", teamB: "Net Kings", scoreA: 21, scoreB: 14, winner: "Smash Order", status: "completed" as const, refereeId: "op-7" },
              { id: "m-4", tournamentId: "tr-2", round: "Semi-finals", teamA: "Featherstorm", teamB: "Backline", scoreA: 21, scoreB: 18, winner: "Featherstorm", status: "completed" as const, refereeId: "op-7" },
              { id: "m-6", tournamentId: "tr-2", round: "Final", teamA: "Smash Order", teamB: "Featherstorm", status: "live" as const, refereeId: "op-7" }
            ]
          };
        }
        return t;
      });
      next.signals.unshift(signal("system", "TOURNAMENT DAY: Finals live — Ravi's XI vs Net Runners, Smash Order vs Featherstorm.", "s-10"));
      next.audits.unshift(nowAudit(name));
      break;
    }

    default:
      break;
  }

  return next;
};
