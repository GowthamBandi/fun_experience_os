"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

const LIGHT = [0.19, 1, 0.22, 1] as const;

export default function VerifyingPage() {
  const router = useRouter();
  const { operator, role } = useStore();

  useEffect(() => {
    const t = setTimeout(() => router.replace("/"), 2300);
    return () => clearTimeout(t);
  }, [router]);

  if (!operator) return null;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <motion.span
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: LIGHT }}
          className="mark mx-auto block h-12 w-12"
        />

        <motion.h1
          initial={{ opacity: 0, filter: "blur(6px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ delay: 0.35, duration: 0.5, ease: LIGHT }}
          className="mt-6 text-2xl font-semibold tracking-tight text-ink-lum"
        >
          {role.name}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.4 }}
          className="mt-1 text-sm text-ink-mut"
        >
          {role.scope} scope · {operator.name}
        </motion.p>

        <div className="mx-auto mt-10 max-w-[280px] space-y-2">
          {[
            { label: "City", width: 100 },
            { label: "Sessions", width: 78 },
            { label: "People", width: 56 },
          ].map((bar, i) => (
            <motion.div
              key={bar.label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 + i * 0.22, duration: 0.3 }}
              className="flex items-center gap-3"
            >
              <span className="w-16 text-right text-[11px] uppercase tracking-widest text-ink-mut">{bar.label}</span>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.7 + i * 0.22, duration: 0.45, ease: LIGHT }}
                style={{ transformOrigin: "left" }}
                className="h-1.5 rounded-full bg-gradient-to-r from-[#5a67f5] to-[#f7b955]"
              />
              <span className="text-[11px] tabular text-ink-mut">{bar.width}%</span>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6, duration: 0.4 }}
          className="mt-10 text-xs text-ink-mut"
        >
          The door is opening.
        </motion.p>
      </div>
    </main>
  );
}
