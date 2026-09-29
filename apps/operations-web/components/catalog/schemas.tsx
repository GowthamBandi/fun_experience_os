import type { PrototypeState } from "@/lib/prototype/scenarios/state";
import type { ActivityCategory, ExperienceTemplate } from "@/lib/prototype/entities";
import type { FormValues, SchemaStep } from "@/components/setup/form";
import { bool, list, num, str } from "@/components/setup/form";
import type { StatusOption } from "@/components/setup/kit";

/* ----------------------------------------------------------------------------
 * Catalog field schemas: activity categories and experiences.
 * ------------------------------------------------------------------------- */

const STAFF_ROLE_OPTIONS = [
  { value: "Coordinator", label: "Coordinator" },
  { value: "Referee", label: "Referee" },
  { value: "Safety contact", label: "Safety contact" },
  { value: "Check-in staff", label: "Check-in staff" },
  { value: "Equipment handler", label: "Equipment handler" },
  { value: "Activity specialist", label: "Activity specialist" },
];

/* -------------------------------- category -------------------------------- */

export const categorySteps = (): SchemaStep[] => [
  {
    label: "Category",
    sub: "Name and description",
    intro: "An activity type, such as badminton or board games. Experiences inherit its defaults.",
    fields: [
      { key: "name", label: "Category name", type: "text", required: true, placeholder: "e.g. Pickleball" },
      { key: "shortCode", label: "Short code", type: "text", required: true, placeholder: "PICKLE", hint: "Used in reports and IDs. Letters and numbers only.", check: (v) => (/^[A-Za-z0-9-]{2,16}$/.test(String(v ?? "")) ? undefined : "Use 2–16 letters, numbers or hyphens.") },
      { key: "description", label: "Description", type: "textarea", required: true, rows: 2 },
      { key: "riskLevel", label: "Physical risk", type: "select", required: true, options: [{ value: "low", label: "Low — seated or gentle" }, { value: "medium", label: "Medium — active sport" }, { value: "high", label: "High — contact or intense" }] },
      { key: "isIndoor", label: "Setting", type: "toggle", description: "Usually played indoors" },
      { key: "weatherDependency", label: "Weather", type: "toggle", description: "Depends on the weather" },
    ],
  },
  {
    label: "Defaults",
    sub: "Group size, time, staffing",
    intro: "Starting values for new experiences in this category. Each experience can override them.",
    fields: [
      { key: "defaultParticipantsMin", label: "Minimum participants", type: "number", required: true, min: 1 },
      { key: "defaultTargetParticipants", label: "Target participants", type: "number", required: true, min: 1 },
      { key: "defaultParticipantsMax", label: "Maximum participants", type: "number", required: true, min: 1 },
      { key: "defaultTeamSize", label: "Team size", type: "number", required: true, min: 1 },
      { key: "defaultDuration", label: "Duration", type: "number", required: true, min: 5, suffix: "min" },
      { key: "defaultAgeMin", label: "Minimum age", type: "number", required: true, min: 0 },
      { key: "defaultAgeMax", label: "Maximum age", type: "number", required: true, min: 1 },
      { key: "refereeRequirement", label: "Referee", type: "select", required: true, options: [{ value: "none", label: "Not needed" }, { value: "optional", label: "Optional" }, { value: "required", label: "Required" }] },
      { key: "safetyContactRequired", label: "Safety contact", type: "toggle", description: "Every session needs a named safety contact" },
    ],
    validate: (v) => {
      const min = num(v.defaultParticipantsMin), max = num(v.defaultParticipantsMax), target = num(v.defaultTargetParticipants);
      if (min > max) return "Minimum participants cannot be more than the maximum.";
      if (target < min || target > max) return "Target participants must sit between the minimum and maximum.";
      if (num(v.defaultAgeMin) >= num(v.defaultAgeMax)) return "Minimum age must be below the maximum age.";
      return undefined;
    },
  },
  {
    label: "Requirements",
    sub: "Equipment and participants",
    fields: [
      { key: "equipmentRequirements", label: "Equipment needed", type: "list", placeholder: "Rackets, Shuttles, Net" },
      { key: "participantRequirements", label: "What participants bring", type: "list", placeholder: "Sports shoes, Water bottle" },
      { key: "accessibilityNotes", label: "Accessibility notes", type: "textarea", rows: 2 },
      { key: "status", label: "Starting status", type: "select", required: true, options: [{ value: "draft", label: "Draft — not yet offered" }, { value: "active", label: "Active — experiences can be scheduled" }] },
    ],
  },
];

