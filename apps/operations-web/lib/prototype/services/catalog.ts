import type {
  ActivityCategory,
  CategoryId,
  CategoryStatus,
  ExperienceTemplate,
  TemplateId,
  TemplateStatus,
  TemplateVersion
} from "../entities";
import type { PrototypeState } from "../scenarios";
import { nextId, pushAudit, pushSignal, uid } from "./helpers";
import type { CommandResult } from "./outcome";
import { createCategory, createTemplate, type CategoryInput, type TemplateInput } from "./create";
import { templateReadiness } from "../selectors/catalog";

type Result = CommandResult<{ id: string }>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const today = () => new Date().toISOString().slice(0, 10);
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const templateSnapshot = (t: ExperienceTemplate): Partial<ExperienceTemplate> => {
  const { id: _id, ...rest } = t;
  void _id;
  return clone(rest);
};

const nextVersion = (state: PrototypeState, templateId: TemplateId): number =>
  state.templateVersions
    .filter((v) => v.templateId === templateId)
    .reduce((max, v) => Math.max(max, v.version), 0) + 1;

/** Upcoming sessions (not cancelled/completed/archived) built from a template. */
const liveSessionsFor = (state: PrototypeState, templateId: string) =>
  state.sessions.filter((s) => s.templateId === templateId && !["cancelled", "completed", "archived"].includes(s.status));

function requireReason(reason: string | undefined): string | undefined {
  if (!reason || reason.trim().length < 5) return "Give a reason for this change (at least 5 characters). It is recorded in the version history and audit log.";
  return undefined;
}

export function createTemplateVersionSnapshot(
  state: PrototypeState,
  templateId: TemplateId,
  changedFields: string[],
  operatorId?: string,
  reason = "Template updated",
  previousStatus?: string,
  newStatus?: string
): PrototypeState {
  const t = state.templates.find((x) => x.id === templateId);
  if (!t) return state;
  const version: TemplateVersion = {
    id: uid("ver"),
    templateId,
    version: nextVersion(state, templateId),
    changedFields,
    changedBy: operatorId ?? "system",
    timestamp: new Date().toISOString(),
    reason,
    previousStatus,
    newStatus,
    snapshot: templateSnapshot(t)
  };
  return { ...state, templateVersions: [...state.templateVersions, version] };
}

/* ------------------------------ category ------------------------------ */

export function validateCategory(state: PrototypeState, c: Omit<ActivityCategory, "id">, selfId?: string): string | undefined {
  if (!c.name?.trim() || c.name.trim().length < 2) return "Enter the category name.";
  if (state.categories.some((x) => x.id !== selfId && sameName(x.name, c.name))) return `A category called "${c.name.trim()}" already exists.`;
  if (c.shortCode && state.categories.some((x) => x.id !== selfId && x.shortCode && sameName(x.shortCode, c.shortCode!)))
    return `Short code ${c.shortCode} is already used by another category.`;
  if (!c.description?.trim()) return "Describe the category in one sentence.";
  if (!(c.defaultDuration > 0)) return "Default duration must be more than 0 minutes.";
  if (c.defaultAgeMin < 0 || c.defaultAgeMin >= c.defaultAgeMax) return "Age range is invalid: the minimum age must be below the maximum.";
  if (c.defaultParticipantsMin < 1) return "Minimum participants must be at least 1.";
  if (c.defaultParticipantsMin > c.defaultParticipantsMax) return "Minimum participants cannot be more than the maximum.";
  if (c.defaultTargetParticipants !== undefined && (c.defaultTargetParticipants < c.defaultParticipantsMin || c.defaultTargetParticipants > c.defaultParticipantsMax))
    return "Target participants must sit between the minimum and maximum.";
  return undefined;
}

export function createActivityCategory(state: PrototypeState, input: CategoryInput, operatorId?: string): Result {
  const error = validateCategory(state, input);
  if (error) return { state, error };
  const id = input.id ?? nextId("cat", state.categories.map((c) => c.id));
  const created = createCategory(
    state,
    {
      ...input,
      id,
      name: input.name.trim(),
      status: input.status ?? "draft",
      traits: input.traits ?? [],
      createdAt: today(),
      updatedAt: today()
    },
    operatorId
  );
  return { state: created, id };
}

