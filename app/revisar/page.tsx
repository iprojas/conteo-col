import { redirect } from "next/navigation";
import { getPriorityPendingActId } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function StartReviewPage({ searchParams }: { searchParams: Promise<{ exclude?: string }> }) {
  const query = await searchParams;
  const excludedActIds = parseExcludedActIds(query.exclude);
  const actId = await getPriorityPendingActId(excludedActIds);
  redirect(actId ? `/revisar/${actId}` : "/municipios");
}

function parseExcludedActIds(value?: string) {
  return (value ?? "").split(",").filter((id) => /^\d{10,20}$/.test(id)).slice(-50);
}