export const categoryInitial = (): FormValues => ({
  name: "", shortCode: "", description: "", riskLevel: "low", isIndoor: true, weatherDependency: false,
  defaultParticipantsMin: 4, defaultTargetParticipants: 8, defaultParticipantsMax: 12, defaultTeamSize: 2, defaultDuration: 60,
  defaultAgeMin: 12, defaultAgeMax: 65, refereeRequirement: "none", safetyContactRequired: true,
  equipmentRequirements: [], participantRequirements: [], accessibilityNotes: "", status: "draft",
});

export const categoryFromValues = (v: FormValues): Omit<ActivityCategory, "id"> => ({
  name: str(v.name),
  shortCode: str(v.shortCode).toUpperCase(),
  description: str(v.description),
  icon: "Activity",
  visualTreatment: "accent-neutral",
  riskLevel: (str(v.riskLevel) || "low") as ActivityCategory["riskLevel"],
  isIndoor: bool(v.isIndoor),
  equipmentRequirements: list(v.equipmentRequirements),
  defaultStaffing: ["coordinator", ...(str(v.refereeRequirement) === "required" ? ["referee"] : []), ...(bool(v.safetyContactRequired) ? ["safety"] : [])],
  defaultDuration: num(v.defaultDuration),
  defaultAgeMin: num(v.defaultAgeMin),
  defaultAgeMax: num(v.defaultAgeMax),
  defaultParticipantsMin: num(v.defaultParticipantsMin),
  defaultParticipantsMax: num(v.defaultParticipantsMax),
  defaultTargetParticipants: num(v.defaultTargetParticipants),
  defaultTeamSize: num(v.defaultTeamSize),
  defaultCoordinatorRequired: true,
  refereeRequirement: (str(v.refereeRequirement) || "none") as ActivityCategory["refereeRequirement"],
  safetyContactRequired: bool(v.safetyContactRequired),
  participantRequirements: list(v.participantRequirements),
  weatherDependency: bool(v.weatherDependency),
  accessibilityNotes: str(v.accessibilityNotes),
  status: (str(v.status) || "draft") as ActivityCategory["status"],
  traits: [],
  venueCompat: { indoorOutdoor: bool(v.isIndoor) ? "indoor" : "outdoor" },
});

export const categoryValues = (c: ActivityCategory): FormValues => ({
  ...c,
  defaultTargetParticipants: c.defaultTargetParticipants ?? Math.round((c.defaultParticipantsMin + c.defaultParticipantsMax) / 2),
  defaultTeamSize: c.defaultTeamSize ?? 1,
  refereeRequirement: c.refereeRequirement ?? "none",
  safetyContactRequired: c.safetyContactRequired ?? false,
  participantRequirements: c.participantRequirements ?? [],
  weatherDependency: c.weatherDependency ?? false,
  accessibilityNotes: c.accessibilityNotes ?? "",
});

export const CATEGORY_STATUS: StatusOption<NonNullable<ActivityCategory["status"]>>[] = [
  { value: "active", label: "Active", consequence: "Experiences in this category can be activated and scheduled." },
  { value: "draft", label: "Draft", consequence: "Hidden from scheduling while it is being set up." },
  { value: "paused", label: "Paused", consequence: "Its active experiences cannot be scheduled until it is resumed. Existing sessions continue.", needsReason: true },
  { value: "archived", label: "Archived", consequence: "Retired and read-only. Only allowed when no experience in it is active.", needsReason: true },
];

/* ------------------------------- experience ------------------------------- */

