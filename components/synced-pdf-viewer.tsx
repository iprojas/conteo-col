"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PdfDocumentProps {
  label: string;
  description: string;
  url: string;
  pageWidth: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (source: HTMLDivElement) => void;
}

const CANONICAL_PAGE_RATIO = 2610 / 856;

function PdfDocument({ label, description, url, pageWidth, scrollRef, onScroll }: PdfDocumentProps) {
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
          error={<p className="pdf-message error">No se pudo cargar el documento.</p>}
          onLoadSuccess={({ numPages }) => setPages(numPages)}
        >
          {pageWidth > 0 && Array.from({ length: pages }, (_, index) => (
            <div className="pdf-page-frame" style={{ width: pageWidth, height: pageHeight }} key={index + 1}>
              <Page
                pageNumber={index + 1}
                width={pageWidth}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                loading={<p className="pdf-message">Renderizando página {index + 1}…</p>}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}

export function SyncedPdfViewer({ actId, onReachedEnd }: { actId: string; onReachedEnd?: () => void }) {
  const gridRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const synchronizing = useRef(false);
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
        label="Versión Transmisión"
        description=""
        url={`/api/pdf/${actId}/v1`}
        pageWidth={pageWidth}
        scrollRef={leftRef}
        onScroll={(source) => synchronize(source, rightRef.current)}
      />
      <PdfDocument
        label="Versión Claveros"
        description=""
        url={`/api/pdf/${actId}/v2`}
        pageWidth={pageWidth}
        scrollRef={rightRef}
        onScroll={(source) => synchronize(source, leftRef.current)}
      />
    </section>
  );
}
