import { neon } from "@neondatabase/serverless";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(resolve(root, ".env.local"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (!process.env.DATABASE_URL) {
  throw new Error("Falta DATABASE_URL en el entorno o en .env.local.");
}

const siteUrl = new URL(process.env.SITE_URL?.trim() || "https://conteocol.lat");
const outputPath = resolve(root, process.argv[2] || "data/export.csv");
const batchSize = 5_000;
const sql = neon(process.env.DATABASE_URL);

const columns = [
  "act_id",
  "department_code",
  "municipality_code",
  "municipality_id",
  "municipality_name",
  "zone",
  "station",
  "table_number",
  "status",
  "comment",
  "reviewer_id",
  "reviewed_at",
  "pdf_v1_url",
  "pdf_v2_url",
  "pdf_v1_stored_reference",
  "pdf_v2_stored_reference",
];

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function publicPdfUrl(id, version, storedReference) {
  if (!storedReference) return "";
  return new URL(`/api/pdf/${encodeURIComponent(id)}/${version}`, siteUrl).href;
}

async function write(stream, text) {
  if (!stream.write(text)) await once(stream, "drain");
}

await mkdir(dirname(outputPath), { recursive: true });
const output = createWriteStream(outputPath, { encoding: "utf8" });
await write(output, `${columns.join(",")}\n`);

let lastId = "";
let exported = 0;

while (true) {
  const rows = await sql.query(`
    SELECT
      a.id AS act_id,
      m.department_code,
      m.municipality_code,
      m.id AS municipality_id,
      m.name AS municipality_name,
      a.zone,
      a.station,
      a.table_number,
      a.status,
      a.comment,
      a.reviewer_id,
      a.reviewed_at,
      a.pdf_v1,
      a.pdf_v2
    FROM conteo.acts a
    JOIN conteo.municipalities m ON m.id = a.municipality_id
    WHERE a.id > $1
    ORDER BY a.id
    LIMIT $2
  `, [lastId, batchSize]);

  if (rows.length === 0) break;

  let chunk = "";
  for (const row of rows) {
    const record = {
      ...row,
      pdf_v1_url: publicPdfUrl(row.act_id, "v1", row.pdf_v1),
      pdf_v2_url: publicPdfUrl(row.act_id, "v2", row.pdf_v2),
      pdf_v1_stored_reference: row.pdf_v1,
      pdf_v2_stored_reference: row.pdf_v2,
    };
    chunk += `${columns.map((column) => csvCell(record[column])).join(",")}\n`;
  }
  await write(output, chunk);

  exported += rows.length;
  lastId = rows.at(-1).act_id;
  console.log(`Exportadas: ${exported}`);
}

output.end();
await once(output, "finish");
console.log(`CSV generado: ${outputPath}`);
console.log(`Total de actas: ${exported}`);
