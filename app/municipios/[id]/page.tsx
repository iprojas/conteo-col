import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMunicipality, listActs } from "@/lib/db";

export const dynamic = "force-dynamic";

const validFilters = ["pending", "reviewed", "discrepancy"] as const;
type Filter = (typeof validFilters)[number];

export default async function MunicipalityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; filter?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const municipality = await getMunicipality(id);
  if (!municipality) notFound();

  const filter: Filter = validFilters.includes(query.filter as Filter) ? (query.filter as Filter) : "pending";
  const requestedPage = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const result = await listActs(id, filter, requestedPage);
  if (requestedPage > result.totalPages) redirect(`/municipios/${id}?filter=${filter}&page=${result.totalPages}`);
  const firstPending = filter === "pending" ? result.acts[0] : (await listActs(id, "pending", 1, 1)).acts[0];

  const filterHref = (next: Filter) => `/municipios/${id}?filter=${next}&page=1`;
  const pageHref = (page: number) => `/municipios/${id}?filter=${filter}&page=${page}`;

  return (
    <main className="page-shell narrow">
      <Link className="back-link" href="/">← Todos los municipios</Link>
      <section className="municipality-header">
        <div>
          <p className="eyebrow">DEPARTAMENTO {municipality.departmentCode}</p>
          <h1>{municipality.name}</h1>
          <p>{municipality.total.toLocaleString("es-CO")} actas emparejadas</p>
        </div>
        {firstPending && <Link className="primary-button" href={`/revisar/${firstPending.id}`}>Revisar siguiente acta →</Link>}
      </section>

      <section className="summary-grid compact">
        <div className="summary-card pending"><strong>{municipality.pending.toLocaleString("es-CO")}</strong><span>Pendientes</span></div>
        <div className="summary-card complete"><strong>{municipality.reviewed.toLocaleString("es-CO")}</strong><span>Revisadas</span></div>
        <div className="summary-card alert"><strong>{municipality.discrepancies.toLocaleString("es-CO")}</strong><span>Con discrepancia</span></div>
      </section>

      <section className="panel">
        <nav className="tabs" aria-label="Filtrar actas">
          <Link className={filter === "pending" ? "active" : ""} href={filterHref("pending")}>Pendientes ({municipality.pending})</Link>
          <Link className={filter === "reviewed" ? "active" : ""} href={filterHref("reviewed")}>Revisadas ({municipality.reviewed})</Link>
          <Link className={filter === "discrepancy" ? "active" : ""} href={filterHref("discrepancy")}>Discrepancias ({municipality.discrepancies})</Link>
        </nav>
        <div className="acts-table-wrap">
          <table className="acts-table">
            <thead><tr><th>Acta</th><th>Zona</th><th>Puesto</th><th>Mesa</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {result.acts.map((act) => (
                <tr key={act.id}>
                  <td><code>{act.id}</code></td><td>{act.zone}</td><td>{act.station}</td><td>{act.tableNumber}</td>
                  <td><Status status={act.status} /></td>
                  <td><Link className="small-button" href={`/revisar/${act.id}`}>{act.status === "pending" ? "Revisar" : "Ver"} →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!result.acts.length && <p className="empty-state">No hay actas en esta categoría.</p>}
        </div>
        <div className="pagination">
          <span>Página {requestedPage} de {result.totalPages} · {result.total.toLocaleString("es-CO")} actas</span>
          <div>
            {requestedPage > 1 && <Link href={pageHref(requestedPage - 1)}>← Anterior</Link>}
            {requestedPage < result.totalPages && <Link href={pageHref(requestedPage + 1)}>Siguiente →</Link>}
          </div>
        </div>
      </section>
    </main>
  );
}

function Status({ status }: { status: string }) {
  if (status === "pending") return <span className="status pending">Pendiente</span>;
  if (status === "discrepancy") return <span className="status discrepancy">Con discrepancia</span>;
  return <span className="status reviewed">Sin discrepancia</span>;
}
