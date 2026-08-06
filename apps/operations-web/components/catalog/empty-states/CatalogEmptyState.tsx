"use client";

import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export interface CatalogEmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
}

export function CatalogEmptyState({
  title = "No items found",
  message = "Create your first category or experience to start building your catalog.",
  actionLabel = "Create Experience",
  actionHref = "/catalog/experiences/new",
}: CatalogEmptyStateProps) {
  return (
    <div className="glass p-8 rounded-2xl border border-white/5 text-center space-y-4 my-4 max-w-md mx-auto">
      <div className="w-12 h-12 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto text-brand">
        <Sparkles className="w-6 h-6" />
      </div>

      <div className="space-y-1">
        <h3 className="text-base font-bold text-ink-lum">{title}</h3>
        <p className="text-xs text-ink-mut leading-relaxed max-w-xs mx-auto">{message}</p>
      </div>

      {actionLabel && actionHref && (
        <div className="pt-2">
          <Link href={actionHref}>
            <Button variant="primary" className="font-bold text-xs">
              <Plus className="w-4 h-4 mr-1" />
              {actionLabel}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