export function updateActivityCategory(state: PrototypeState, id: CategoryId, patch: Partial<ActivityCategory>, operatorId?: string): Result {
  const current = state.categories.find((c) => c.id === id);
  if (!current) return { state, error: "This category no longer exists." };
  if (current.status === "archived") return { state, error: "Archived categories are read-only. Restore it to draft before editing." };
  const next: ActivityCategory = { ...current, ...patch, id, status: current.status, updatedAt: today() };
  const error = validateCategory(state, next, id);
  if (error) return { state, error };
  return {
    state: pushAudit(
      { ...state, categories: state.categories.map((c) => (c.id === id ? next : c)) },
      { action: "Category Updated", description: `Category "${next.name}" updated (${Object.keys(patch).join(", ")}).`, operatorId }
    ),
    id
  };
}

export function changeCategoryStatus(state: PrototypeState, id: CategoryId, status: CategoryStatus, operatorId?: string, reason?: string): Result {
  const current = state.categories.find((c) => c.id === id);
  if (!current) return { state, error: "This category no longer exists." };
  const from = current.status ?? "active";
  if (from === status) return { state, error: `${current.name} is already ${status}.` };
  if (from === "archived" && status !== "draft") return { state, error: "An archived category can only be restored to draft." };
  if (status === "paused" || status === "archived" || from === "archived") {
    const e = requireReason(reason);
    if (e) return { state, error: e };
  }
  const dependents = state.templates.filter((t) => t.categoryId === id && t.status === "active");
  if (status === "archived" && dependents.length) {
    return { state, error: `${dependents.length} active experience${dependents.length === 1 ? " uses" : "s use"} this category. Pause or archive ${dependents.length === 1 ? "it" : "them"} first.` };
  }
  const next = { ...state, categories: state.categories.map((c) => (c.id === id ? { ...c, status, updatedAt: today() } : c)) };
  let withSignal: PrototypeState = next;
  if (status === "paused") {
    withSignal = pushSignal(next, { kind: "alert", message: `Category "${current.name}" paused. ${dependents.length} active experience${dependents.length === 1 ? "" : "s"} cannot be scheduled until it is resumed.` });
  } else if (status === "active") {
    withSignal = pushSignal(next, { kind: "system", message: `Category "${current.name}" is active.` });
  }
  return {
    state: pushAudit(withSignal, {
      action: "Category Status Changed",
      description: `Category "${current.name}" status changed from ${from} to ${status}.${reason?.trim() ? ` Reason: ${reason.trim()}` : ""}`,
      operatorId
    }),
    id
  };
}

export function duplicateCategory(state: PrototypeState, id: CategoryId, operatorId?: string): Result {
  const current = state.categories.find((c) => c.id === id);
  if (!current) return { state, error: "This category no longer exists." };
  let name = `${current.name} (copy)`;
  for (let n = 2; state.categories.some((c) => sameName(c.name, name)); n++) name = `${current.name} (copy ${n})`;
  let code = `${current.shortCode ?? current.id.toUpperCase()}-COPY`;
  for (let n = 2; state.categories.some((c) => c.shortCode === code); n++) code = `${current.shortCode ?? current.id.toUpperCase()}-COPY${n}`;
  const dup: ActivityCategory = {
    ...clone(current),
    id: nextId("cat", state.categories.map((c) => c.id)),
    name,
    shortCode: code,
    status: "draft",
    createdAt: today(),
    updatedAt: today()
  };
  return {
    state: pushAudit(
      { ...state, categories: [...state.categories, dup] },
      { action: "Category Duplicated", description: `Category "${current.name}" duplicated as "${dup.name}" (${dup.id}).`, operatorId }
    ),
    id: dup.id
  };
}

/* ------------------------------ template ------------------------------ */

export function validateTemplate(state: PrototypeState, t: Omit<ExperienceTemplate, "id">, selfId?: string): string | undefined {
  if (!t.name?.trim() || t.name.trim().length < 3) return "Enter the experience name (at least 3 characters).";
  if (state.templates.some((x) => x.id !== selfId && sameName(x.name, t.name))) return `An experience called "${t.name.trim()}" already exists.`;
  const category = state.categories.find((c) => c.id === t.categoryId);
  if (!category) return "Choose the category this experience belongs to.";
  if (!selfId && category.status === "archived") return `${category.name} is archived; choose an active category.`;
  if (!t.shortDesc?.trim()) return "Write the short description customers will see.";
  if (t.ageMin < 0 || t.ageMin >= t.ageMax) return "Age range is invalid: the minimum age must be below the maximum.";
  if (t.minParticipants < 1) return "Minimum participants must be at least 1.";
  if (t.minParticipants > t.maxParticipants) return "Minimum participants cannot be more than the maximum.";
  if (t.targetParticipants < t.minParticipants || t.targetParticipants > t.maxParticipants) return "Target participants must sit between the minimum and maximum.";
  if (t.teamSize < 1 || t.teamSize > t.maxParticipants) return "Team size must be between 1 and the maximum participants.";
  if (!(t.duration > 0)) return "Duration must be more than 0 minutes.";
  if (t.basePrice < 0) return "Price cannot be negative.";
  if (t.venueCost < 0 || t.equipmentCost < 0 || t.platformFee < 0 || t.taxAmount < 0) return "Costs, fees and tax cannot be negative.";
  return undefined;
}

