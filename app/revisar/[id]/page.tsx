import { notFound } from "next/navigation";
import { ReviewWorkspace } from "@/components/review-workspace";
import { getAct } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const act = await getAct(id);
  if (!act) notFound();

  return (
    <main className="review-page">
      <ReviewWorkspace act={act} />
    </main>
  );
}
