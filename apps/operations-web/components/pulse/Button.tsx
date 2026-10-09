import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/format";

export type ButtonVariant = "volt" | "primary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
};

const VARIANT: Record<ButtonVariant, string> = {
  volt: "bg-volt text-on-volt font-display font-bold hover:shadow-[0_10px_28px_-10px_rgba(217,255,63,0.65)] hover:brightness-[1.04]",
  primary: "bg-primary-strong text-white font-semibold hover:bg-[#7A5CFF] hover:shadow-[0_10px_28px_-10px_rgba(142,114,255,0.7)]",
  ghost: "bg-surface-high text-text font-semibold border border-line hover:bg-surface-top hover:border-[rgba(255,255,255,0.14)]",
  danger: "bg-[rgba(255,97,120,0.14)] text-err font-semibold border border-[rgba(255,97,120,0.35)] hover:bg-[rgba(255,97,120,0.22)]",
  quiet: "bg-transparent text-text-2 font-semibold hover:bg-[rgba(255,255,255,0.06)] hover:text-text",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-[12px] px-3 text-[12px]",
  md: "h-10 gap-2 rounded-[14px] px-4 text-[13px]",
  lg: "h-12 gap-2 rounded-control px-5 text-[15px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size = "md", loading = false, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "focus-ring relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap",
        "transition-[background-color,border-color,color,box-shadow,transform,filter] duration-200 ease-pulse",
        "active:scale-[0.97] disabled:active:scale-100 motion-reduce:active:scale-100",
        loading ? "cursor-progress opacity-90" : "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden className={cn("shrink-0 animate-spin", size === "lg" ? "h-[18px] w-[18px]" : "h-4 w-4")} />
      ) : icon ? (
        <span aria-hidden className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
});
