import { Customer360 } from "@/components/customers/Customer360";

export default async function Page({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  return <Customer360 uid={decodeURIComponent(uid)} />;
}
