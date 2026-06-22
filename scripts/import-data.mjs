import { neon } from "@neondatabase/serverless";
import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");
const sql = neon(connectionString);
const readJson = (name) => JSON.parse(readFileSync(resolve(root, `data/${name}`), "utf8"));
const normalizeId = (value) => String(value ?? "").trim();

console.log("Leyendo fuentes...");
const v1 = readJson("v1.json");
const v2 = readJson("v2.json");
const rows = parse(readFileSync(resolve(root, "data/corporacion.csv")), {
  columns: true,
  skip_empty_lines: true,
  bom: true,
});

const municipalities = new Map();
for (const row of rows) {
  const id = `${row.departamento_codigo}${row.municipio_codigo}`;
  if (!municipalities.has(id)) {
    municipalities.set(id, {
      id,
      department_code: row.departamento_codigo,
      municipality_code: row.municipio_codigo,
      name: row.municipio_nombre,
    });
  }
}

const v2ById = new Map(v2.map((act) => [normalizeId(act.id_informacion_mesa_corporacion), act]));
const pairs = [];
let invalid = 0;
for (const first of v1) {
  const id = normalizeId(first.id_informacion_mesa_corporacion);
  const second = v2ById.get(id);
  const municipalityId = id.slice(2, 7);
  if (!id || !second || !municipalities.has(municipalityId)) {
    invalid += 1;
    continue;
  }
  pairs.push({
    id,
    municipality_id: municipalityId,
    zone: id.slice(7, 9),
    station: id.slice(9, 11),
    table_number: id.slice(11),
    pdf_v1: first.nombre_archivo,
    pdf_v2: second.nombre_archivo,
  });
}

console.log("Preparando esquema...");
await sql`CREATE SCHEMA IF NOT EXISTS conteo`;
await sql`
  CREATE TABLE IF NOT EXISTS conteo.municipalities (
    id text PRIMARY KEY,
    department_code text NOT NULL,
    municipality_code text NOT NULL,
    name text NOT NULL
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS conteo.acts (
    id text PRIMARY KEY,
    municipality_id text NOT NULL REFERENCES conteo.municipalities(id),
    zone text NOT NULL,
    station text NOT NULL,
    table_number text NOT NULL,
    pdf_v1 text NOT NULL,
    pdf_v2 text NOT NULL,
    status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'no_discrepancy', 'discrepancy')),
    reviewer_id text,
    comment text,
    reviewed_at timestamptz
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS conteo.reviews (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    act_id text NOT NULL REFERENCES conteo.acts(id),
    reviewer_id text NOT NULL,
    result text NOT NULL CHECK (result IN ('no_discrepancy', 'discrepancy')),
    comment text,
    created_at timestamptz NOT NULL
  )
`;

async function insertBatches(items, size, query, label) {
  for (let offset = 0; offset < items.length; offset += size) {
    const batch = items.slice(offset, offset + size);
    await sql.query(query, [JSON.stringify(batch)]);
    if (offset === 0 || offset + size >= items.length || (offset / size) % 20 === 0) {
      console.log(`${label}: ${Math.min(offset + size, items.length)}/${items.length}`);
    }
  }
}

await insertBatches([...municipalities.values()], 500, `
  INSERT INTO conteo.municipalities (id, department_code, municipality_code, name)
  SELECT id, department_code, municipality_code, name
  FROM jsonb_to_recordset($1::jsonb)
    AS source(id text, department_code text, municipality_code text, name text)
  ON CONFLICT (id) DO UPDATE SET
    department_code = EXCLUDED.department_code,
    municipality_code = EXCLUDED.municipality_code,
    name = EXCLUDED.name
`, "Municipios");

await insertBatches(pairs, 500, `
  INSERT INTO conteo.acts
    (id, municipality_id, zone, station, table_number, pdf_v1, pdf_v2)
  SELECT id, municipality_id, zone, station, table_number, pdf_v1, pdf_v2
  FROM jsonb_to_recordset($1::jsonb)
    AS source(
      id text, municipality_id text, zone text, station text,
      table_number text, pdf_v1 text, pdf_v2 text
    )
  ON CONFLICT (id) DO UPDATE SET
    municipality_id = EXCLUDED.municipality_id,
    zone = EXCLUDED.zone,
    station = EXCLUDED.station,
    table_number = EXCLUDED.table_number,
    pdf_v1 = EXCLUDED.pdf_v1,
    pdf_v2 = EXCLUDED.pdf_v2
`, "Actas");

await sql`CREATE INDEX IF NOT EXISTS acts_municipality_status ON conteo.acts(municipality_id, status, id)`;
await sql`CREATE INDEX IF NOT EXISTS reviews_act ON conteo.reviews(act_id, created_at)`;

console.log(`Municipios: ${municipalities.size}`);
console.log(`Actas emparejadas: ${pairs.length}`);
console.log(`Registros de v1 sin pareja o municipio: ${invalid}`);
