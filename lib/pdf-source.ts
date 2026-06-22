export const TRANSMISSION_PDF_HOST = "e14segundavueltapresidentet.registraduria.gov.co";

export function buildTransmissionPdfUrl(storedUrl: string, zone: string, requestId: string) {
  const source = new URL(storedUrl);
  if (source.hostname !== TRANSMISSION_PDF_HOST) {
    throw new Error("Origen de PDF V1 inválido");
  }
  if (!/^\d{1,3}$/.test(zone)) {
    throw new Error("Zona electoral inválida");
  }

  const segments = source.pathname.split("/");
  const pdfSegment = segments.indexOf("pdf");
  const zoneSegment = pdfSegment + 3;
  if (pdfSegment < 0 || !segments[zoneSegment] || segments[pdfSegment + 6] !== "PRE") {
    throw new Error("Ruta de PDF V1 inválida");
  }

  segments[zoneSegment] = zone.padStart(3, "0");
  source.pathname = segments.join("/");
  source.search = "";
  source.searchParams.set("uuid", requestId);
  return source;
}

export function validPdfRequestId(value: string | null) {
  return value && /^\d{10,17}$/.test(value) ? value : Date.now().toString();
}
