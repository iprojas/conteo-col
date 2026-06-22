import { getPdfUrl } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const { id, version } = await params;
  if (version !== "v1" && version !== "v2") return new Response("Versión inválida", { status: 400 });
  const url = await getPdfUrl(id, version);
  if (!url) return new Response("Acta no encontrada", { status: 404 });
  const source = new URL(url);
  const expectedHost = version === "v1"
    ? "e14segundavueltapresidentet.registraduria.gov.co"
    : "escrutinios2vueltapresidente2026.registraduria.gov.co";
  if (source.hostname !== expectedHost) return new Response("Origen de PDF inválido", { status: 400 });

  const proxyUrl = new URL(`/pdf-source/${version}${source.pathname}`, request.url);
  return Response.redirect(proxyUrl, 307);
}
