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
import { createCategory, createTemplate, type CategoryInput, type TemplateInput } from "./create";

/** Flip a catalog template between active and draft (pause, never delete). */
export function toggleTemplate(state: PrototypeState, templateId: TemplateId, operatorId?: string): PrototypeState {
  const t = state.templates.find((x) => x.id === templateId);
  if (!t) return state;
  const status = t.status === "active" ? ("draft" as const) : ("active" as const);
  return pushAudit(
    {
      ...state,
      templates: state.templates.map((x) => (x.id === templateId ? { ...x, status } : x))
    },
    { action: "Template Shelved", description: `Template "${t.name}" ${status === "active" ? "resumed (active)" : "paused (draft)"}.`, operatorId }
  );
}

const describe = (entity: string, name: string) => `"${name}" (${entity})`;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const templateSnapshot = (t: ExperienceTemplate): Partial<ExperienceTemplate> => {
  const { id: _id, ...rest } = t;
  return clone(rest);
};

const nextVersion = (state: PrototypeState, templateId: TemplateId): number =>
  state.templateVersions
    .filter((v) => v.templateId === templateId)
    .reduce((max, v) => Math.max(max, v.version), 0) + 1;

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
    timestamp: new Date().toISOString().slice(0, 10).replace(/-/g, "/"),
    reason,
    previousStatus,
    newStatus,
    snapshot: templateSnapshot(t)
  };
  return { ...state, templateVersions: [...state.templateVersions, version] };
}

/* ------------------------------ category ------------------------------ */

export function createActivityCategory(state: PrototypeState, input: CategoryInput, operatorId?: string): PrototypeState {
  const id = input.id ?? nextId("cat", state.categories.map((c) => c.id));
  const category: ActivityCategory = {
    ...input,
    id,
    status: input.status ?? "active",
    traits: input.traits ?? [],
    createdAt: input.createdAt ?? "today",
    updatedAt: input.updatedAt ?? "today"
  };
  return pushAudit(
    { ...state, categories: [...state.categories, category] },
    { action: "Category Created", description: `Activity category ${describe("category", category.name)} created (${id}).`, operatorId }
  );
}

export function updateActivityCategory(state: PrototypeState, id: CategoryId, patch: Partial<ActivityCategory>, operatorId?: string): PrototypeState {
  const current = state.categories.find((c) => c.id === id);
  if (!current) return state;
  const next: ActivityCategory = { ...current, ...patch, updatedAt: "today" };
  return pushAudit(
    { ...state, categories: state.categories.map((c) => (c.id === id ? next : c)) },
    { action: "Category Updated", description: `Activity category ${describe("category", next.name)} details updated.`, operatorId }
  );
}

export function changeCategoryStatus(state: PrototypeState, id: CategoryId, status: CategoryStatus, operatorId?: string): PrototypeState {
  const current = state.categories.find((c) => c.id === id);
  if (!current) return state;
  const next = {
    ...state,
    categories: state.categories.map((c) => (c.id === id ? { ...c, status, updatedAt: "today" } : c))
  };
  const dependents = state.templates.filter((t) => t.categoryId === id && t.status === "active");
  let withSignal: PrototypeState = next;
  if (status === "paused") {
    withSignal = pushSignal(next, {
      kind: "alert",
      message: `CATEGORY PAUSED: "${current.name}" frozen. ${dependents.length} active templates depend on it; scheduling those is blocked.`
    });
  } else if (status === "draft") {
    withSignal = pushSignal(next, {
      kind: "system",
      message: `Category "${current.name}" moved to draft. No new templates can be created against it.`
    });
  } else {
    withSignal = pushSignal(next, { kind: "system", message: `Category "${current.name}" status set to ${status}.` });
  }
  return pushAudit(withSignal, {
    action: "Category Status Changed",
    description: `Activity category "${current.name}" status set to ${status}.`
  });
}

export function duplicateCategory(state: PrototypeState, id: CategoryId, operatorId?: string): PrototypeState {
  const current = state.categories.find((c) => c.id === id);
  if (!current) return state;
  const dup: ActivityCategory = {
    ...clone(current),
    id: nextId("cat", state.categories.map((c) => c.id)),
    name: `${current.name} (Copy)`,
    shortCode: `${current.shortCode ?? current.id}-CPY`,
    status: "draft",
    createdAt: "today",
    updatedAt: "today"
  };
  return pushAudit(
    { ...state, categories: [...state.categories, dup] },
    { action: "Category Duplicated", description: `Activity category "${current.name}" duplicated as "${dup.name}" (${dup.id}).`, operatorId }
  );
}

/* ------------------------------ template ------------------------------ */

export function createExperienceTemplate(state: PrototypeState, input: TemplateInput, operatorId?: string): PrototypeState {
  const created = createTemplate(state, input, operatorId);
  const t = created.templates.find((x) => x.id === input.id) ?? created.templates[created.templates.length - 1];
  let withVersion = createTemplateVersionSnapshot(
    { ...created, templates: created.templates.map((x) => (x.id === t.id ? { ...x, createdAt: "today", updatedAt: "today" } : x)) },
    t.id,
    Object.keys(templateSnapshot(t)),
    operatorId,
    "Initial template definition",
    undefined,
    t.status
  );
  if (t.status === "active") {
    withVersion = pushSignal(withVersion, {
      kind: "system",
      message: `TEMPLATE ACTIVATED: "${t.name}" is now available to the session scheduler.`
    });
  }
  return withVersion;
}