export function createExperienceTemplate(state: PrototypeState, input: TemplateInput, operatorId?: string): Result {
  const status = input.status === "active" ? "active" : input.status === "ready" ? "ready" : "draft";
  const error = validateTemplate(state, input);
  if (error) return { state, error };
  const id = input.id ?? nextId("et", state.templates.map((t) => t.id));
  const draft: ExperienceTemplate = { ...input, id, name: input.name.trim(), status, createdAt: today(), updatedAt: today(), createdBy: operatorId };
  if (status === "active") {
    const category = state.categories.find((c) => c.id === draft.categoryId);
    if (category && (category.status ?? "active") !== "active") return { state, error: `${category.name} is ${category.status}; save as a draft until the category is active.` };
    const blocking = templateReadiness({ ...state, templates: [...state.templates, draft] }, draft).issues.find((i) => i.level === "error");
    if (blocking) return { state, error: `Cannot activate yet: ${blocking.message}. Save as a draft instead.` };
  }
  const created = createTemplate(state, draft, operatorId);
  let next = createTemplateVersionSnapshot(created, id, Object.keys(templateSnapshot(draft)), operatorId, "Initial definition", undefined, status);
  if (status === "active") {
    next = pushSignal(next, { kind: "system", message: `Experience "${draft.name}" is active and available to schedule.` });
  }
  return { state: next, id };
}

export function updateExperienceTemplate(
  state: PrototypeState,
  id: TemplateId,
  patch: Partial<ExperienceTemplate>,
  operatorId?: string,
  reason = "Details updated",
  changedFields?: string[]
): Result {
  const current = state.templates.find((x) => x.id === id);
  if (!current) return { state, error: "This experience no longer exists." };
  if (current.status === "archived") return { state, error: "Archived experiences are read-only. Duplicate it to make a new version." };
  const { status: _ignored, ...rest } = patch;
  void _ignored;
  const next: ExperienceTemplate = { ...current, ...rest, id, updatedAt: today() };
  const error = validateTemplate(state, next, id);
  if (error) return { state, error };
  const fields = changedFields ?? Object.keys(rest);
  if (fields.length === 0) return { state, id };
  const withState = { ...state, templates: state.templates.map((x) => (x.id === id ? next : x)) };
  const withVersion = createTemplateVersionSnapshot(withState, id, fields, operatorId, reason.trim() || "Details updated", current.status, next.status);
  return {
    state: pushAudit(withVersion, {
      action: "Template Updated",
      description: `Experience "${next.name}" updated (${fields.join(", ")}). Reason: ${reason}`,
      operatorId
    }),
    id
  };
}

