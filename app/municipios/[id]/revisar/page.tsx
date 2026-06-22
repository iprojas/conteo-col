import { redirect } from "next/navigation";
import { getMunicipality, getNextPendingActId } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function StartMunicipalityReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ exclude?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const excludedActIds = (query.exclude ?? "").split(",").filter((actId) => /^\d{10,20}$/.test(actId)).slice(-50);
  const actId = await getNextPendingActId(id, excludedActIds);
  if (actId) redirect(`/revisar/${actId}`);

  const municipality = await getMunicipality(id);
  const exclude = excludedActIds.length ? `?exclude=${excludedActIds.join(",")}` : "";
  redirect(municipality ? `/revisar${exclude}` : "/municipios");
}
