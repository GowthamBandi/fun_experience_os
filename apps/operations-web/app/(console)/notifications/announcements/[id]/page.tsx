import { AnnouncementDetail } from "@/components/notifications/AnnouncementDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AnnouncementDetail id={decodeURIComponent(id)} />;
}
