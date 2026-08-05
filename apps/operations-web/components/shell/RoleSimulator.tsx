"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronDown, Fingerprint, ShieldCheck } from "lucide-react";
import { useStore } from "@/lib/store";
import { ROLES } from "@/lib/data/mock";
import { navFor } from "@/lib/nav";
import { cn } from "@/lib/format";
import { useClickOutside } from "@/lib/hooks";
import { Avatar } from "@/components/ui/primitives";

/** The role simulator — switch position in the command chain. Permission follows. */
export function RoleSimulator() {
  const { role, operator, switchRole, canAccess } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  const chain = ROLES.filter((r) => r.kind === "chain");
  const functional = ROLES.filter((r) => r.kind === "functional");

  const pick = (id: (typeof ROLES)[number]["id"]) => {
    switchRole(id);
    setOpen(false);
    if (!canAccess(pathname)) router.push("/");
  };

  const Row = ({ id }: { id: (typeof ROLES)[number]["id"] }) => {
    const r = ROLES.find((x) => x.id === id)!;
    const active = r.id === role.id;
    const allowed = navFor(id).length;
    return (
      <button
        key={id}
        onClick={() => pick(id)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
          active ? "bg-white/8" : "hover:bg-white/5",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-xs font-medium", active ? "text-ink-lum" : "text-ink-sec")}>{r.name}</span>
          <span className="block text-[11px] text-ink-mut">
            {r.scope} · {allowed} modules
          </span>
        </span>
        {active && <Check className="h-3.5 w-3.5 text-[#ffd28a]" />}
      </button>
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2.5 rounded-xl border border-white/6 bg-white/3 px-2.5 transition-colors hover:bg-white/6"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Fingerprint className="h-4 w-4 text-[#9db4ff]" />
        <span className="hidden text-xs font-medium text-ink-sec md:block">{role.name}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-ink-mut transition-transform duration-200", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.22, ease: [0.19, 1, 0.22, 1] }}
            className="glass absolute right-0 top-full z-40 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-panel p-2"
            role="menu"
          >
            <div className="flex items-center gap-2 px-2.5 py-2">
              <ShieldCheck className="h-4 w-4 text-[#ffd28a]" />
              <div>
                <p className="text-xs font-medium text-ink-lum">Position simulator</p>
                <p className="text-[11px] text-ink-mut">Permission follows the position</p>
              </div>
            </div>
            {operator && (
              <div className="mb-1 flex items-center gap-2.5 rounded-lg bg-white/3 px-2.5 py-2">
                <Avatar initials={operator.initials} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink-lum">{operator.name}</p>
                  <p className="truncate text-[11px] text-ink-mut">{role.scope} scope</p>
                </div>
              </div>
            )}
            <p className="overline px-2.5 pb-1 pt-2">Command chain</p>
            {chain.map((r) => (
              <Row key={r.id} id={r.id} />
            ))}
            <p className="overline px-2.5 pb-1 pt-2">Functional lanes</p>
            {functional.map((r) => (
              <Row key={r.id} id={r.id} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
