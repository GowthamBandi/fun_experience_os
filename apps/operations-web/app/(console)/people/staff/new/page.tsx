"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import { Crumbs, EmptyPanel, PageShell } from "@/components/setup/kit";
import { CreatedCard, SchemaWizard } from "@/components/setup/form";
import { crewFromValues, crewInitial, crewSteps } from "@/components/staff/schemas";

export default function NewStaffPage() {
  const { state, canAccess, role, territory, createCrewMember } = useStore();
  const toast = useToast();
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  if (!canAccess("/people")) return <PermissionDenied module="People" />;
  if (!geoCan(role.id, "manage-staff")) return <PermissionDenied module="adding staff" />;
  const crumbs = [{ label: "People", href: "/people" }, { label: "Staff", href: "/people/staff" }, { label: "Add staff" }];

  if (state.venues.length === 0 && !created) {
    return (
      <PageShell narrow>
        <Crumbs items={crumbs} />
        <EmptyPanel icon={<Users className="h-5 w-5" />} title="Set up a venue first" line="Every staff member is based at a venue inside a territory." actionHref="/setup" actionLabel="Go to setup" />
      </PageShell>
    );
  }

  return (
    <PageShell narrow={!!created}>
      <Crumbs items={crumbs} />
      {created ? (
        <CreatedCard
          title={`${created.name} is on the staff list`}
          line="They are available. Assign them to an upcoming session, or add another person."
          primary={{ href: "/staffing/assign", label: "Assign to a session" }}
          secondary={[{ href: `/people/staff/${created.id}`, label: "Open profile" }, { href: "/people/staff/new", label: "Add another" }]}
        />
      ) : (
        <>
          <PageHeader overline="People · Staff" title="Add a staff member" sub="Two short steps, then review." />
          <SchemaWizard
            steps={crewSteps(state)}
            initial={crewInitial(territory.id)}
            submitLabel="Add to staff list"
            cancelHref="/people/staff"
            onSubmit={(v) => {
              const input = crewFromValues(v);
              const out = createCrewMember(input);
              if (!out.error && out.id) {
                toast.success("Staff member added", input.name);
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
