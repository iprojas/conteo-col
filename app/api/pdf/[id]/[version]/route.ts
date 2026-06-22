import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getPdfUrl } from "@/lib/db";

export const runtime = "nodejs";

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

export async function GET(request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const { id, version } = await params;
  if (version !== "v1" && version !== "v2") return new Response("Versión inválida", { status: 400 });
  const url = await getPdfUrl(id, version);
  if (!url) return new Response("Acta no encontrada", { status: 404 });

  if (version === "v2" && url.startsWith("r2://")) {
    const reference = new URL(url);
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

  const source = new URL(url);
  const expectedHost = version === "v1"
    ? "e14segundavueltapresidentet.registraduria.gov.co"
    : "escrutinios2vueltapresidente2026.registraduria.gov.co";
  if (source.hostname !== expectedHost) return new Response("Origen de PDF inválido", { status: 400 });

  const proxyUrl = new URL(`/pdf-source/${version}${source.pathname}`, request.url);
  return Response.redirect(proxyUrl, 307);
}