export function updateExperienceTemplate(
  state: PrototypeState,
  id: TemplateId,
  patch: Partial<ExperienceTemplate>,
  operatorId?: string,
  reason = "Template updated",
  changedFields?: string[]
): PrototypeState {
  const current = state.templates.find((x) => x.id === id);
  if (!current) return state;
  const next: ExperienceTemplate = { ...current, ...patch, updatedAt: "today" };
  const fields = changedFields ?? Object.keys(patch);
  const withState = { ...state, templates: state.templates.map((x) => (x.id === id ? next : x)) };
  const withVersion = createTemplateVersionSnapshot(withState, id, fields, operatorId, reason, current.status, next.status);
  return pushAudit(withVersion, {
    action: "Template Updated",
    description: `Experience template "${next.name}" updated (${fields.join(", ")}).`,
    operatorId
  });
}

export function changeTemplateStatus(
  state: PrototypeState,
  id: TemplateId,
  status: TemplateStatus,
  operatorId?: string,
  reason = "Status changed"
): PrototypeState {
  const current = state.templates.find((x) => x.id === id);
  if (!current) return state;
  const withState = { ...state, templates: state.templates.map((x) => (x.id === id ? { ...x, status, updatedAt: "today" } : x)) };
  const withVersion = createTemplateVersionSnapshot(withState, id, ["status"], operatorId, reason, current.status, status);
  let withSignal: PrototypeState = withVersion;
  if (status === "active") {
    withSignal = pushSignal(withVersion, {
      kind: "system",
      message: `TEMPLATE ACTIVATED: "${current.name}" is now available to the session scheduler.`
    });
  } else if (status === "paused") {
    withSignal = pushSignal(withVersion, {
      kind: "alert",
      message: `TEMPLATE PAUSED: "${current.name}" stays visible but cannot create new sessions.`
    });
  } else if (status === "archived") {
    withSignal = pushSignal(withVersion, {
      kind: "alert",
      message: `TEMPLATE ARCHIVED: "${current.name}" is now historical and read-only.`
    });
  }
  return pushAudit(withSignal, {
    action: "Template Status Changed",
    description: `Experience template "${current.name}" status set from "${current.status}" to "${status}".`
  });
}

export function duplicateExperienceTemplate(state: PrototypeState, id: TemplateId, operatorId?: string): PrototypeState {
  const current = state.templates.find((x) => x.id === id);
  if (!current) return state;
  const dup: ExperienceTemplate = {
    ...clone(current),
    id: nextId("et", state.templates.map((t) => t.id)),
    name: `${current.name} (Copy)`,
    status: "draft",
    createdAt: "today",
    updatedAt: "today"
  };
  const withTemplates = { ...state, templates: [...state.templates, dup] };
  const withVersion = createTemplateVersionSnapshot(
    withTemplates,
    dup.id,
    Object.keys(templateSnapshot(dup)),
    operatorId,
    `Duplicated from "${current.name}"`,
    undefined,
    "draft"
  );
  return pushAudit(withVersion, {
    action: "Template Duplicated",
    description: `Experience template "${current.name}" duplicated as "${dup.name}" (${dup.id}).`,
    operatorId
  });
}

export function duplicateTemplateVersion(state: PrototypeState, versionId: string, operatorId?: string): PrototypeState {
  const v = state.templateVersions.find((x) => x.id === versionId);
  if (!v) return state;
  const base = state.templates.find((x) => x.id === v.templateId);
  const dup: ExperienceTemplate = {
    ...clone(base ?? ({} as ExperienceTemplate)),
    ...clone(v.snapshot),
    id: nextId("et", state.templates.map((t) => t.id)),
    name: `${v.snapshot.name ?? base?.name ?? "Experience"} v${v.version}`,
    status: "draft",
    createdAt: "today",
    updatedAt: "today"
  };
  const withTemplates = { ...state, templates: [...state.templates, dup] };
  const withVersion = createTemplateVersionSnapshot(
    withTemplates,
    dup.id,
    Object.keys(templateSnapshot(dup)),
    operatorId,
    `Restored draft from version v${v.version} of "${base?.name ?? v.templateId}"`,
    undefined,
    "draft"
  );
  return pushAudit(withVersion, {
    action: "Template Drafted From Version",
    description: `Draft "${dup.name}" created from version v${v.version}.`,
    operatorId
  });
}

/* --------------------------- operational note --------------------------- */

export function addCatalogNote(state: PrototypeState, entity: string, name: string, note: string, operatorId?: string): PrototypeState {
  return pushAudit(state, {
    action: "Catalog Note",
    description: `Note on ${describe(entity, name)}: ${note}`
  });
}
