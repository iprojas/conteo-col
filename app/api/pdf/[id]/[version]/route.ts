import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getPdfSource } from "@/lib/db";
import {
  buildTransmissionPdfUrl,
  TRANSMISSION_PDF_HOST,
  validPdfRequestId,
} from "@/lib/pdf-source";

export const runtime = "nodejs";
export const maxDuration = 30;

const TRANSMISSION_TIMEOUT_MS = 12_000;
const TRANSMISSION_HEADERS = {
  accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
  "cache-control": "no-cache",
  pragma: "no-cache",
  referer: `https://${TRANSMISSION_PDF_HOST}/`,
  "user-agent": "Mozilla/5.0 (compatible; ConteoCivico/1.0; +https://conteo-col.vercel.app)",
};
const FORWARDED_RESPONSE_HEADERS = [
  "accept-ranges",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

function r2Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("Faltan las credenciales de R2.");
  }
  return new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function fetchTransmissionPdf(url: URL, range: string | null) {
  const headers = new Headers(TRANSMISSION_HEADERS);
  if (range) headers.set("range", range);
  return fetch(url, {
    cache: "no-store",
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(TRANSMISSION_TIMEOUT_MS),
  });
}

function transmissionResponse(upstream: Response, id: string, source: "corrected" | "stored") {
  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-disposition": `inline; filename="${id}-v1.pdf"`,
    "x-pdf-source": source,
  });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("content-type")) headers.set("content-type", "application/pdf");
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function proxyTransmissionPdf(request: Request, id: string, storedUrl: string, zone: string) {
  const requestUrl = new URL(request.url);
  const requestId = validPdfRequestId(requestUrl.searchParams.get("uuid"));
  let corrected: URL;
  let stored: URL;
  try {
    corrected = buildTransmissionPdfUrl(storedUrl, zone, requestId);
    stored = new URL(storedUrl);
    if (stored.hostname !== TRANSMISSION_PDF_HOST) throw new Error("Origen inválido");
    stored.search = "";
    stored.searchParams.set("uuid", requestId);
  } catch {
    return new Response("Referencia de transmisión inválida", { status: 400 });
  }

  const candidates: Array<{ url: URL; source: "corrected" | "stored" }> = [
    { url: corrected, source: "corrected" },
  ];
  if (stored.pathname !== corrected.pathname) candidates.push({ url: stored, source: "stored" });

  for (const candidate of candidates) {
    try {
      const upstream = await fetchTransmissionPdf(candidate.url, request.headers.get("range"));
      if (upstream.ok) return transmissionResponse(upstream, id, candidate.source);
      console.warn(`[pdf-v1] ${id} ${candidate.source} respondió HTTP ${upstream.status} en ${candidate.url.pathname}`);
      await upstream.body?.cancel();
    } catch (error) {
      const reason = error instanceof Error ? error.name : "UnknownError";
      console.warn(`[pdf-v1] ${id} ${candidate.source} falló con ${reason} en ${candidate.url.pathname}`);
      // Try the legacy stored path before returning a stable proxy error.
    }
  }
  return new Response("No se pudo obtener el formulario de transmisión", {
    status: 502,
    headers: { "cache-control": "private, no-store" },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const { id, version } = await params;
  if (version !== "v1" && version !== "v2") return new Response("Versión inválida", { status: 400 });
  const pdf = await getPdfSource(id, version);
  if (!pdf?.url) return new Response("Acta no encontrada", { status: 404 });

  if (version === "v1") return proxyTransmissionPdf(request, id, pdf.url, pdf.zone);

  if (pdf.url.startsWith("r2://")) {
    const reference = new URL(pdf.url);
    const bucket = process.env.R2_BUCKET ?? "conteo-col";
    const key = decodeURIComponent(reference.pathname.replace(/^\//, ""));
    if (reference.hostname !== bucket || !key.startsWith("V2/")) {
      return new Response("Referencia R2 inválida", { status: 400 });
    }
    try {
      const signedUrl = await getSignedUrl(
        r2Client(),
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentType: "application/pdf",
          ResponseContentDisposition: `inline; filename="${id}-v2.pdf"`,
        }),
        { expiresIn: 900 },
      );
      return new Response(null, {
        status: 307,
        headers: { location: signedUrl, "cache-control": "private, no-store" },
      });
    } catch {
      return new Response("No se pudo autorizar el PDF", { status: 502 });
    }
  }

  const source = new URL(pdf.url);
  if (source.hostname !== "escrutinios2vueltapresidente2026.registraduria.gov.co") {
    return new Response("Origen de PDF inválido", { status: 400 });
  }
  const proxyUrl = new URL(`/pdf-source/v2${source.pathname}`, request.url);
  return Response.redirect(proxyUrl, 307);
}
