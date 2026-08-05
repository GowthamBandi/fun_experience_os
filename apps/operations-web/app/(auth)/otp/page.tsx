"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/format";
import type { RoleId } from "@/lib/types";

const LIGHT = [0.19, 1, 0.22, 1] as const;
const DEMO_CODE = "123456";

export default function OtpPage() {
  const router = useRouter();
  const { signIn } = useStore();
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [focus, setFocus] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(23);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "").slice(-1);
    setError(null);
    setDigits((d) => {
      const next = [...d];
      next[i] = clean;
      return next;
    });
    if (clean && i < 5) {
      setFocus(i + 1);
      inputsRef.current[i + 1]?.focus();
    }
  };

  const handlePaste = (text: string) => {
    const clean = text.replace(/\D/g, "").slice(0, 6);
    if (!clean) return;
    const arr = clean.padEnd(6, " ").split("").map((c) => c.trim());
    setDigits(arr);
    const nextFocus = Math.min(arr.findIndex((c) => !c), 5);
    setFocus(nextFocus === -1 ? 5 : nextFocus);
    inputsRef.current[Math.min(clean.length, 5)]?.focus();
    if (clean.length === 6) verify(clean);
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[i] && i > 0) {
        setFocus(i - 1);
        inputsRef.current[i - 1]?.focus();
      }
    }
  };

  const verify = (code: string) => {
    if (busy) return;
    if (code === DEMO_CODE) {
      setBusy(true);
      let pending: { operatorId: string; roleId: string } | null = null;
      try {
        pending = JSON.parse(window.sessionStorage.getItem("xos.pending") ?? "null");
      } catch {
        pending = null;
      }
      if (!pending) {
        router.replace("/login");
        return;
      }
      signIn(pending.operatorId, pending.roleId as RoleId);
      setTimeout(() => router.push("/verifying"), 600);
    } else {
      setError("That code didn't take. Try again.");
      setTimeout(() => {
        setDigits(["", "", "", "", "", ""]);
        setFocus(0);
        inputsRef.current[0]?.focus();
      }, 420);
    }
  };

  useEffect(() => {
    const joined = digits.join("");
    if (joined.length === 6 && !busy) verify(joined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: LIGHT }}>
          <span className="overline">Sent to ••••••42</span>
          <h1 className="mt-3 text-lg font-semibold tracking-tight text-ink-lum">Enter the code</h1>
          <p className="mt-1 text-sm text-ink-mut">The night is waiting. One row of light.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5, ease: LIGHT }}
          className="mx-auto mt-8 flex max-w-[320px] justify-center gap-2"
        >
          {digits.map((d, i) => (
            <motion.div
              key={i}
              animate={{ scale: error && focus === i ? 0.94 : 1, opacity: error && !d ? 0.35 : 1 }}
              transition={{ duration: 0.3, ease: LIGHT, delay: error ? i * 0.05 : 0 }}
            >
              <input
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                value={d}
                inputMode="numeric"
                autoFocus={i === 0}
                aria-label={`Digit ${i + 1} of 6`}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKey(i, e)}
                onPaste={(e) => {
                  e.preventDefault();
                  handlePaste(e.clipboardData.getData("text"));
                }}
                className={cn(
                  "field h-14 w-11 rounded-full text-center text-xl font-semibold tabular text-ink-lum transition-all duration-200 ease-light focus:outline-none",
                  d
                    ? "border-[#5a67f5]/60 bg-[#5a67f5]/15 shadow-[0_0_24px_-6px_rgba(90,103,245,0.7)]"
                    : "bg-white/3",
                  error && "border-danger/50",
                )}
              />
            </motion.div>
          ))}
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-4 text-xs text-ink-mut">
          {error ?? (busy ? "Unlocking…" : "Demo code · 123456")}
        </motion.p>

        <button
          onClick={() => setCountdown(23)}
          disabled={countdown > 0}
          className="mt-6 text-xs text-ink-mut transition-colors hover:text-ink-sec disabled:cursor-default disabled:opacity-60"
        >
          {countdown > 0 ? `Didn't arrive? Send it again in ${countdown}` : "Didn't arrive? Send it again"}
        </button>
      </div>
    </main>
  );
}
