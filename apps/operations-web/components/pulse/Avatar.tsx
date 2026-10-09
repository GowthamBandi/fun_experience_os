import { cn } from "@/lib/format";

// [from, to, text]. Every pair keeps the initials at 4.5:1 or better across the whole gradient (bold 14px is not large text).
const GRADIENTS: Array<[string, string, string]> = [
  ["#FF9A8B", "#8E72FF", "#0B0A12"],
  ["#6E4DFF", "#4B2FD6", "#FFFFFF"],
  ["#3FDD9A", "#63BEFF", "#0B0A12"],
  ["#FFB84D", "#FF6178", "#0B0A12"],
  ["#D9FF3F", "#3FDD9A", "#14160B"],
  ["#FF6178", "#8E72FF", "#0B0A12"],
  ["#63BEFF", "#8E72FF", "#0B0A12"],
  ["#F6A6FF", "#8E72FF", "#0B0A12"],
];

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
  return h;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0]);
  const chars = words.length === 1 ? first.slice(0, 2) : [first[0], Array.from(words[words.length - 1])[0]];
  return chars.join("").toUpperCase();
}

export function Avatar({ name, size = 38, className }: { name: string; size?: number; className?: string }) {
  const [from, to, fg] = GRADIENTS[hash(name.trim().toLowerCase()) % GRADIENTS.length];
  return (
    <span
      role="img"
      aria-label={name.trim() || "Unknown"}
      className={cn("inline-grid shrink-0 select-none place-items-center rounded-full font-display font-bold leading-none", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.37),
        color: fg,
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
      }}
    >
      <span aria-hidden>{initials(name)}</span>
    </span>
  );
}
