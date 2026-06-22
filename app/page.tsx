import Link from "next/link";
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
    <main className="page-shell landing-page">

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">CONTEO CÍVICO · COLOMBIA</p>
          <h1>Defendamos cada voto. Súmate al conteo ciudadano.</h1>
          <p>
            Compara las versiones públicas de las actas electorales y ayuda a
            identificar inconsistencias para defender cada voto. para su revisión.
          </p>
          <div className="hero-actions">
            <Link className="primary-button hero-cta" href="/municipios">
              Empezar a evaluar actas →
            </Link>
            <a className="secondary-link" href="#avance">
              Ver avance por municipio
            </a>
          </div>
        </div>

<div className="civic-card" aria-label="Qué reportar">
  <p className="eyebrow">QUÉ REPORTAR</p>
  <ol>
    <li>
      <span>1</span>
      <div>
        <strong>Tachones o incongruencias</strong>
        <small>En las actas de las mesas.</small>
      </div>
    </li>
    <li>
      <span>2</span>
      <div>
        <strong>Menos de tres firmas</strong>
        <small>Los formularios deben tener 3 o mas firmas</small>
      </div>
    </li>
    <li>
      <span>3</span>
      <div>
        <strong>Correcciones sin explicación</strong>
        <small>Que no estén justificadas en observaciones.</small>
      </div>
    </li>
  </ol>
</div>

      </section>

      <section className="summary-grid" aria-label="Resumen general">
        <div className="summary-card"><strong>{totals.total.toLocaleString("es-CO")}</strong><span>Actas emparejadas</span></div>
        <div className="summary-card pending"><strong>{totals.pending.toLocaleString("es-CO")}</strong><span>Pendientes</span></div>
        <div className="summary-card complete"><strong>{totals.reviewed.toLocaleString("es-CO")}</strong><span>Revisadas</span></div>
        <div className="summary-card alert"><strong>{totals.discrepancies.toLocaleString("es-CO")}</strong><span>Con discrepancia</span></div>
      </section>

      <section className="progress-section" id="avance">
        <div className="section-intro">
          <div>
            <p className="eyebrow">AVANCE CIUDADANO</p>
            <h2>Revisión por municipio</h2>
          </div>
          <p>Consulta el avance y entra a un municipio para evaluar sus actas pendientes.</p>
        </div>
        <MunicipalityList municipalities={municipalities} title="Municipios" />
      </section>
    </main>
  );
}
