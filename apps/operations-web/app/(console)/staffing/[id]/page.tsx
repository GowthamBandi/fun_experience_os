import { redirect } from "next/navigation";

/** Legacy route kept for old links. */
export default async function LegacyStaffRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/people/staff/${encodeURIComponent(id)}`);
}
