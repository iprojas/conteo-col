import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getPdfSource } from "@/lib/db";
import {
  buildTransmissionPdfUrl,
  TRANSMISSION_PDF_HOST,
  validPdfRequestId,
} from "@/lib/pdf-source";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 30;

const TRANSMISSION_TIMEOUT_MS = 12_000;
const TRANSMISSION_HEADERS = {
  accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
  "cache-control": "no-cache",
  pragma: "no-cache",
  referer: `https://${TRANSMISSION_PDF_HOST}/`,
  "user-agent": `Mozilla/5.0 (compatible; ConteoCivico/1.0; +${SITE_URL.origin})`,
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

function transmissionResponse(upstream: Response, id: string) {
  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-disposition": `inline; filename="${id}-v1.pdf"`,
    "x-pdf-source": "stored",
  });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("content-type")) headers.set("content-type", "application/pdf");
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function proxyTransmissionPdf(request: Request, id: string, storedUrl: string) {
  const requestUrl = new URL(request.url);
  const requestId = validPdfRequestId(requestUrl.searchParams.get("uuid"));
  let source: URL;
  try {
    source = buildTransmissionPdfUrl(storedUrl, requestId);
  } catch {
    return new Response("Referencia de transmisión inválida", { status: 400 });
  }

  try {
    const upstream = await fetchTransmissionPdf(source, request.headers.get("range"));
    if (upstream.ok) return transmissionResponse(upstream, id);
    console.warn(`[pdf-v1] ${id} respondió HTTP ${upstream.status} en ${source.pathname}`);
    await upstream.body?.cancel();
  } catch (error) {
    const reason = error instanceof Error ? error.name : "UnknownError";
    console.warn(`[pdf-v1] ${id} falló con ${reason} en ${source.pathname}`);
  }
  return new Response("No se pudo obtener el formulario de transmisión", {
    status: 502,
    headers: { "cache-control": "private, no-store" },
  });
}

async function proxyR2Pdf(request: Request, id: string, version: "v1" | "v2", bucket: string, key: string) {
  try {
    const object = await r2Client().send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: request.headers.get("range") ?? undefined,
      ResponseContentType: "application/pdf",
      ResponseContentDisposition: `inline; filename="${id}-${version}.pdf"`,
    }));
    if (!object.Body) throw new Error("R2 devolvió un objeto sin contenido");

    const headers = new Headers({
      "accept-ranges": object.AcceptRanges ?? "bytes",
      "cache-control": object.CacheControl ?? "private, max-age=3600",
      "content-disposition": object.ContentDisposition ?? `inline; filename="${id}-${version}.pdf"`,
      "content-type": object.ContentType ?? "application/pdf",
    });
    if (object.ContentLength !== undefined) headers.set("content-length", object.ContentLength.toString());
    if (object.ContentRange) headers.set("content-range", object.ContentRange);
    if (object.ETag) headers.set("etag", object.ETag);
    if (object.LastModified) headers.set("last-modified", object.LastModified.toUTCString());

    return new Response(object.Body.transformToWebStream(), {
      status: object.ContentRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "UnknownError";
    console.warn(`[pdf-r2] ${id} ${version} falló con ${reason}`);
    return new Response("No se pudo obtener el PDF almacenado", { status: 502 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const { id, version } = await params;
  if (version !== "v1" && version !== "v2") return new Response("Versión inválida", { status: 400 });
  const pdf = await getPdfSource(id, version);
  if (!pdf?.url) return new Response("Acta no encontrada", { status: 404 });

  if (pdf.url.startsWith("r2://")) {
    const reference = new URL(pdf.url);
    const bucket = process.env.R2_BUCKET ?? "conteo-col";
    const key = decodeURIComponent(reference.pathname.replace(/^\//, ""));
    const expectedPrefix = version === "v1" ? "V1/" : "V2/";
    if (reference.hostname !== bucket || !key.startsWith(expectedPrefix)) {
      return new Response("Referencia R2 inválida", { status: 400 });
    }
    return proxyR2Pdf(request, id, version, bucket, key);
  }

  if (version === "v1") return proxyTransmissionPdf(request, id, pdf.url);

  const source = new URL(pdf.url);
  if (source.hostname !== "escrutinios2vueltapresidente2026.registraduria.gov.co") {
    return new Response("Origen de PDF inválido", { status: 400 });
  }
  const proxyUrl = new URL(`/pdf-source/v2${source.pathname}`, request.url);
  return Response.redirect(proxyUrl, 307);
}
