import { neon } from "@neondatabase/serverless";
import type { ActRow, ActStatus, MunicipalitySummary } from "./types";

function database() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL. Configura la conexión de Neon antes de iniciar la app.");
  return neon(connectionString);
}

type MunicipalityDbRow = {
  id: string;
  name: string;
  department_code: string;
  total: string | number;
  pending: string | number;
  reviewed: string | number;
  discrepancies: string | number;
};

function mapMunicipality(row: MunicipalityDbRow): MunicipalitySummary {
  return {
    id: row.id,
    name: row.name,
    departmentCode: row.department_code,
    total: Number(row.total),
    pending: Number(row.pending),
    reviewed: Number(row.reviewed),
    discrepancies: Number(row.discrepancies),
  };
}

type ActDbRow = {
  id: string;
  municipality_id: string;
  municipality_name: string;
  department_code: string;
  zone: string;
  station: string;
  table_number: string;
  status: ActStatus;
  comment: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
};

function mapAct(row: ActDbRow): ActRow {
  return {
    id: row.id,
    municipalityId: row.municipality_id,
    municipalityName: row.municipality_name,
    departmentCode: row.department_code,
    zone: row.zone,
    station: row.station,
    tableNumber: row.table_number,
    status: row.status,
    comment: row.comment,
    reviewerId: row.reviewer_id,
    reviewedAt: row.reviewed_at,
  };
}

export async function getMunicipalities(): Promise<MunicipalitySummary[]> {
  const sql = database();
  const rows = await sql`
    SELECT m.id, m.name, m.department_code,
      COUNT(a.id) AS total,
      COUNT(a.id) FILTER (WHERE a.status = 'pending') AS pending,
      COUNT(a.id) FILTER (WHERE a.status != 'pending') AS reviewed,
      COUNT(a.id) FILTER (WHERE a.status = 'discrepancy') AS discrepancies
    FROM conteo.municipalities m
    JOIN conteo.acts a ON a.municipality_id = m.id
    GROUP BY m.id
    ORDER BY pending DESC, m.name ASC
  ` as MunicipalityDbRow[];
  return rows.map(mapMunicipality);
}

export async function getMunicipality(id: string): Promise<MunicipalitySummary | undefined> {
  const sql = database();
  const rows = await sql`
    SELECT m.id, m.name, m.department_code,
      COUNT(a.id) AS total,
      COUNT(a.id) FILTER (WHERE a.status = 'pending') AS pending,
      COUNT(a.id) FILTER (WHERE a.status != 'pending') AS reviewed,
      COUNT(a.id) FILTER (WHERE a.status = 'discrepancy') AS discrepancies
    FROM conteo.municipalities m
    LEFT JOIN conteo.acts a ON a.municipality_id = m.id
    WHERE m.id = ${id}
    GROUP BY m.id
  ` as MunicipalityDbRow[];
  return rows[0] ? mapMunicipality(rows[0]) : undefined;
}

const actColumns = `
  SELECT a.id, a.municipality_id, m.name AS municipality_name,
    m.department_code, a.zone, a.station, a.table_number, a.status,
    a.comment, a.reviewer_id, a.reviewed_at
  FROM conteo.acts a
  JOIN conteo.municipalities m ON m.id = a.municipality_id
`;

export async function getAct(id: string): Promise<ActRow | undefined> {
  const sql = database();
  const rows = await sql.query(`${actColumns} WHERE a.id = $1`, [id]) as ActDbRow[];
  return rows[0] ? mapAct(rows[0]) : undefined;
}

export async function getPriorityPendingActId(): Promise<string | undefined> {
  const sql = database();
  const rows = await sql`
    SELECT id
    FROM conteo.acts
    WHERE status = 'pending'
      AND municipality_id IN ('31001', '01001', '16001')
    ORDER BY CASE municipality_id
      WHEN '31001' THEN 1
      WHEN '01001' THEN 2
      WHEN '16001' THEN 3
    END, id
    LIMIT 1
  ` as { id: string }[];
  return rows[0]?.id;
}

export async function getNextPendingActId(municipalityId: string): Promise<string | undefined> {
  const sql = database();
  const rows = await sql`
    SELECT id
    FROM conteo.acts
    WHERE municipality_id = ${municipalityId}
      AND status = 'pending'
    ORDER BY id
    LIMIT 1
  ` as { id: string }[];
  return rows[0]?.id;
}

export async function listActs(
  municipalityId: string,
  filter: "pending" | "reviewed" | "discrepancy",
  page: number,
  perPage = 20,
) {
  const sql = database();
  const condition = filter === "reviewed"
    ? "a.status != 'pending'"
    : filter === "discrepancy"
      ? "a.status = 'discrepancy'"
      : "a.status = 'pending'";
  const offset = (page - 1) * perPage;
  const [countRows, actRows] = await Promise.all([
    sql.query(`SELECT COUNT(*) AS count FROM conteo.acts a WHERE a.municipality_id = $1 AND ${condition}`, [municipalityId]),
    sql.query(`${actColumns} WHERE a.municipality_id = $1 AND ${condition} ORDER BY a.id LIMIT $2 OFFSET $3`, [municipalityId, perPage, offset]),
  ]) as [[{ count: string | number }], ActDbRow[]];
  const total = Number(countRows[0].count);
  return { acts: actRows.map(mapAct), total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function getPdfUrl(id: string, version: "v1" | "v2") {
  const sql = database();
  const column = version === "v1" ? "pdf_v1" : "pdf_v2";
  const rows = await sql.query(`SELECT ${column} AS url FROM conteo.acts WHERE id = $1`, [id]) as { url: string }[];
  return rows[0]?.url;
}

export async function saveReview(input: {
  actId: string;
  reviewerId: string;
  result: Exclude<ActStatus, "pending">;
  comment: string | null;
}) {
  const sql = database();
  const rows = await sql`
    WITH recorded AS (
      INSERT INTO conteo.reviews (act_id, reviewer_id, result, comment, created_at)
      SELECT id, ${input.reviewerId}, ${input.result}, ${input.comment}, NOW()
      FROM conteo.acts
      WHERE id = ${input.actId}
      RETURNING id
    ), updated AS (
      UPDATE conteo.acts
      SET status = CASE
          WHEN status = 'discrepancy' OR ${input.result} = 'discrepancy' THEN 'discrepancy'
          ELSE 'no_discrepancy'
        END,
        reviewer_id = CASE
          WHEN status = 'discrepancy' AND ${input.result} != 'discrepancy' THEN reviewer_id
          ELSE ${input.reviewerId}
        END,
        comment = CASE
          WHEN status = 'discrepancy' AND ${input.result} != 'discrepancy' THEN comment
          ELSE ${input.comment}
        END,
        reviewed_at = NOW()
      WHERE id = ${input.actId}
      RETURNING municipality_id
    )
    SELECT u.municipality_id,
      (SELECT id FROM conteo.acts
       WHERE municipality_id = u.municipality_id
         AND status = 'pending' AND id != ${input.actId}
       ORDER BY id LIMIT 1) AS next_act_id
    FROM updated u
    CROSS JOIN recorded r
  ` as { municipality_id: string; next_act_id: string | null }[];
  const saved = rows[0];
  if (!saved) return { saved: false as const, nextActId: null };
  return {
    saved: true as const,
    nextActId: saved.next_act_id,
    municipalityId: saved.municipality_id,
  };
}
