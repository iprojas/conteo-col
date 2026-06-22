"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PdfDocumentProps {
  documentKey: "v1" | "v2";
  label: string;
  description: string;
  url: string;
  pageWidth: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (source: HTMLDivElement) => void;
  onUnavailable?: () => void;
  onAvailable: (documentKey: "v1" | "v2") => void;
}

const CANONICAL_PAGE_RATIO = 2610 / 856;
const DOCUMENT_LOAD_TIMEOUT_MS = 20_000;

function PdfDocument({ documentKey, label, description, url, pageWidth, scrollRef, onScroll, onUnavailable, onAvailable }: PdfDocumentProps) {
  const [pages, setPages] = useState(0);
  const pageHeight = Math.round(pageWidth * CANONICAL_PAGE_RATIO);

  return (
    <div className="pdf-panel">
      <div className="pdf-label">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <div className="pdf-scroll" ref={scrollRef} onScroll={(event) => onScroll(event.currentTarget)}>
        <Document
          file={url}
          loading={<p className="pdf-message">Cargando documento…</p>}
          error={<p className="pdf-message error">No se pudo cargar este documento.</p>}
          onLoadSuccess={({ numPages }) => {
            setPages(numPages);
            onAvailable(documentKey);
          }}
          onLoadError={onUnavailable}
        >
          {pageWidth > 0 && Array.from({ length: pages }, (_, index) => (
            <div className="pdf-page-frame" style={{ width: pageWidth, height: pageHeight }} key={index + 1}>
              <Page
                pageNumber={index + 1}
                width={pageWidth}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                loading={<p className="pdf-message">Renderizando página {index + 1}…</p>}
                onRenderError={onUnavailable}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}

export function SyncedPdfViewer({
  actId,
  documentRequestId,
  onReachedEnd,
  onUnavailable,
}: {
  actId: string;
  documentRequestId: string;
  onReachedEnd?: () => void;
  onUnavailable?: () => void;
}) {
  const gridRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const synchronizing = useRef(false);
  const failed = useRef(false);
  const availableDocuments = useRef(new Set<"v1" | "v2">());
  const [pageWidth, setPageWidth] = useState(0);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const updateWidth = () => {
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
      const panelWidth = columns === 1 ? grid.clientWidth : (grid.clientWidth - 10) / 2;
      setPageWidth(Math.max(280, Math.floor(panelWidth - 32)));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const reportUnavailable = useCallback(() => {
    if (failed.current) return;
    failed.current = true;
    onUnavailable?.();
  }, [onUnavailable]);

  const reportAvailable = useCallback((documentKey: "v1" | "v2") => {
    availableDocuments.current.add(documentKey);
  }, []);

  useEffect(() => {
    failed.current = false;
    availableDocuments.current.clear();
    if (!onUnavailable) return;
    const timeout = window.setTimeout(() => {
      if (availableDocuments.current.size < 2) reportUnavailable();
    }, DOCUMENT_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [actId, onUnavailable, reportUnavailable]);

  const synchronize = useCallback((source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || synchronizing.current) return;
    const reachedEnd = source.scrollHeight > source.clientHeight
      && source.scrollTop + source.clientHeight >= source.scrollHeight - 24;
    if (reachedEnd) onReachedEnd?.();
    synchronizing.current = true;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => { synchronizing.current = false; });
  }, [onReachedEnd]);

  return (
    <section className="pdf-grid" ref={gridRef}>
      <PdfDocument
        documentKey="v1"
        label="Versión Transmisión"
        description=""
        url={`/api/pdf/${actId}/v1?uuid=${documentRequestId}`}
        pageWidth={pageWidth}
        scrollRef={leftRef}
        onScroll={(source) => synchronize(source, rightRef.current)}
        onUnavailable={reportUnavailable}
        onAvailable={reportAvailable}
      />
      <PdfDocument
        documentKey="v2"
        label="Versión Claveros"
        description=""
        url={`/api/pdf/${actId}/v2`}
        pageWidth={pageWidth}
        scrollRef={rightRef}
        onScroll={(source) => synchronize(source, leftRef.current)}
        onUnavailable={reportUnavailable}
        onAvailable={reportAvailable}
      />
    </section>
  );
}
