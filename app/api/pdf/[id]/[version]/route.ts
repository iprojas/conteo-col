import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getPdfSource } from "@/lib/db";
import { buildTransmissionPdfUrl } from "@/lib/pdf-source";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  if (version === "v1") {
    try {
      const source = buildTransmissionPdfUrl(pdf.url, pdf.zone);
      const proxyUrl = new URL(`/pdf-source/v1${source.pathname}`, request.url);
      return Response.redirect(proxyUrl, 307);
    } catch {
      return new Response("Referencia de transmisión inválida", { status: 400 });
    }
  }

  const source = new URL(pdf.url);
  if (source.hostname !== "escrutinios2vueltapresidente2026.registraduria.gov.co") {
    return new Response("Origen de PDF inválido", { status: 400 });
  }
  const proxyUrl = new URL(`/pdf-source/v2${source.pathname}`, request.url);
  return Response.redirect(proxyUrl, 307);
}
