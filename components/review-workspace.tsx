"use client";

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ActRow } from "@/lib/types";

const SyncedPdfViewer = dynamic(
  () => import("./synced-pdf-viewer").then((module) => module.SyncedPdfViewer),
  { ssr: false, loading: () => <div className="pdf-loading">Preparando documentos…</div> },
);

function reviewerId() {
  const existing = localStorage.getItem("reviewerId");
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem("reviewerId", created);
  return created;
}

export function ReviewWorkspace({ act }: { act: ActRow }) {
  const router = useRouter();
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [reachedEnd, setReachedEnd] = useState(false);
  const [isPending, startTransition] = useTransition();
  useEffect(() => { reviewerId(); }, []);

  async function submit(result: "no_discrepancy" | "discrepancy") {
    if (result === "discrepancy" && !comment.trim()) {
      setError("Describe la discrepancia antes de guardar.");
      return;
    }
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actId: act.id, reviewerId: reviewerId(), result, comment: result === "discrepancy" ? comment.trim() : null }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "No se pudo guardar la revisión.");
        return;
      }
      router.push(payload.nextActId ? `/revisar/${payload.nextActId}` : `/municipios/${act.municipalityId}`);
      router.refresh();
    });
  }

  return (
    <>
      <SyncedPdfViewer actId={act.id} onReachedEnd={() => setReachedEnd(true)} />

      {act.status === "pending" && !reachedEnd && (
        <div className="mobile-scroll-hint">Desliza los documentos hasta el final para decidir</div>
      )}

      <aside className={`decision-bar ${act.status === "pending" && !reachedEnd ? "waiting" : "ready"}`}>
        {act.status !== "pending" ? (
          <div className="reviewed-message">
            <strong>Esta acta ya fue revisada.</strong>
            <span>{act.status === "discrepancy" ? `Discrepancia: ${act.comment}` : "No se encontraron discrepancias."}</span>
          </div>
        ) : showComment ? (
          <div className="comment-form">
            <label htmlFor="comment">Describe la discrepancia <span>*</span></label>
            <textarea id="comment" autoFocus value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Indica qué cambia entre ambas versiones…" />
            {error && <p className="form-error">{error}</p>}
            <div><button className="secondary-button" onClick={() => { setShowComment(false); setError(""); }} disabled={isPending}>Cancelar</button><button className="danger-button" onClick={() => submit("discrepancy")} disabled={isPending}>{isPending ? "Guardando…" : "Guardar y continuar →"}</button></div>
          </div>
        ) : (
          <div className="decision-actions">
            <div><strong>¿Las dos versiones coinciden?</strong><span>Revisa cifras, firmas, sellos y anotaciones.</span>{error && <p className="form-error">{error}</p>}</div>
            <button className="outline-danger-button" onClick={() => setShowComment(true)} disabled={isPending}>Marcar discrepancia</button>
            <button className="success-button" onClick={() => submit("no_discrepancy")} disabled={isPending}>{isPending ? "Guardando…" : "✓ Sin discrepancia / siguiente"}</button>
          </div>
        )}
      </aside>
    </>
  );
}
