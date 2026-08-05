export const inr = (n: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

export const pct = (n: number): string => `${Math.round(n)}%`;

export const fillRate = (booked: number, capacity: number): number =>
  Math.round((booked / Math.max(capacity, 1)) * 100);

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export const cn = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");
