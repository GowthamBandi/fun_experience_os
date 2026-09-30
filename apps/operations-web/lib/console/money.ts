/**
 * Money helpers. All server money is integer minor units (paise) + ISO
 * currency (ADR-0003 rule 4). The console only ever formats; it never does
 * float arithmetic on money.
 */

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  const key = currency.toUpperCase();
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-IN", { style: "currency", currency: key, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatters.set(key, f);
  }
  return f;
}

/** True for a safe integer amount of minor units (paise). */
export function isMinorAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * Formats integer paise as a currency string, e.g. 1234567 → "₹12,345.67".
 * Returns "—" for anything that is not a safe integer (never guesses).
 */
export function formatPaise(minor: unknown, currency: unknown = "INR"): string {
  if (!isMinorAmount(minor)) return "—";
  const code = typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency) ? currency : "INR";
  const negative = minor < 0;
  const abs = Math.abs(minor);
  // Split into whole units and remainder with integer math, then format.
  const whole = Math.trunc(abs / 100);
  const paise = abs % 100;
  const text = formatter(code).format(whole + paise / 100);
  return negative ? `-${text}` : text;
}

/** Thresholds mirrored from firebase/functions/src/commerce/config.ts (display only; the server enforces). */
export const REFUND_DUAL_CONTROL_MINOR = 1_000_000; // ₹10,000
export const SETTLEMENT_DUAL_CONTROL_MINOR = 5_000_000; // ₹50,000

export function needsRefundDualControl(amountMinor: unknown): boolean {
  return isMinorAmount(amountMinor) && amountMinor > REFUND_DUAL_CONTROL_MINOR;
}

export function needsSettlementDualControl(netMinor: unknown): boolean {
  return isMinorAmount(netMinor) && netMinor > SETTLEMENT_DUAL_CONTROL_MINOR;
}
