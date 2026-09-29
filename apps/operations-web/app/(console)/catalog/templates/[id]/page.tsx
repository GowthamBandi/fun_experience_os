import { redirect } from "next/navigation";

/** Legacy route kept for old links. */
export default async function LegacyTemplateRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/catalog/experiences/${encodeURIComponent(id)}`);
}
