export const TRANSMISSION_PDF_HOST = "e14segundavueltapresidentet.registraduria.gov.co";

export function buildTransmissionPdfUrl(storedUrl: string, requestId: string) {
  const source = new URL(storedUrl);
  if (source.hostname !== TRANSMISSION_PDF_HOST) {
    throw new Error("Origen de PDF V1 inválido");
  }

  const segments = source.pathname.split("/");
  const pdfSegment = segments.indexOf("pdf");
  if (pdfSegment < 0 || segments[pdfSegment + 6] !== "PRE" || !segments[pdfSegment + 7]?.endsWith(".pdf")) {
    throw new Error("Ruta de PDF V1 inválida");
  }

  source.search = "";
  source.searchParams.set("uuid", requestId);
  return source;
}

export function validPdfRequestId(value: string | null) {
  return value && /^\d{10,17}$/.test(value) ? value : Date.now().toString();
}
