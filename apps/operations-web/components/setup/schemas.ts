import type { PrototypeState } from "@/lib/prototype/scenarios/state";
import type { City, Franchise, PlayingArea, Territory, Venue } from "@/lib/prototype/entities";
import type { FieldDef, FormValues, SchemaStep } from "@/components/setup/form";
import { bool, list, num, str } from "@/components/setup/form";
import type { StatusOption } from "@/components/setup/kit";
import type { RoleId } from "@/lib/types";

/* ----------------------------------------------------------------------------
 * Field schemas and status options for the setup hierarchy. One definition
 * drives the create wizard, the edit drawer and the review step.
 * ------------------------------------------------------------------------- */

const MANAGER_ROLES: RoleId[] = ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager"];

const operatorOptions = (state: PrototypeState, roles: RoleId[] = MANAGER_ROLES) =>
  state.operators
    .filter((o) => o.status === "active" && roles.includes(o.role))
    .map((o) => ({ value: o.id, label: `${o.name} — ${o.title}` }));

const categoryOptions = (state: PrototypeState) =>
  state.categories.filter((c) => (c.status ?? "active") !== "archived").map((c) => ({ value: c.id, label: c.name }));

const today = () => new Date().toISOString().slice(0, 10);

/* -------------------------------- franchise -------------------------------- */

export const franchiseSteps = (): SchemaStep[] => [
  {
    label: "Business",
    sub: "Name and legal entity",
    intro: "The business that runs this operating area and signs its venue and staff contracts.",
    fields: [
      { key: "name", label: "Franchise name", type: "text", required: true, placeholder: "e.g. Coastal Sports Collective", wide: true },
      { key: "legalEntity", label: "Registered legal entity", type: "text", required: true, placeholder: "e.g. Coastal Sports LLP" },
      { key: "type", label: "Franchise type", type: "select", required: true, options: [{ value: "regional", label: "Regional franchise" }, { value: "master", label: "Master franchise (runs regional franchises)" }] },
      { key: "isInternal", label: "Ownership", type: "toggle", description: "Owned and operated by the platform itself" },
    ],
  },
  {
    label: "People and terms",
    sub: "Head, contact, revenue share",
    intro: "Who is accountable, how to reach them, and the platform's share of settled revenue.",
    fields: [
      { key: "franchiseHead", label: "Franchise head", type: "text", required: true, placeholder: "Full name" },
      { key: "contactDetails", label: "Contact email or phone", type: "text", required: true, placeholder: "ops@example.com", check: (v) => (/@|\d{6,}/.test(String(v ?? "")) ? undefined : "Include an email address or phone number.") },
      { key: "revenueShare", label: "Platform revenue share", type: "number", required: true, min: 0, max: 100, step: 0.5, suffix: "%" },
      { key: "startDate", label: "Start date", type: "date", required: true },
      { key: "notes", label: "Notes", type: "textarea", rows: 3, placeholder: "Anything the next operator should know" },
    ],
  },
];

export const franchiseInitial = (): FormValues => ({ name: "", legalEntity: "", type: "regional", isInternal: false, franchiseHead: "", contactDetails: "", revenueShare: 15, startDate: today(), notes: "" });

export const franchiseFromValues = (v: FormValues): Omit<Franchise, "id"> => ({
  name: str(v.name),
  type: str(v.type) || "regional",
  isInternal: bool(v.isInternal),
  legalEntity: str(v.legalEntity),
  assignedTerritories: [],
  franchiseHead: str(v.franchiseHead),
  revenueShare: num(v.revenueShare),
  startDate: str(v.startDate),
  status: "active",
  contactDetails: str(v.contactDetails),
  notes: str(v.notes),
});

export const franchiseValues = (f: Franchise): FormValues => ({ ...f });

