import { NextResponse } from "next/server";
import { saveReview } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  const input = body as Record<string, unknown>;
  const result = input.result;
  const comment = typeof input.comment === "string" ? input.comment.trim() : null;
  if (typeof input.actId !== "string" || typeof input.reviewerId !== "string" || !["no_discrepancy", "discrepancy"].includes(String(result))) {
    return NextResponse.json({ error: "Faltan datos de la revisión." }, { status: 400 });
  }
  if (result === "discrepancy" && !comment) return NextResponse.json({ error: "El comentario es obligatorio." }, { status: 400 });
  const saved = await saveReview({ actId: input.actId, reviewerId: input.reviewerId, result: result as "no_discrepancy" | "discrepancy", comment });
  if (!saved.saved) return NextResponse.json({ error: "Otra persona ya revisó esta acta. Vuelve al municipio para continuar." }, { status: 409 });
  return NextResponse.json(saved);
}
