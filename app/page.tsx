import { MunicipalityList } from "@/components/municipality-list";
import { getMunicipalities } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const municipalities = await getMunicipalities();
  const totals = municipalities.reduce(
    (result, item) => ({
      total: result.total + item.total,
      pending: result.pending + item.pending,
      reviewed: result.reviewed + item.reviewed,
      discrepancies: result.discrepancies + item.discrepancies,
    }),
    { total: 0, pending: 0, reviewed: 0, discrepancies: 0 },
  );

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">REVISIÓN CIUDADANA</p>
        <h1>Compara dos versiones de cada acta</h1>
        <p>Elige un municipio, revisa los documentos lado a lado y registra cualquier discrepancia.</p>
      </section>

      <section className="summary-grid" aria-label="Resumen general">
        <div className="summary-card"><strong>{totals.total.toLocaleString("es-CO")}</strong><span>Actas emparejadas</span></div>
        <div className="summary-card pending"><strong>{totals.pending.toLocaleString("es-CO")}</strong><span>Pendientes</span></div>
        <div className="summary-card complete"><strong>{totals.reviewed.toLocaleString("es-CO")}</strong><span>Revisadas</span></div>
        <div className="summary-card alert"><strong>{totals.discrepancies.toLocaleString("es-CO")}</strong><span>Con discrepancia</span></div>
      </section>

      <MunicipalityList municipalities={municipalities} />
    </main>
  );
}
