"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MunicipalitySummary } from "@/lib/types";

export function MunicipalityList({
  municipalities,
  title = "Municipios",
}: {
  municipalities: MunicipalitySummary[];
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("es");
  const visible = useMemo(
    () => municipalities.filter((item) =>
      item.name.toLocaleLowerCase("es").includes(normalized) || item.id.includes(normalized),
    ),
    [municipalities, normalized],
  );

  return (
    <section className="panel">
      <div className="panel-heading">
        <div><h2>{title}</h2><p>{visible.length} resultados · ordenados por actas pendientes</p></div>
        <label className="search-field">
          <span className="sr-only">Buscar municipio</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar municipio o código…" />
        </label>
      </div>
      <div className="municipality-list">
        {visible.map((item) => {
          const progress = item.total ? Math.round((item.reviewed / item.total) * 100) : 0;
          return (
            <Link className="municipality-row" href={`/municipios/${item.id}`} key={item.id}>
              <div className="municipality-name">
                <strong>{item.name}</strong>
                <span>Depto. {item.departmentCode} · Código {item.id}</span>
              </div>
              <div className="progress-wrap">
                <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                <small>{progress}% revisado</small>
              </div>
              <div className="row-stat"><strong>{item.pending.toLocaleString("es-CO")}</strong><span>pendientes</span></div>
              <div className="row-stat muted"><strong>{item.reviewed.toLocaleString("es-CO")}</strong><span>revisadas</span></div>
              <div className="row-stat danger"><strong>{item.discrepancies.toLocaleString("es-CO")}</strong><span>discrepancias</span></div>
              <span className="row-arrow" aria-hidden>→</span>
            </Link>
          );
        })}
        {!visible.length && <p className="empty-state">No hay municipios que coincidan con la búsqueda.</p>}
      </div>
    </section>
  );
}
