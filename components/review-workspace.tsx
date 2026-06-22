"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
  const [isSkipping, setIsSkipping] = useState(false);
  const [isPending, startTransition] = useTransition();
  useEffect(() => { reviewerId(); }, []);

  const assignmentUrl = useCallback((excludeCurrent = false) => {
    let excludedActIds: string[] = [];
    try {
      excludedActIds = JSON.parse(sessionStorage.getItem("unavailableActIds") ?? "[]");
      if (!Array.isArray(excludedActIds)) excludedActIds = [];
    } catch {
      excludedActIds = [];
    }
    if (excludeCurrent && !excludedActIds.includes(act.id)) {
      excludedActIds.push(act.id);
      excludedActIds = excludedActIds.slice(-50);
      sessionStorage.setItem("unavailableActIds", JSON.stringify(excludedActIds));
    }
    const exclude = excludedActIds.length ? `?exclude=${encodeURIComponent(excludedActIds.join(","))}` : "";
    return `/municipios/${act.municipalityId}/revisar${exclude}`;
  }, [act.id, act.municipalityId]);

  const skipUnavailable = useCallback(() => {
    setIsSkipping(true);
    router.replace(assignmentUrl(true));
  }, [assignmentUrl, router]);

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
      router.replace(assignmentUrl());
      router.refresh();
    });
  }

  return (
    <>
      {isSkipping ? (
        <div className="pdf-loading">Buscando otra acta disponible…</div>
      ) : (
        <SyncedPdfViewer actId={act.id} onReachedEnd={() => setReachedEnd(true)} onUnavailable={skipUnavailable} />
      )}

      {!isSkipping && !reachedEnd && (
        <div className="mobile-scroll-hint">Desliza los documentos hasta el final para decidir</div>
      )}

      {!isSkipping && <aside className={`decision-bar ${!reachedEnd ? "waiting" : "ready"}`}>
        {showComment ? (
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
            <button className="success-button" onClick={() => submit("no_discrepancy")} disabled={isPending}>{isPending ? "Guardando…" : "✓ Sin discrepancia"}</button>
          </div>
        )}
      </aside>}
    </>
  );
}
