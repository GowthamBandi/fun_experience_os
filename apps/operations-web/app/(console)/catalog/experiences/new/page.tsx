"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import { Crumbs, EmptyPanel, PageShell } from "@/components/setup/kit";
import { CreatedCard, SchemaWizard } from "@/components/setup/form";
import { experienceFromValues, experienceInitial, experienceSteps } from "@/components/catalog/schemas";

function NewExperience() {
  const params = useSearchParams();
  const { state, canAccess, role, createExperienceTemplate } = useStore();
  const toast = useToast();
  const [created, setCreated] = useState<{ id: string; name: string; active: boolean } | null>(null);
  const [initial] = useState(() => experienceInitial(state, params.get("categoryId") ?? undefined));

  if (!canAccess("/catalog")) return <PermissionDenied module="Catalog" />;
  if (!geoCan(role.id, "manage-catalog")) return <PermissionDenied module="catalog editing" />;
  const crumbs = [{ label: "Catalog", href: "/catalog" }, { label: "Experiences", href: "/catalog/experiences" }, { label: "New experience" }];

  if (!state.categories.some((c) => (c.status ?? "active") !== "archived") && !created) {
    return (
      <PageShell narrow>
        <Crumbs items={crumbs} />
        <EmptyPanel icon={<Sparkles className="h-5 w-5" />} title="Add an activity category first" line="Every experience belongs to a category, which supplies its defaults." actionHref="/catalog/categories/new" actionLabel="Add a category" />
      </PageShell>
    );
  }

  return (
    <PageShell narrow={!!created}>
      <Crumbs items={crumbs} />
      {created ? (
        <CreatedCard
          title={`${created.name} is ${created.active ? "active" : "saved as a draft"}`}
          line={created.active ? "It passed every readiness check and can be scheduled now." : "Review its readiness checklist, then activate it to start scheduling sessions."}
          primary={created.active ? { href: `/missions/new?experienceId=${created.id}`, label: "Schedule a session" } : { href: `/catalog/experiences/${created.id}`, label: "Review and activate" }}
          secondary={[{ href: `/catalog/experiences/${created.id}/preview`, label: "Customer preview" }, { href: "/catalog/experiences", label: "All experiences" }]}
        />
      ) : (
        <>
          <PageHeader overline="Catalog · Experiences" title="New experience" sub="Nine short steps, then review. Values start from the category's defaults." />
          <SchemaWizard
            steps={experienceSteps(state)}
            initial={initial}
            submitLabel="Create experience"
            cancelHref="/catalog/experiences"
            onSubmit={(v) => {
              const input = experienceFromValues(v);
              const out = createExperienceTemplate(input);
              if (!out.error && out.id) {
                toast.success(input.status === "active" ? "Experience created and activated" : "Experience saved as a draft", input.name);
                setCreated({ id: out.id, name: input.name, active: input.status === "active" });
              }
              return out;
            }}
          />
        </>
      )}
    </PageShell>
  );
}

export default function NewExperiencePage() {
  return (
    <Suspense fallback={null}>
      <NewExperience />
    </Suspense>
  );
}
