"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import { Crumbs, PageShell } from "@/components/setup/kit";
import { CreatedCard, SchemaWizard } from "@/components/setup/form";
import { categoryFromValues, categoryInitial, categorySteps } from "@/components/catalog/schemas";

export default function NewCategoryPage() {
  const { canAccess, role, createActivityCategory } = useStore();
  const toast = useToast();
  const [created, setCreated] = useState<{ id: string; name: string; active: boolean } | null>(null);
  if (!canAccess("/catalog")) return <PermissionDenied module="Catalog" />;
  if (!geoCan(role.id, "manage-catalog")) return <PermissionDenied module="catalog editing" />;
  return (
    <PageShell narrow={!!created}>
      <Crumbs items={[{ label: "Catalog", href: "/catalog" }, { label: "Categories", href: "/catalog/categories" }, { label: "New category" }]} />
      {created ? (
        <CreatedCard
          title={`${created.name} is added`}
          line={created.active ? "Next, create an experience in this category — the plan sessions are scheduled from." : "It is saved as a draft. Activate it from the category page when you are ready, then create experiences in it."}
          primary={{ href: `/catalog/experiences/new?categoryId=${created.id}`, label: "Create an experience" }}
          secondary={[{ href: `/catalog/categories/${created.id}`, label: "Open category" }, { href: "/catalog", label: "Back to catalog" }]}
        />
      ) : (
        <>
          <PageHeader overline="Catalog · Categories" title="New activity category" sub="Three short steps, then review." />
          <SchemaWizard
            steps={categorySteps()}
            initial={categoryInitial()}
            submitLabel="Create category"
            cancelHref="/catalog/categories"
            onSubmit={(v) => {
              const input = categoryFromValues(v);
              const out = createActivityCategory(input);
              if (!out.error && out.id) {
                toast.success("Category created", input.name);
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
