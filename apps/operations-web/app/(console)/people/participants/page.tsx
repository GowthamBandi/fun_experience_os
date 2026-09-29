"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectParticipantDirectory } from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { SearchInput, FilterRail } from "@/components/ui/fields";
import { Stagger, Item } from "@/components/motion/Motion";
import { StaffBackNavigation, StaffHelpPanel } from "@/components/staff";
import { Ticket, Lock, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";

export default function ParticipantsDirectoryPage() {
  const { state, territory, canAccess } = useStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const participants = selectParticipantDirectory(state);

  const filtered = useMemo(() => {
    let list = participants;

    if (statusFilter !== "all") {
      if (statusFilter === "checked-in") {
        list = list.filter((p) => p.isCheckedIn);
      } else if (statusFilter === "revealed") {
        list = list.filter((p) => p.isRevealed);
      }
    }

    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (p) =>
          p.alias.toLowerCase().includes(q) ||
          p.tempId.toLowerCase().includes(q) ||
          p.sessionTitle.toLowerCase().includes(q) ||
          (p.teamName || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [participants, statusFilter, searchQuery]);

  if (!canAccess("/people")) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <PermissionDenied module="Participants Directory" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <StaffBackNavigation label="Back to People" href="/people" />

      <PageHeader
        overline={`Participants Directory · ${territory.name}`}
        title="Participants"
        sub="See people who joined events using privacy-safe operational identities. Who has joined our events?"
      />

      <StaffHelpPanel />

      <div className="glass p-5 rounded-2xl border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="w-full sm:w-80">
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search alias, temp ID, event..." />
          </div>

          <FilterRail
            options={["all", "checked-in", "revealed"] as const}
            value={statusFilter as any}
            onChange={setStatusFilter as any}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-mut">No participants match your search criteria.</div>
        ) : (
          <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <Item key={p.id}>
                <div className="glass p-5 rounded-2xl border border-white/5 hover:border-purple-500/30 transition-all flex flex-col justify-between space-y-3">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-brand block">{p.tempId}</span>
                        <h4 className="font-bold text-base text-ink-lum flex items-center gap-1.5">
                          <Link href={`/people/participants/${p.id}`} className="hover:text-brand transition-colors">
                            {p.alias}
                          </Link>
                        </h4>
                      </div>
                      <StatusChip
                        value={p.isCheckedIn ? "Checked In" : p.isRevealed ? "Revealed" : "Booked"}
                      />
                    </div>

                    <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1.5 text-xs">
                      <div className="flex justify-between text-ink-sec">
                        <span>Event:</span>
                        <span className="font-bold text-ink-lum truncate max-w-[160px]">{p.sessionTitle}</span>
                      </div>
                      <div className="flex justify-between text-ink-sec">
                        <span>Team:</span>
                        <span className="font-bold text-purple-300">{p.teamName}</span>
                      </div>
                      <div className="flex justify-between text-ink-mut text-[11px] pt-1 border-t border-white/5">
                        <span className="flex items-center gap-1">
                          <Lock className="w-3 h-3 text-emerald-400" />
                          <span>Protected Phone:</span>
                        </span>
                        <span className="font-mono">{p.maskedPhone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[11px] text-ink-mut font-mono">Joined {p.joinedAt}</span>
                    <Link href={`/people/participants/${p.id}`}>
                      <Button variant="secondary" className="h-7 text-xs font-bold px-3">
                        View Details
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </Item>
            ))}
          </Stagger>
        )}
      </div>
    </div>
  );
}