export const experienceSteps = (state: PrototypeState): SchemaStep[] => {
  const cats = state.categories.filter((c) => (c.status ?? "active") !== "archived");
  return [
    {
      label: "Basics",
      sub: "Name and category",
      intro: "What customers will see on the session card.",
      fields: [
        { key: "categoryId", label: "Category", type: "select", required: true, options: cats.map((c) => ({ value: c.id, label: `${c.name}${c.status && c.status !== "active" ? ` (${c.status})` : ""}` })) },
        { key: "name", label: "Experience name", type: "text", required: true, placeholder: "e.g. Saturday Mystery Badminton", check: (v) => (state.templates.some((t) => t.name.trim().toLowerCase() === String(v ?? "").trim().toLowerCase()) ? "An experience with this name already exists." : undefined) },
        { key: "shortDesc", label: "Short description", type: "text", required: true, wide: true, placeholder: "One line for the session card" },
        { key: "fullDesc", label: "Full description", type: "textarea", rows: 3 },
        { key: "promise", label: "What we promise", type: "text", wide: true, placeholder: "e.g. Equal play time, new teammates every round" },
      ],
    },
    {
      label: "Format",
      sub: "Who can join",
      fields: [
        { key: "format", label: "Who can join", type: "select", required: true, options: [{ value: "mixed", label: "Mixed" }, { value: "open", label: "Open to all" }, { value: "women", label: "Women only" }, { value: "men", label: "Men only" }] },
        { key: "entryType", label: "Booking type", type: "select", required: true, options: [{ value: "individual", label: "Individuals" }, { value: "duo", label: "Pairs" }, { value: "preformed-team", label: "Pre-formed teams" }] },
        { key: "ageMin", label: "Minimum age", type: "number", required: true, min: 0 },
        { key: "ageMax", label: "Maximum age", type: "number", required: true, min: 1 },
        { key: "competitiveLevel", label: "Level", type: "select", options: [{ value: "casual", label: "Casual" }, { value: "intermediate", label: "Intermediate" }, { value: "competitive", label: "Competitive" }] },
        { key: "verificationRequired", label: "ID check", type: "toggle", description: "Participants must verify their identity before joining" },
        { key: "isTournament", label: "Tournament", type: "toggle", description: "Runs as a tournament with brackets" },
      ],
      validate: (v) => (num(v.ageMin) >= num(v.ageMax) ? "Minimum age must be below the maximum age." : undefined),
    },
    {
      label: "Group size",
      sub: "Participants and teams",
      fields: [
        { key: "minParticipants", label: "Minimum to run", type: "number", required: true, min: 1, hint: "Below this the session is cancelled." },
        { key: "targetParticipants", label: "Ideal group size", type: "number", required: true, min: 1 },
        { key: "maxParticipants", label: "Maximum", type: "number", required: true, min: 1 },
        { key: "teamSize", label: "Team size", type: "number", required: true, min: 1 },
        { key: "numTeams", label: "Number of teams", type: "number", required: true, min: 1 },
        { key: "compSlots", label: "Complimentary places", type: "number", min: 0 },
        { key: "waitlistDefault", label: "Waitlist", type: "toggle", description: "Offer a waitlist when full" },
      ],
      validate: (v) => {
        const min = num(v.minParticipants), max = num(v.maxParticipants), target = num(v.targetParticipants);
        if (min > max) return "The minimum cannot be more than the maximum.";
        if (target < min || target > max) return "The ideal group size must sit between the minimum and maximum.";
        if (num(v.teamSize) > max) return "Team size cannot be larger than the maximum group size.";
        return undefined;
      },
    },
    {
      label: "Timing",
      sub: "Duration and windows",
      fields: [
        { key: "duration", label: "Duration", type: "number", required: true, min: 5, suffix: "min" },
        { key: "checkInWindow", label: "Check-in opens", type: "number", required: true, min: 0, suffix: "min before" },
        { key: "bookingOpenDays", label: "Booking opens", type: "number", required: true, min: 1, suffix: "days before" },
        { key: "bookingCloseHours", label: "Booking closes", type: "number", required: true, min: 1, suffix: "hours before" },
        { key: "lateArrivalMins", label: "Late arrival allowed", type: "number", min: 0, suffix: "min" },
        { key: "completionBufferMins", label: "Clean-up buffer", type: "number", min: 0, suffix: "min" },
      ],
    },
    {
      label: "Price and costs",
      sub: "What customers pay",
      intro: "Costs are per session and are used to check the session breaks even at its minimum size.",
      fields: [
        { key: "basePrice", label: "Price per participant", type: "number", required: true, min: 0, suffix: "₹" },
        { key: "platformFee", label: "Platform fee", type: "number", min: 0, suffix: "₹" },
        { key: "taxAmount", label: "Tax", type: "number", min: 0, suffix: "₹" },
        { key: "venueCost", label: "Venue cost per session", type: "number", min: 0, suffix: "₹" },
        { key: "equipmentCost", label: "Equipment cost per session", type: "number", min: 0, suffix: "₹" },
        { key: "staffingCost", label: "Staffing cost per session", type: "number", min: 0, suffix: "₹" },
        { key: "promoEligible", label: "Promotions", type: "toggle", description: "Promo codes can be used" },
        { key: "refundPolicyTemplate", label: "Refund policy", type: "text", wide: true, placeholder: "Full refund up to 24 hours before start" },
      ],
      extra: (v) => {
        const fixed = num(v.venueCost) + num(v.equipmentCost) + num(v.staffingCost);
        const price = num(v.basePrice);
        const min = num(v.minParticipants);
        const breakEven = price > 0 ? Math.ceil(fixed / price) : 0;
        const ok = price * min >= fixed;
        return (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {fixed === 0
              ? "No per-session costs entered."
              : ok
                ? `Breaks even at ${breakEven} participant${breakEven === 1 ? "" : "s"}; the minimum of ${min} covers the ₹${fixed.toLocaleString("en-IN")} session cost.`
                : `At the minimum of ${min} the session does not cover its ₹${fixed.toLocaleString("en-IN")} cost (needs ${breakEven}). It cannot be activated until price, costs or minimum change.`}
          </div>
        );
      },
    },
    {
      label: "Staffing",
      sub: "Who runs it",
      fields: [
        { key: "requiredRoles", label: "Roles needed", type: "chips", required: true, options: STAFF_ROLE_OPTIONS },
        { key: "coordinatorsCount", label: "Coordinators", type: "number", required: true, min: 1 },
        { key: "refereeRequired", label: "Referee", type: "toggle", description: "A referee must be assigned" },
        { key: "safetyContactRequired", label: "Safety contact", type: "toggle", description: "A safety contact must be assigned" },
        { key: "equipmentHandlerRequired", label: "Equipment handler", type: "toggle", description: "Someone is responsible for equipment" },
        { key: "cancellationThreshold", label: "Cancel if fewer than", type: "number", required: true, min: 1, suffix: "people" },
      ],
    },
    {
      label: "Where it can run",
      sub: "Venue requirements",
      fields: [
        { key: "indoorOutdoorNeed", label: "Setting", type: "select", required: true, options: [{ value: "any", label: "Indoor or outdoor" }, { value: "indoor", label: "Indoor only" }, { value: "outdoor", label: "Outdoor only" }] },
        { key: "minAreaCapacity", label: "Playing area must hold at least", type: "number", min: 0, suffix: "people" },
        { key: "requireVerifiedVenue", label: "Venue safety check", type: "toggle", description: "Only venues whose safety check is verified" },
        { key: "weatherDependency", label: "Weather", type: "toggle", description: "Depends on the weather" },
        { key: "safetyLevel", label: "Safety rating", type: "select", required: true, options: [{ value: "low", label: "Low risk" }, { value: "medium", label: "Medium risk" }, { value: "high", label: "High risk" }] },
      ],
    },
    {
      label: "Reveal and privacy",
      sub: "What participants see",
      intro: "Participants join under a temporary identity. Decide when details are revealed and what is never shown.",
      fields: [
        { key: "revealHoursBefore", label: "Reveal teams and venue", type: "number", required: true, min: 1, suffix: "hours before", check: (val, v) => (num(val) > num(v.bookingCloseHours) ? "Reveal must happen after booking closes (fewer hours before start)." : undefined) },
        { key: "tempIdFormat", label: "Temporary ID format", type: "text", required: true, placeholder: "PX-####" },
        { key: "aliasStyle", label: "Alias style", type: "select", required: true, options: [{ value: "Heroic", label: "Heroic (e.g. Swift Falcon)" }, { value: "Nature", label: "Nature (e.g. Quiet River)" }, { value: "Numbers", label: "Numbers only" }] },
        { key: "teamAssignmentMethod", label: "Team assignment", type: "select", required: true, options: [{ value: "random", label: "Random" }, { value: "balanced", label: "Balanced by level" }, { value: "preformed", label: "Pre-formed teams" }] },
        { key: "anonymousJoinedCount", label: "Joined count", type: "toggle", description: "Hide how many people have joined until reveal" },
        { key: "infoRevealed", label: "Revealed to participants", type: "list", placeholder: "Team name, Court number" },
        { key: "infoNeverRevealed", label: "Never revealed", type: "list", placeholder: "Phone number, Full name" },
      ],
    },
    {
      label: "Checklists",
      sub: "Equipment and status",
      fields: [
        { key: "equipmentChecklist", label: "Equipment checklist", type: "list", placeholder: "Nets, Shuttles, First-aid kit" },
        { key: "participantChecklist", label: "Participant checklist", type: "list", placeholder: "Non-marking shoes, Water bottle" },
        { key: "internalNote", label: "Internal note", type: "textarea", rows: 2, placeholder: "Visible to operators only" },
        { key: "status", label: "When created", type: "select", required: true, options: [{ value: "draft", label: "Save as draft" }, { value: "active", label: "Activate now (must pass readiness checks)" }] },
      ],
    },
  ];
};

