"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound } from "lucide-react";
import { OPERATORS } from "@/lib/data/mock";
import { Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

const LIGHT = [0.19, 1, 0.22, 1] as const;

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);

  const valid = identifier.trim().length > 0 && password.length > 0;
  const selected = useMemo(
    () => OPERATORS.find((o) => o.name.toLowerCase().includes(identifier.trim().toLowerCase())),
    [identifier],
  );

  const enter = () => {
    if (!valid || busy) return;
    const op = selected ?? OPERATORS[4];
    try {
      window.sessionStorage.setItem("xos.pending", JSON.stringify({ operatorId: op.id, roleId: op.role }));
    } catch {
      /* noop */
    }
    setBusy(true);
    setTimeout(() => router.push("/otp"), 500);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* the door */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: LIGHT }}
          className="flex flex-col items-center text-center"
        >
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: LIGHT }}
            className="mark flex h-14 w-14 items-center justify-center ring-1 ring-white/10"
          >
            <span className="block h-7 w-1.5 rounded-full bg-gradient-to-b from-[#ffd28a] to-[#5a67f5] shadow-[0_0_24px_rgba(247,185,85,0.5)]" />
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: LIGHT }}
            className="mt-5 text-lg font-semibold tracking-tight text-ink-lum"
          >
            Experience OS
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.32, duration: 0.5, ease: LIGHT }}
            className="mt-1 text-sm text-ink-mut"
          >
            Enter the operations floor.
          </motion.p>
        </motion.div>

        {/* the room */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.42, duration: 0.5, ease: LIGHT }}
          className="glass relative mt-8 rounded-panel p-6"
        >
          <div className="space-y-4">
            <label className="block">
              <span className="overline mb-2 block">Identifier</span>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onFocus={() => setReveal(true)}
                placeholder="Name, email or phone"
                className="field h-11 w-full rounded-xl px-3.5 text-sm text-ink-lum placeholder:text-ink-mut/70 focus:outline-none"
                autoComplete="username"
              />
            </label>

            <AnimatePresence initial={false}>
              {reveal && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.32, ease: LIGHT }}
                  className="overflow-hidden"
                >
                  <div className="pb-4 pt-0.5">
                    <span className="overline mb-2 block">Password</span>
                    <div className="relative">
                      <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && enter()}
                        type={show ? "text" : "password"}
                        placeholder="••••••••"
                        className="field h-11 w-full rounded-xl px-3.5 pr-11 text-sm text-ink-lum placeholder:text-ink-mut/70 focus:outline-none"
                        autoComplete="current-password"
                      />
                      <button
                        onClick={() => setShow((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-mut transition-colors hover:text-ink-sec"
                        aria-label={show ? "Hide password" : "Show password"}
                      >
                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* the lamp */}
            <button
              onClick={enter}
              disabled={!valid || busy}
              className={cn(
                "group relative flex h-12 w-full items-center justify-between overflow-hidden rounded-xl px-4 text-sm font-medium transition-all duration-300 ease-light",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
                busy
                  ? "shimmer bg-white/8 text-ink-sec"
                  : valid
                    ? "bg-brand text-white shadow-[0_0_32px_-6px_rgba(90,103,245,0.7)] hover:bg-brand-hover"
                    : "bg-white/5 text-ink-mut",
              )}
            >
              <span>Enter</span>
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>

            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  try {
                    window.sessionStorage.setItem("xos.pending", JSON.stringify({ operatorId: OPERATORS[4].id, roleId: OPERATORS[4].role }));
                  } catch {
                    /* noop */
                  }
                  router.push("/otp");
                }}
                className="inline-flex items-center gap-1.5 text-xs text-ink-mut transition-colors hover:text-ink-sec"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Use a code instead
              </button>
              <span className="text-xs text-ink-mut">Demo code · 123456</span>
            </div>
          </div>
        </motion.div>

        {/* the crew */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-6"
        >
          <p className="overline mb-3 text-center">or step in as someone on the crew</p>
          <div className="flex flex-wrap justify-center gap-2">
            {OPERATORS.map((o, i) => (
              <motion.button
                key={o.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.62 + i * 0.04, duration: 0.3, ease: LIGHT }}
                onClick={() => {
                  setIdentifier(o.name);
                  setReveal(true);
                }}
                title={o.title}
                className={cn(
                  "rounded-xl border p-1 transition-all duration-200",
                  identifier.toLowerCase() === o.name.toLowerCase()
                    ? "border-[#5a67f5]/60 bg-[#5a67f5]/15 shadow-[0_0_20px_-6px_rgba(90,103,245,0.6)]"
                    : "border-white/6 bg-white/3 hover:bg-white/6",
                )}
              >
                <Avatar initials={o.initials} />
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </main>
  );
}
