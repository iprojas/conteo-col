import { redirect } from "next/navigation";
import { getMunicipality, getNextPendingActId } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function StartMunicipalityReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actId = await getNextPendingActId(id);
  if (actId) redirect(`/revisar/${actId}`);

  const municipality = await getMunicipality(id);
  redirect(municipality ? `/municipios/${id}?filter=reviewed` : "/municipios");
}
