"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import { Crumbs, PageShell } from "@/components/setup/kit";
import { CreatedCard, SchemaWizard } from "@/components/setup/form";
import { franchiseFromValues, franchiseInitial, franchiseSteps } from "@/components/setup/schemas";

export default function NewFranchisePage() {
  const { canAccess, role, createFranchise } = useStore();
  const toast = useToast();
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);

  if (!canAccess("/franchises")) return <PermissionDenied module="Franchises" />;
  if (!geoCan(role.id, "create-franchise")) return <PermissionDenied module="franchise creation" />;

  return (
    <PageShell narrow={!!created}>
      <Crumbs items={[{ label: "Setup", href: "/setup" }, { label: "Franchises", href: "/franchises" }, { label: "New franchise" }]} />
      {created ? (
        <CreatedCard
          title={`${created.name} is set up`}
          line="Next, add the first territory this franchise will run. Territories carry the manager, time zone and currency for their cities."
          primary={{ href: `/territories/new?franchiseId=${created.id}`, label: "Add its first territory" }}
          secondary={[
            { href: `/franchises/${created.id}`, label: "Open franchise" },
            { href: "/setup", label: "Back to setup" },
          ]}
        />
      ) : (
        <>
          <PageHeader overline="Setup · Franchises" title="New franchise" sub="Two short steps, then review. You can edit everything later." />
          <SchemaWizard
            steps={franchiseSteps()}
            initial={franchiseInitial()}
            submitLabel="Create franchise"
            cancelHref="/franchises"
            onSubmit={(v) => {
              const input = franchiseFromValues(v);
              const out = createFranchise(input);
              if (!out.error && out.id) {
                toast.success("Franchise created", input.name);
                setCreated({ id: out.id, name: input.name });
              }
              return out;
            }}
          />
        </>
      )}
    </PageShell>
  );
}
