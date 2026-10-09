import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** The "← Section" link above a 360 page. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-pill px-2 py-1 text-[13px] font-semibold text-text-3 transition-colors duration-150 hover:text-text">
      <ArrowLeft aria-hidden className="h-4 w-4" />
      {label}
    </Link>
  );
}