export const experienceInitial = (state: PrototypeState, categoryId?: string): FormValues => {
  const cat = state.categories.find((c) => c.id === categoryId) ?? state.categories.find((c) => (c.status ?? "active") === "active");
  const min = cat?.defaultParticipantsMin ?? 8;
  const max = cat?.defaultParticipantsMax ?? 16;
  return {
    categoryId: cat?.id ?? "", name: "", shortDesc: "", fullDesc: "", promise: "",
    format: "mixed", entryType: "individual", ageMin: cat?.defaultAgeMin ?? 18, ageMax: cat?.defaultAgeMax ?? 60, competitiveLevel: "casual", verificationRequired: false, isTournament: false,
    minParticipants: min, targetParticipants: cat?.defaultTargetParticipants ?? Math.round((min + max) / 2), maxParticipants: max, teamSize: cat?.defaultTeamSize ?? 2, numTeams: 2, compSlots: 0, waitlistDefault: true,
    duration: cat?.defaultDuration ?? 90, checkInWindow: 30, bookingOpenDays: 7, bookingCloseHours: 3, lateArrivalMins: 10, completionBufferMins: 15,
    basePrice: 399, platformFee: 30, taxAmount: 0, venueCost: 1000, equipmentCost: 0, staffingCost: 0, promoEligible: true, refundPolicyTemplate: "Full refund up to 24 hours before start",
    requiredRoles: ["Coordinator", ...(cat?.safetyContactRequired ? ["Safety contact"] : [])], coordinatorsCount: 1, refereeRequired: cat?.refereeRequirement === "required", safetyContactRequired: cat?.safetyContactRequired ?? true, equipmentHandlerRequired: false, cancellationThreshold: min,
    indoorOutdoorNeed: "any", minAreaCapacity: 0, requireVerifiedVenue: false, weatherDependency: cat?.weatherDependency ?? false, safetyLevel: cat?.riskLevel ?? "low",
    revealHoursBefore: 2, tempIdFormat: "PX-####", aliasStyle: "Heroic", teamAssignmentMethod: "random", anonymousJoinedCount: true, infoRevealed: ["Team name", "Playing area"], infoNeverRevealed: ["Phone number", "Full name"],
    equipmentChecklist: cat?.equipmentRequirements ?? [], participantChecklist: cat?.participantRequirements ?? [], internalNote: "", status: "draft",
  };
};