export function changeTemplateStatus(
  state: PrototypeState,
  id: TemplateId,
  status: TemplateStatus,
  operatorId?: string,
  reason?: string
): Result {
  const current = state.templates.find((x) => x.id === id);
  if (!current) return { state, error: "This experience no longer exists." };
  if (current.status === status) return { state, error: `${current.name} is already ${status}.` };
  if (current.status === "archived") return { state, error: "Archived experiences are read-only. Duplicate it to bring it back." };
  if (status === "paused" || status === "archived") {
    const e = requireReason(reason);
    if (e) return { state, error: e };
  }
  if (status === "active") {
    const category = state.categories.find((c) => c.id === current.categoryId);
    if (!category) return { state, error: "The category for this experience no longer exists." };
    if ((category.status ?? "active") !== "active") return { state, error: `${category.name} is ${category.status}. Activate the category first.` };
    const blocking = templateReadiness(state, current).issues.find((i) => i.level === "error");
    if (blocking) return { state, error: `Cannot activate yet: ${blocking.message}.` };
  }
  if (status === "archived") {
    const upcoming = liveSessionsFor(state, id);
    if (upcoming.length) return { state, error: `${upcoming.length} upcoming session${upcoming.length === 1 ? " uses" : "s use"} this experience. Complete or cancel ${upcoming.length === 1 ? "it" : "them"} before archiving.` };
  }
  const withState = { ...state, templates: state.templates.map((x) => (x.id === id ? { ...x, status, updatedAt: today() } : x)) };
  const withVersion = createTemplateVersionSnapshot(withState, id, ["status"], operatorId, reason?.trim() || `Status changed to ${status}`, current.status, status);
  let withSignal: PrototypeState = withVersion;
  if (status === "active") {
    withSignal = pushSignal(withVersion, { kind: "system", message: `Experience "${current.name}" is active and available to schedule.` });
  } else if (status === "paused") {
    withSignal = pushSignal(withVersion, { kind: "alert", message: `Experience "${current.name}" paused: existing sessions continue, new sessions cannot be scheduled.` });
  } else if (status === "archived") {
    withSignal = pushSignal(withVersion, { kind: "alert", message: `Experience "${current.name}" archived and now read-only.` });
  }
  return {
    state: pushAudit(withSignal, {
      action: "Template Status Changed",
      description: `Experience "${current.name}" status changed from ${current.status} to ${status}.${reason?.trim() ? ` Reason: ${reason.trim()}` : ""}`,
      operatorId
    }),
    id
  };
}

function uniqueTemplateName(state: PrototypeState, base: string): string {
  let name = base;
  for (let n = 2; state.templates.some((t) => sameName(t.name, name)); n++) name = `${base} ${n}`;
  return name;
}

export function duplicateExperienceTemplate(state: PrototypeState, id: TemplateId, operatorId?: string): Result {
  const current = state.templates.find((x) => x.id === id);
  if (!current) return { state, error: "This experience no longer exists." };
  const dup: ExperienceTemplate = {
    ...clone(current),
    id: nextId("et", state.templates.map((t) => t.id)),
    name: uniqueTemplateName(state, `${current.name} (copy)`),
    status: "draft",
    createdAt: today(),
    updatedAt: today(),
    createdBy: operatorId
  };
  const withTemplates = { ...state, templates: [...state.templates, dup] };
  const withVersion = createTemplateVersionSnapshot(withTemplates, dup.id, Object.keys(templateSnapshot(dup)), operatorId, `Duplicated from "${current.name}"`, undefined, "draft");
  return {
    state: pushAudit(withVersion, {
      action: "Template Duplicated",
      description: `Experience "${current.name}" duplicated as "${dup.name}" (${dup.id}).`,
      operatorId
    }),
    id: dup.id
  };
}

export function duplicateTemplateVersion(state: PrototypeState, versionId: string, operatorId?: string): Result {
  const v = state.templateVersions.find((x) => x.id === versionId);
  if (!v) return { state, error: "This version no longer exists." };
  const base = state.templates.find((x) => x.id === v.templateId);
  if (!base && !v.snapshot.name) return { state, error: "The experience for this version no longer exists." };
  const dup: ExperienceTemplate = {
    ...clone(base ?? ({} as ExperienceTemplate)),
    ...clone(v.snapshot),
    id: nextId("et", state.templates.map((t) => t.id)),
    name: uniqueTemplateName(state, `${v.snapshot.name ?? base?.name ?? "Experience"} v${v.version}`),
    status: "draft",
    createdAt: today(),
    updatedAt: today(),
    createdBy: operatorId
  };
  const withTemplates = { ...state, templates: [...state.templates, dup] };
  const withVersion = createTemplateVersionSnapshot(
    withTemplates,
    dup.id,
    Object.keys(templateSnapshot(dup)),
    operatorId,
    `New draft from version ${v.version} of "${base?.name ?? v.templateId}"`,
    undefined,
    "draft"
  );
  return {
    state: pushAudit(withVersion, {
      action: "Template Drafted From Version",
      description: `Draft "${dup.name}" created from version ${v.version}.`,
      operatorId
    }),
    id: dup.id
  };
}

/* --------------------------- operational note --------------------------- */

export function addCatalogNote(state: PrototypeState, entity: string, name: string, note: string, operatorId?: string): Result {
  if (note.trim().length < 3) return { state, error: "Write the note before saving." };
  return {
    state: pushAudit(state, {
      action: "Catalog Note",
      description: `Note on "${name}" (${entity}): ${note.trim()}`,
      operatorId
    })
  };
}
