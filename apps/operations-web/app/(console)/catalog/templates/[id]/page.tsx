"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyTemplateDetailRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/catalog/experiences/${id}`);
  }, [id, router]);

  return (
    <div className="p-8 text-center text-xs text-ink-mut">
      Redirecting to canonical experience detail route...
    </div>
  );
}