export const experienceFromValues = (v: FormValues): Omit<ExperienceTemplate, "id"> => ({
  categoryId: str(v.categoryId),
  name: str(v.name),
  shortDesc: str(v.shortDesc),
  fullDesc: str(v.fullDesc),
  objective: str(v.promise),
  promise: str(v.promise),
  status: (str(v.status) || "draft") as ExperienceTemplate["status"],
  format: (str(v.format) || "mixed") as ExperienceTemplate["format"],
  isTournament: bool(v.isTournament),
  ageMin: num(v.ageMin),
  ageMax: num(v.ageMax),
  verificationRequired: bool(v.verificationRequired),
  minParticipants: num(v.minParticipants),
  targetParticipants: num(v.targetParticipants),
  maxParticipants: num(v.maxParticipants),
  teamSize: num(v.teamSize, 1),
  numTeams: num(v.numTeams, 1),
  spectatorAllowance: 0,
  compSlots: num(v.compSlots),
  blockedSlots: 0,
  duration: num(v.duration),
  checkInWindow: num(v.checkInWindow),
  bookingOpenDays: num(v.bookingOpenDays, 7),
  bookingCloseHours: num(v.bookingCloseHours, 3),
  revealHoursBefore: num(v.revealHoursBefore, 2),
  lateArrivalMins: num(v.lateArrivalMins),
  completionBufferMins: num(v.completionBufferMins),
  basePrice: num(v.basePrice),
  taxAmount: num(v.taxAmount),
  platformFee: num(v.platformFee),
  venueCost: num(v.venueCost),
  equipmentCost: num(v.equipmentCost),
  staffingCost: num(v.staffingCost),
  promoEligible: bool(v.promoEligible),
  refundPolicyTemplate: str(v.refundPolicyTemplate),
  requiredRoles: list(v.requiredRoles),
  coordinatorsCount: num(v.coordinatorsCount, 1),
  refereeRequired: bool(v.refereeRequired),
  safetyContactRequired: bool(v.safetyContactRequired),
  equipmentHandlerRequired: bool(v.equipmentHandlerRequired),
  equipmentChecklist: list(v.equipmentChecklist),
  participantChecklist: list(v.participantChecklist),
  weatherDependency: bool(v.weatherDependency),
  cancellationThreshold: num(v.cancellationThreshold, 1),
  anonymousJoinedCount: bool(v.anonymousJoinedCount),
  showJoinedCountBeforeReveal: !bool(v.anonymousJoinedCount),
  tempIdFormat: str(v.tempIdFormat),
  aliasStyle: str(v.aliasStyle),
  teamAssignmentRule: str(v.teamAssignmentMethod) || "random",
  teamAssignmentMethod: (str(v.teamAssignmentMethod) || "random") as ExperienceTemplate["teamAssignmentMethod"],
  revealTimeMinsBefore: num(v.revealHoursBefore, 2) * 60,
  infoRevealed: list(v.infoRevealed),
  infoNeverRevealed: list(v.infoNeverRevealed),
  entryType: (str(v.entryType) || "individual") as ExperienceTemplate["entryType"],
  competitiveLevel: str(v.competitiveLevel),
  internalNote: str(v.internalNote),
  waitlistDefault: bool(v.waitlistDefault),
  safetyLevel: (str(v.safetyLevel) || "low") as ExperienceTemplate["safetyLevel"],
  prizeVerificationRequired: bool(v.isTournament),
  venueCompat: {
    indoorOutdoorNeed: (str(v.indoorOutdoorNeed) || "any") as NonNullable<ExperienceTemplate["venueCompat"]>["indoorOutdoorNeed"],
    minAreaCapacity: num(v.minAreaCapacity) || undefined,
    requiredVenueVerification: bool(v.requireVerifiedVenue) ? "verified" : "any",
  },
});

