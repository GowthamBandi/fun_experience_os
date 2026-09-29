import type { PrototypeState } from "@/lib/prototype/scenarios/state";
import type { CrewInput } from "@/lib/prototype/services/staff";
import { CREW_ROLES } from "@/lib/prototype/services/staff";
import { formatStaffRole } from "@/lib/prototype/selectors/staff";
import type { FieldDef, FormValues, SchemaStep } from "@/components/setup/form";
import { list, str } from "@/components/setup/form";
import type { RoleId } from "@/lib/types";

/** Field schema for adding and editing a staff member. */
export const crewSteps = (state: PrototypeState, v?: FormValues): SchemaStep[] => [
  {
    label: "Role and location",
    sub: "Who they are and where they work",
    intro: "Staff are assigned to sessions in their own territory only.",
    fields: crewCoreFields(state, v),
  },
  {
    label: "Contact",
    sub: "Phone, email, emergency",
    intro: "Optional, but needed to reach them on the day.",
    fields: crewContactFields(),
  },
];

export function crewCoreFields(state: PrototypeState, v?: FormValues): FieldDef[] {
  return [
    { key: "name", label: "Full name", type: "text", required: true, placeholder: "e.g. Nikhil Rao" },
    { key: "role", label: "Role", type: "select", required: true, options: CREW_ROLES.map((r) => ({ value: r, label: formatStaffRole(r) })) },
    { key: "territoryId", label: "Territory", type: "select", required: true, options: state.territories.map((t) => ({ value: t.id, label: t.name })) },
    {
      key: "venueId",
      label: "Based at venue",
      type: "select",
      required: true,
      options: state.venues.map((x) => ({ value: x.id, label: `${x.name} · ${state.territories.find((t) => t.id === x.territoryId)?.name ?? ""}` })),
      check: (val, values) => {
        const venue = state.venues.find((x) => x.id === val);
        return venue && venue.territoryId !== str(values.territoryId) ? "This venue is not in the chosen territory." : undefined;
      },
      hint: v?.territoryId ? undefined : "Choose a venue inside the chosen territory.",
    },
    { key: "skills", label: "Skills", type: "list", placeholder: "First aid, Referee level 1" },
  ];
}

export function crewContactFields(): FieldDef[] {
  return [
    { key: "phone", label: "Phone", type: "tel", placeholder: "+91 98765 43210" },
    { key: "email", label: "Email", type: "email", placeholder: "name@example.com" },
    { key: "emergencyContact", label: "Emergency contact", type: "text", placeholder: "Name and phone" },
    { key: "notes", label: "Notes", type: "textarea", rows: 2 },
  ];
}

export const crewInitial = (territoryId = ""): FormValues => ({ name: "", role: "staff", territoryId, venueId: "", skills: [], phone: "", email: "", emergencyContact: "", notes: "" });

export const crewFromValues = (v: FormValues): CrewInput => ({
  name: str(v.name),
  role: str(v.role) as RoleId,
  territoryId: str(v.territoryId),
  venueId: str(v.venueId),
  skills: list(v.skills),
  phone: str(v.phone),
  email: str(v.email),
  emergencyContact: str(v.emergencyContact),
  notes: str(v.notes),
});
