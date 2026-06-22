import { redirect } from "next/navigation";
import { getPriorityPendingActId } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function StartReviewPage() {
  const actId = await getPriorityPendingActId();
  redirect(actId ? `/revisar/${actId}` : "/municipios");
}