export const experienceValues = (t: ExperienceTemplate): FormValues => ({
  ...t,
  competitiveLevel: t.competitiveLevel ?? "casual",
  entryType: t.entryType ?? "individual",
  staffingCost: t.staffingCost ?? 0,
  equipmentHandlerRequired: t.equipmentHandlerRequired ?? false,
  waitlistDefault: t.waitlistDefault ?? true,
  teamAssignmentMethod: t.teamAssignmentMethod ?? (t.teamAssignmentRule === "balanced" ? "balanced" : "random"),
  indoorOutdoorNeed: t.venueCompat?.indoorOutdoorNeed ?? "any",
  minAreaCapacity: t.venueCompat?.minAreaCapacity ?? 0,
  requireVerifiedVenue: t.venueCompat?.requiredVenueVerification === "verified",
  safetyLevel: t.safetyLevel ?? "low",
  internalNote: t.internalNote ?? "",
});

export const EXPERIENCE_STATUS: StatusOption<ExperienceTemplate["status"]>[] = [
  { value: "active", label: "Active", consequence: "Available to schedule. It must pass every readiness check and its category must be active." },
  { value: "ready", label: "Ready", consequence: "Checked and waiting to go live. Not yet schedulable." },
  { value: "draft", label: "Draft", consequence: "Back to editing. New sessions cannot be scheduled from it." },
  { value: "paused", label: "Paused", consequence: "Existing sessions continue; no new sessions can be scheduled until it is resumed.", needsReason: true },
  { value: "archived", label: "Archived", consequence: "Retired and read-only. Only allowed when no upcoming session uses it. Duplicate it to reuse.", needsReason: true },
];
