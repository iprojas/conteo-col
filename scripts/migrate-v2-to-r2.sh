#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.local}"
ACCOUNT_ID="${R2_ACCOUNT_ID:-6596086c2c6737eee1942aeac96e4347}"
BUCKET="${R2_BUCKET:-conteo-col}"
API_BASE="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$BUCKET/objects"
LIMIT=""
ACT_ID=""
JOBS="${JOBS:-8}"
BATCH_SIZE=100

usage() {
  cat <<'EOF'
Uso: scripts/migrate-v2-to-r2.sh [--id ID_ACTA] [--limit CANTIDAD] [--jobs CANTIDAD]

Descarga los PDF v2 pendientes, los sube a R2 y actualiza Neon.
Procesa 8 documentos en paralelo por defecto y muestra progreso cada 100.
Sin opciones procesa todas las actas aún no migradas.
EOF
}

while (($#)); do
  case "$1" in
    --id)
      [[ $# -ge 2 ]] || { echo "Falta el valor de --id" >&2; exit 2; }
      ACT_ID="$2"; shift 2 ;;
    --limit)
      [[ $# -ge 2 ]] || { echo "Falta el valor de --limit" >&2; exit 2; }
      LIMIT="$2"; shift 2 ;;
    --jobs)
      [[ $# -ge 2 ]] || { echo "Falta el valor de --jobs" >&2; exit 2; }
      JOBS="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Opción no reconocida: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -z "$ACT_ID" || "$ACT_ID" =~ ^[0-9]+$ ]] || { echo "El ID debe ser numérico." >&2; exit 2; }
[[ -z "$LIMIT" || "$LIMIT" =~ ^[1-9][0-9]*$ ]] || { echo "El límite debe ser un entero positivo." >&2; exit 2; }
[[ "$JOBS" =~ ^[1-9][0-9]*$ ]] || { echo "La cantidad de procesos debe ser un entero positivo." >&2; exit 2; }
[[ -f "$ENV_FILE" ]] || { echo "No existe $ENV_FILE" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for command in curl jq psql mktemp xargs find; do
  command -v "$command" >/dev/null || { echo "Falta el comando requerido: $command" >&2; exit 1; }
done

: "${DATABASE_URL:?Falta DATABASE_URL en $ENV_FILE}"
: "${CLOUDFLARE_API_TOKEN:?Falta CLOUDFLARE_API_TOKEN en $ENV_FILE}"

where_clause="pdf_v2 <> '' AND pdf_v2 NOT LIKE 'r2://%'"
if [[ -n "$ACT_ID" ]]; then
  where_clause+=" AND id = '$ACT_ID'"
fi
limit_clause=""
[[ -n "$LIMIT" ]] && limit_clause="LIMIT $LIMIT"

query="SELECT id, pdf_v2 FROM conteo.acts WHERE $where_clause ORDER BY id $limit_clause;"
rows_file="$(mktemp)"
result_root="$(mktemp -d)"
batch_file=""
cleanup() {
  [[ -z "$batch_file" ]] || rm -f -- "$batch_file"
  rm -f -- "$rows_file"
  rm -rf -- "$result_root"
}
trap cleanup EXIT INT TERM

if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qAt -F $'\t' -c "$query" > "$rows_file"; then
  echo "No se pudieron consultar las actas en Neon." >&2
  exit 1
fi

total=$(wc -l < "$rows_file")
if ((total == 0)); then
  echo "No hay actas v2 pendientes para los filtros indicados."
  exit 0
fi

format_duration() {
  local seconds="$1"
  printf '%02d:%02d:%02d' "$((seconds / 3600))" "$(((seconds % 3600) / 60))" "$((seconds % 60))"
}

process_one() {
  local id="$1"
  local source_url="$2"
  local key="V2/$id.pdf"
  local target="r2://$BUCKET/$key"
  local current_file upload_response upload_status updated
  current_file="$(mktemp --suffix=.pdf)"
  upload_response="$(mktemp)"

  if ! curl --fail --location --silent --show-error \
      --retry 3 --retry-all-errors --connect-timeout 20 --max-time 180 \
      --output "$current_file" "$source_url"; then
    echo "$id: no se pudo descargar" >&2
    touch "$BATCH_RESULT_DIR/$id.fail"
    rm -f -- "$current_file" "$upload_response"
    return 1
  fi

  upload_status=$(curl --silent --show-error --output "$upload_response" --write-out '%{http_code}' \
    --retry 3 --retry-all-errors --connect-timeout 20 --max-time 180 \
    --request PUT \
    --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    --header "Content-Type: application/pdf" \
    --header "Cache-Control: private, max-age=3600" \
    --data-binary "@$current_file" \
    "$API_BASE/$key") || upload_status="${upload_status:-000}"
  if [[ "$upload_status" != "200" ]] || ! jq -e '.success == true' "$upload_response" >/dev/null 2>&1; then
    echo "$id: R2 rechazó la carga (HTTP $upload_status)" >&2
    touch "$BATCH_RESULT_DIR/$id.fail"
    rm -f -- "$current_file" "$upload_response"
    return 1
  fi

  updated=$(printf '%s\n' \
    "UPDATE conteo.acts SET pdf_v2 = :'target_url' WHERE id = :'act_id' AND pdf_v2 = :'source_url' RETURNING id;" \
    | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qAt \
      -v act_id="$id" -v source_url="$source_url" -v target_url="$target")
  if [[ "$updated" != "$id" ]]; then
    echo "$id: R2 cargó el objeto, pero Neon no aceptó la actualización" >&2
    touch "$BATCH_RESULT_DIR/$id.fail"
    rm -f -- "$current_file" "$upload_response"
    return 1
  fi

  touch "$BATCH_RESULT_DIR/$id.ok"
  rm -f -- "$current_file" "$upload_response"
}

export BUCKET API_BASE DATABASE_URL CLOUDFLARE_API_TOKEN BATCH_RESULT_DIR
export -f process_one

processed=0
successful=0
failed=0
started_at=$(date +%s)
batch_number=0

run_batch() {
  local file="$1"
  local count="$2"
  local batch_started batch_elapsed total_elapsed batch_ok batch_failed rate eta remaining
  ((batch_number += 1))
  BATCH_RESULT_DIR="$result_root/batch-$batch_number"
  mkdir -p -- "$BATCH_RESULT_DIR"
  export BATCH_RESULT_DIR
  batch_started=$(date +%s)

  xargs -0 -n 2 -P "$JOBS" bash -c 'process_one "$1" "$2"' _ < "$file" || true

  batch_ok=$(find "$BATCH_RESULT_DIR" -maxdepth 1 -name '*.ok' -type f | wc -l)
  batch_failed=$((count - batch_ok))
  processed=$((processed + count))
  successful=$((successful + batch_ok))
  failed=$((failed + batch_failed))
  batch_elapsed=$(($(date +%s) - batch_started))
  total_elapsed=$(($(date +%s) - started_at))
  ((total_elapsed > 0)) || total_elapsed=1
  rate=$((processed * 60 / total_elapsed))
  remaining=$((total - processed))
  eta=$((remaining * total_elapsed / processed))

  printf 'Progreso %d/%d | lote %s | total %s | %d docs/min | OK %d | fallos %d | ETA %s\n' \
    "$processed" "$total" "$(format_duration "$batch_elapsed")" \
    "$(format_duration "$total_elapsed")" "$rate" "$successful" "$failed" "$(format_duration "$eta")"
}

batch_file="$(mktemp)"
batch_count=0
while IFS=$'\t' read -r id source_url; do
  printf '%s\0%s\0' "$id" "$source_url" >> "$batch_file"
  ((batch_count += 1))
  if ((batch_count == BATCH_SIZE)); then
    run_batch "$batch_file" "$batch_count"
    rm -f -- "$batch_file"
    batch_file="$(mktemp)"
    batch_count=0
  fi
done < "$rows_file"

if ((batch_count > 0)); then
  run_batch "$batch_file" "$batch_count"
fi

printf 'Completado: %d exitosas, %d fallidas, %d procesadas en %s.\n' \
  "$successful" "$failed" "$processed" "$(format_duration "$(($(date +%s) - started_at))")"
((failed == 0))
