import { notFound, redirect } from "next/navigation";
import { ReviewWorkspace } from "@/components/review-workspace";
import { getAct, getNextPendingActId, getPriorityPendingActId } from "@/lib/db";
import { validPdfRequestId } from "@/lib/pdf-source";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const act = await getAct(id);
  if (!act) notFound();
  if (act.status !== "pending") {
    const nextActId = await getNextPendingActId(act.municipalityId) ?? await getPriorityPendingActId();
    redirect(nextActId ? `/revisar/${nextActId}` : "/municipios");
  }

  return (
    <main className="review-page">
      <ReviewWorkspace act={act} documentRequestId={validPdfRequestId(null)} />
    </main>
  );
}
