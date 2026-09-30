/**
 * CATEGORY REGISTRY — the category-agnostic experience schema.
 *
 * An experience has a common core (title, description, eligibility, safety,
 * cancellation policy…) plus a category-specific `config` object. What `config`
 * may contain is DATA in this registry, not code: adding a category (or a field)
 * is a registry entry, validated by the one generic `validateCategoryConfig`.
 *
 * Cross-field rules that couple `config` to the core (movies "A" ⇒ 18+,
 * overnight trips ⇒ ID required) are declared per category as `rules`.
 */

import { DomainError } from "../platform/errors";

export type FieldDescriptor =
  | { type: "string"; required?: boolean; min?: number; max: number }
  | { type: "int"; required?: boolean; min: number; max: number }
  | { type: "bool"; required?: boolean }
  | { type: "enum"; required?: boolean; values: readonly string[] }
  | { type: "stringList"; required?: boolean; maxItems: number; maxLen: number };

/** Facts from the experience core that category rules may constrain. */
export interface CoreFacts {
  ageMin: number;
  ageMax: number | null;
  idRequired: boolean;
  genderRule: GenderRule;
}

export interface CategoryRule {
  /** Returns an error message when violated, or null. */
  check: (config: Record<string, unknown>, core: CoreFacts) => string | null;
}

export interface CategoryDefinition {
  label: string;
  fields: Record<string, FieldDescriptor>;
  rules?: CategoryRule[];
  /** Risk contribution for governance triage. */
  risk?: (config: Record<string, unknown>) => "high" | null;
}

export const GENDER_RULES = ["open", "mixed", "women-only", "men-only"] as const;
export type GenderRule = (typeof GENDER_RULES)[number];

export const CATEGORY_REGISTRY: Record<string, CategoryDefinition> = {
  sports: {
    label: "Sports",
    fields: {
      teamSize: { type: "int", min: 1, max: 50 },
      skillLevel: { type: "enum", values: ["beginner", "intermediate", "advanced", "all-levels"] },
      equipmentProvided: { type: "bool" },
    },
  },
  music: {
    label: "Music & concerts",
    fields: {
      genre: { type: "string", max: 40 },
      ageCheckAtDoor: { type: "bool" },
      seating: { type: "enum", values: ["standing", "seated", "mixed"] },
    },
  },
  trips: {
    label: "Trips",
    fields: {
      pickupPoint: { type: "string", required: true, min: 3, max: 160 },
      returnTime: { type: "string", max: 40 },
      overnight: { type: "bool" },
      stops: { type: "stringList", maxItems: 12, maxLen: 80 },
    },
    rules: [
      {
        check: (c, core) =>
          c.overnight === true && !core.idRequired
            ? "Overnight trips must require guests to carry a government ID."
            : null,
      },
    ],
    risk: (c) => (c.overnight === true ? "high" : null),
  },
  movies: {
    label: "Movies & screenings",
    fields: {
      language: { type: "string", max: 30 },
      certificate: { type: "enum", values: ["U", "UA", "A"] },
      runtimeMinutes: { type: "int", min: 1, max: 600 },
    },
    rules: [
      {
        check: (c, core) =>
          c.certificate === "A" && core.ageMin < 18
            ? "A-certificate screenings are for adults only. Set the minimum age to 18 or more."
            : null,
      },
    ],
  },
  social: {
    label: "Social",
    fields: {
      icebreakers: { type: "bool" },
      groupSize: { type: "int", min: 2, max: 500 },
    },
  },
  wellness: {
    label: "Wellness",
    fields: {
      intensity: { type: "enum", values: ["gentle", "moderate", "intense"] },
      matsProvided: { type: "bool" },
    },
  },
  food: {
    label: "Food & drink",
    fields: {
      cuisine: { type: "string", max: 40 },
      dietaryOptions: { type: "stringList", maxItems: 8, maxLen: 30 },
      servesAlcohol: { type: "bool" },
    },
    rules: [
      {
        check: (c, core) =>
          c.servesAlcohol === true && core.ageMin < 21
            ? "Experiences serving alcohol must set the minimum age to 21 or more."
            : null,
      },
    ],
  },
  workshops: {
    label: "Workshops",
    fields: {
      materialsIncluded: { type: "bool" },
      skillLevel: { type: "enum", values: ["beginner", "intermediate", "advanced", "all-levels"] },
      takeaway: { type: "string", max: 120 },
    },
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_REGISTRY);

function invalid(message: string, field?: string): DomainError {
  return new DomainError("INVALID_INPUT", message, { detail: field ? { field } : undefined });
}

function validateField(name: string, d: FieldDescriptor, v: unknown): unknown {
  switch (d.type) {
    case "string": {
      if (typeof v !== "string") throw invalid(`${name} must be text.`, name);
      const s = v.trim();
      if (s.length < (d.min ?? 1) || s.length > d.max) throw invalid(`${name} must be ${d.min ?? 1}–${d.max} characters.`, name);
      return s;
    }
    case "int":
      if (typeof v !== "number" || !Number.isSafeInteger(v) || v < d.min || v > d.max) {
        throw invalid(`${name} must be a whole number between ${d.min} and ${d.max}.`, name);
      }
      return v;
    case "bool":
      if (typeof v !== "boolean") throw invalid(`${name} must be true or false.`, name);
      return v;
    case "enum":
      if (typeof v !== "string" || !d.values.includes(v)) throw invalid(`${name} must be one of: ${d.values.join(", ")}.`, name);
      return v;
    case "stringList": {
      if (!Array.isArray(v) || v.length > d.maxItems) throw invalid(`${name} must be a list of at most ${d.maxItems} items.`, name);
      return v.map((x) => {
        if (typeof x !== "string" || x.trim().length < 1 || x.trim().length > d.maxLen) {
          throw invalid(`Each ${name} item must be 1–${d.maxLen} characters.`, name);
        }
        return x.trim();
      });
    }
  }
}

/**
 * Validates `config` against the registry entry for [category]. Unknown
 * categories and unknown fields are rejected (no free-form data smuggling);
 * required fields must be present; cross-field rules are enforced.
 */
export function validateCategoryConfig(category: string, raw: unknown, core: CoreFacts): Record<string, unknown> {
  const def = CATEGORY_REGISTRY[category];
  if (!def) throw invalid("This category isn't supported.", "category");
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
    throw invalid("Category details are invalid.", "config");
  }
  const input = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(def.fields, key)) {
      throw invalid(`"${key}" isn't a detail used for ${def.label}.`, key);
    }
  }
  for (const [key, d] of Object.entries(def.fields)) {
    const v = input[key];
    if (v === undefined || v === null) {
      if (d.required) throw invalid(`${key} is required for ${def.label}.`, key);
      continue;
    }
    out[key] = validateField(key, d, v);
  }
  for (const rule of def.rules ?? []) {
    const msg = rule.check(out, core);
    if (msg) throw invalid(msg);
  }
  return out;
}

export function categoryRisk(category: string, config: Record<string, unknown>): "high" | null {
  return CATEGORY_REGISTRY[category]?.risk?.(config) ?? null;
}