export const FRANCHISE_STATUS: StatusOption<Franchise["status"]>[] = [
  { value: "active", label: "Active", consequence: "The franchise operates normally. Territories it paused are restored to active." },
  { value: "inactive", label: "Paused", consequence: "Every active territory under this franchise is paused. Nothing is deleted.", needsReason: true },
  { value: "suspended", label: "Suspended", consequence: "Use for contract or compliance problems. Territories are paused until the franchise is resumed.", needsReason: true },
];

/* -------------------------------- territory -------------------------------- */

export const territorySteps = (state: PrototypeState, lockFranchise = false): SchemaStep[] => [
  {
    label: "Territory",
    sub: "Name and franchise",
    intro: "A region the franchise runs. Territories scope staff, sessions and reports.",
    fields: [
      {
        key: "franchiseId",
        label: "Franchise",
        type: "select",
        required: true,
        options: state.franchises.filter((f) => f.status === "active" || lockFranchise).map((f) => ({ value: f.id, label: f.name })),
        hint: lockFranchise ? undefined : "Only active franchises can take new territories.",
      },
      { key: "name", label: "Territory name", type: "text", required: true, placeholder: "e.g. Pune West" },
      { key: "state", label: "State", type: "text", required: true, placeholder: "e.g. Maharashtra" },
      { key: "region", label: "Region label", type: "text", placeholder: "e.g. West-1" },
      { key: "type", label: "Territory type", type: "select", required: true, options: [{ value: "urban", label: "Urban" }, { value: "suburban", label: "Suburban" }, { value: "regional", label: "Regional" }] },
    ],
  },
  {
    label: "Operations",
    sub: "Manager, time zone, currency",
    intro: "Who runs the territory day to day and how its sessions are timed and priced.",
    fields: [
      { key: "managerId", label: "Territory manager", type: "select", options: operatorOptions(state), placeholder: "No manager yet", hint: "Operators with a management role. Add operators in Access." },
      { key: "timezone", label: "Time zone", type: "select", required: true, options: [{ value: "IST (UTC+5:30)", label: "India Standard Time (UTC+5:30)" }, { value: "GST (UTC+4)", label: "Gulf Standard Time (UTC+4)" }, { value: "SGT (UTC+8)", label: "Singapore Time (UTC+8)" }] },
      { key: "currency", label: "Currency", type: "select", required: true, options: [{ value: "INR (₹)", label: "Indian rupee (₹)" }, { value: "AED (د.إ)", label: "UAE dirham" }, { value: "SGD ($)", label: "Singapore dollar" }] },
      { key: "contactInfo", label: "Operations contact", type: "text", placeholder: "territory-ops@example.com" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
];

export const territoryInitial = (franchiseId = ""): FormValues => ({ franchiseId, name: "", state: "", region: "", type: "urban", managerId: "", timezone: "IST (UTC+5:30)", currency: "INR (₹)", contactInfo: "", notes: "" });

export const territoryFromValues = (v: FormValues, status: Territory["status"] = "active"): Omit<Territory, "id"> => ({
  franchiseId: str(v.franchiseId),
  name: str(v.name),
  type: str(v.type) || "urban",
  state: str(v.state),
  region: str(v.region),
  managerId: str(v.managerId),
  status,
  timezone: str(v.timezone),
  currency: str(v.currency),
  contactInfo: str(v.contactInfo),
  notes: str(v.notes),
});

export const TERRITORY_STATUS: StatusOption<Territory["status"]>[] = [
  { value: "active", label: "Active", consequence: "Sessions can be scheduled and booked in this territory." },
  { value: "draft", label: "Draft", consequence: "Still being set up. Hidden from scheduling." },
  { value: "paused", label: "Paused", consequence: "New scheduling and bookings stop. Cities, venues and existing sessions are kept.", needsReason: true },
  { value: "disabled", label: "Disabled", consequence: "Closed for business. Only allowed when no upcoming sessions remain.", needsReason: true },
];

/* ---------------------------------- city ---------------------------------- */

export const citySteps = (state: PrototypeState): SchemaStep[] => [
  {
    label: "City",
    sub: "Name and territory",
    intro: "A city inside a territory where sessions will run.",
    fields: [
      { key: "territoryId", label: "Territory", type: "select", required: true, options: state.territories.filter((t) => t.status !== "disabled").map((t) => ({ value: t.id, label: t.name })) },
      { key: "name", label: "City name", type: "text", required: true, placeholder: "e.g. Pune" },
      { key: "state", label: "State", type: "text", required: true },
      { key: "launchDate", label: "Launch date", type: "date", required: true },
    ],
  },
  {
    label: "Operations",
    sub: "Manager and activities",
    intro: "Who runs the city and which activity categories it offers.",
    fields: [
      { key: "managerId", label: "City manager", type: "select", options: operatorOptions(state), placeholder: "No manager yet" },
      { key: "supportedCategories", label: "Activities offered", type: "chips", options: categoryOptions(state), hint: state.categories.length ? "You can change this later." : "No activity categories exist yet. Add them in Catalog; you can update this city afterwards." },
      { key: "status", label: "Starting status", type: "select", required: true, options: [{ value: "draft", label: "Draft — still being set up" }, { value: "ready", label: "Ready — set up, not yet launched" }, { value: "active", label: "Active — open for sessions" }] },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
];

export const cityInitial = (territoryId = "", stateName = ""): FormValues => ({ territoryId, name: "", state: stateName, launchDate: today(), managerId: "", supportedCategories: [], status: "draft", notes: "" });

export const cityFromValues = (v: FormValues): Omit<City, "id"> => ({
  territoryId: str(v.territoryId),
  name: str(v.name),
  state: str(v.state),
  launchDate: str(v.launchDate),
  managerId: str(v.managerId),
  supportedCategories: list(v.supportedCategories),
  status: (str(v.status) || "draft") as City["status"],
  notes: str(v.notes),
});

export const CITY_STATUS: StatusOption<City["status"]>[] = [
  { value: "active", label: "Active", consequence: "Open for sessions and bookings." },
  { value: "ready", label: "Ready", consequence: "Set up and waiting to launch. Not yet bookable." },
  { value: "draft", label: "Draft", consequence: "Back to setup. New bookings are held.", needsReason: true },
  { value: "paused", label: "Paused", consequence: "New bookings are held. Venues and existing sessions are kept.", needsReason: true },
];

/* ---------------------------------- venue ---------------------------------- */

export const venueSteps = (state: PrototypeState): SchemaStep[] => [
  {
    label: "Location",
    sub: "Name, city and address",
    intro: "The building or ground customers arrive at.",
    fields: [
      {
        key: "cityId",
        label: "City",
        type: "select",
        required: true,
        options: state.cities.map((c) => ({ value: c.id, label: `${c.name} · ${state.territories.find((t) => t.id === c.territoryId)?.name ?? ""}` })),
      },
      { key: "name", label: "Venue name", type: "text", required: true, placeholder: "e.g. Baner Sports Hub" },
      { key: "type", label: "Venue type", type: "select", required: true, options: [{ value: "arena", label: "Arena" }, { value: "club", label: "Club" }, { value: "turf", label: "Turf" }, { value: "cafe", label: "Café or lounge" }, { value: "hall", label: "Hall" }] },
      { key: "address", label: "Street address", type: "textarea", rows: 2, required: true },
      { key: "operatingHours", label: "Operating hours", type: "text", placeholder: "06:00 - 23:00" },
      { key: "contactPerson", label: "Venue contact person", type: "text" },
      { key: "contactNumber", label: "Venue contact number", type: "tel", placeholder: "+91 98765 43210" },
    ],
  },
  {
    label: "Capacity and facilities",
    sub: "Safety limits, amenities",
    intro: "Safe capacity is the hard limit for everyone on site. Playing areas cannot exceed it.",
    fields: [
      { key: "safetyCapacity", label: "Safe capacity", type: "number", required: true, min: 1, suffix: "people" },
      { key: "staffCapacity", label: "Staff capacity", type: "number", required: true, min: 0, suffix: "staff" },
      { key: "spectatorAllowance", label: "Spectator allowance", type: "number", min: 0, suffix: "people" },
      { key: "supportedActivities", label: "Activities supported", type: "chips", options: categoryOptions(state), hint: "Leave empty to allow any activity whose requirements the venue meets." },
      { key: "equipmentAvailable", label: "Equipment on site", type: "list", placeholder: "Nets, Rackets, First-aid kit" },
      { key: "isIndoor", label: "Indoor", type: "toggle", description: "The venue is indoors" },
      { key: "weatherDependent", label: "Weather", type: "toggle", description: "Sessions depend on the weather" },
      { key: "lighting", label: "Lighting", type: "toggle", description: "Lit for evening sessions" },
      { key: "washrooms", label: "Washrooms", type: "toggle", description: "Washrooms available" },
      { key: "parking", label: "Parking", type: "toggle", description: "Parking available" },
      { key: "accessibility", label: "Accessibility", type: "toggle", description: "Step-free access" },
    ],
  },
  {
    label: "Safety and terms",
    sub: "Emergency plan and cost",
    intro: "What staff need in an emergency, and what a slot costs.",
    fields: [
      { key: "emergencyExits", label: "Emergency exits", type: "text", placeholder: "2 exits in Hall A" },
      { key: "safetyContact", label: "Safety contact number", type: "tel" },
      { key: "firstAid", label: "First aid", type: "toggle", description: "First-aid kit and trained person on site" },
      { key: "costPerSlot", label: "Cost per slot", type: "number", min: 0, suffix: "₹" },
      { key: "revenueModel", label: "Commercial model", type: "select", options: [{ value: "fixed", label: "Fixed fee per slot" }, { value: "revenue-share", label: "Revenue share" }, { value: "hybrid", label: "Fixed fee plus share" }] },
      { key: "cancellationTerms", label: "Cancellation terms", type: "text", placeholder: "24h notice for a full refund" },
      { key: "incidentNotes", label: "Safety notes", type: "textarea" },
    ],
  },
];

export const venueInitial = (cityId = ""): FormValues => ({
  cityId, name: "", type: "arena", address: "", operatingHours: "06:00 - 23:00", contactPerson: "", contactNumber: "",
  safetyCapacity: 50, staffCapacity: 4, spectatorAllowance: 0, supportedActivities: [], equipmentAvailable: [],
  isIndoor: true, weatherDependent: false, lighting: true, washrooms: true, parking: false, accessibility: false,
  emergencyExits: "", safetyContact: "", firstAid: true, costPerSlot: 0, revenueModel: "fixed", cancellationTerms: "", incidentNotes: "",
});

export const venueFromValues = (state: PrototypeState, v: FormValues): Omit<Venue, "id"> => {
  const city = state.cities.find((c) => c.id === str(v.cityId));
  return {
    territoryId: city?.territoryId ?? "",
    cityId: str(v.cityId),
    name: str(v.name),
    address: str(v.address),
    contactPerson: str(v.contactPerson),
    contactNumber: str(v.contactNumber),
    type: str(v.type) || "arena",
    operatingHours: str(v.operatingHours),
    supportedActivities: list(v.supportedActivities),
    safetyCapacity: num(v.safetyCapacity),
    staffCapacity: num(v.staffCapacity),
    spectatorAllowance: num(v.spectatorAllowance),
    equipmentAvailable: list(v.equipmentAvailable),
    accessibility: bool(v.accessibility),
    parking: bool(v.parking),
    washrooms: bool(v.washrooms),
    lighting: bool(v.lighting),
    isIndoor: bool(v.isIndoor),
    weatherDependent: bool(v.weatherDependent),
    costPerSlot: num(v.costPerSlot),
    revenueModel: str(v.revenueModel) || "fixed",
    cancellationTerms: str(v.cancellationTerms),
    emergencyExits: str(v.emergencyExits),
    firstAid: bool(v.firstAid),
    safetyContact: str(v.safetyContact),
    incidentNotes: str(v.incidentNotes),
    verificationStatus: "pending",
    status: "ready",
  };
};

export const VENUE_STATUS: StatusOption<Venue["status"]>[] = [
  { value: "ready", label: "Open", consequence: "Available for new sessions." },
  { value: "maintenance", label: "Maintenance", consequence: "No new sessions can be scheduled here. Existing sessions stay on the calendar — review them.", needsReason: true },
  { value: "closed", label: "Closed", consequence: "Closed for business. Only allowed when no upcoming sessions remain.", needsReason: true },
];

/* ------------------------------- playing area ------------------------------- */

export const playingAreaFields = (state: PrototypeState, venueId?: string, lockVenue = false): FieldDef[] => {
  const venue = state.venues.find((v) => v.id === venueId);
  return [
    ...(lockVenue
      ? []
      : [
          {
            key: "venueId",
            label: "Venue",
            type: "select" as const,
            required: true,
            options: state.venues.filter((v) => v.status !== "closed").map((v) => ({ value: v.id, label: `${v.name} · ${state.cities.find((c) => c.id === v.cityId)?.name ?? ""}` })),
          },
        ]),
    { key: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Court 1, Pitch A, Table 3" },
    {
      key: "maxCapacity",
      label: "Maximum participants",
      type: "number",
      required: true,
      min: 1,
      suffix: "people",
      check: (val, v) => {
        const ven = state.venues.find((x) => x.id === (str(v.venueId) || venueId));
        return ven && num(val) > ven.safetyCapacity ? `Cannot exceed the venue's safe capacity of ${ven.safetyCapacity}.` : undefined;
      },
      hint: venue ? `Venue safe capacity: ${venue.safetyCapacity}.` : undefined,
    },
    { key: "staffCapacity", label: "Staff needed", type: "number", min: 0, suffix: "staff" },
    { key: "spectatorCapacity", label: "Spectators allowed", type: "number", min: 0, suffix: "people" },
    { key: "operatingHours", label: "Operating hours", type: "text", placeholder: "06:00 - 23:00" },
    { key: "activityCompatibility", label: "Activities this area supports", type: "chips", required: true, options: categoryOptions(state), hint: state.categories.length ? undefined : "Add an activity category in Catalog first." },
    { key: "equipment", label: "Equipment in this area", type: "list", placeholder: "Nets, Posts" },
    { key: "restrictions", label: "Rules and restrictions", type: "textarea", rows: 2, placeholder: "Non-marking shoes only" },
  ];
};

export const playingAreaInitial = (venueId = ""): FormValues => ({ venueId, name: "", maxCapacity: 8, staffCapacity: 1, spectatorCapacity: 0, operatingHours: "", activityCompatibility: [], equipment: [], restrictions: "" });

export const playingAreaFromValues = (v: FormValues, venueId?: string): Omit<PlayingArea, "id"> => ({
  venueId: venueId ?? str(v.venueId),
  name: str(v.name),
  activityCompatibility: list(v.activityCompatibility),
  maxCapacity: num(v.maxCapacity),
  staffCapacity: num(v.staffCapacity),
  spectatorCapacity: num(v.spectatorCapacity),
  equipment: list(v.equipment),
  operatingHours: str(v.operatingHours),
  status: "active",
  restrictions: str(v.restrictions),
});

export const PLAYING_AREA_STATUS: StatusOption<PlayingArea["status"]>[] = [
  { value: "active", label: "Active", consequence: "Available for new sessions." },
  { value: "maintenance", label: "Maintenance", consequence: "Withdrawn from new scheduling while work is done.", needsReason: true },
  { value: "unavailable", label: "Unavailable", consequence: "Withdrawn from scheduling. Only allowed when no upcoming sessions use it.", needsReason: true },
  { value: "closed", label: "Closed", consequence: "Permanently out of use. Only allowed when no upcoming sessions use it.", needsReason: true },
];
