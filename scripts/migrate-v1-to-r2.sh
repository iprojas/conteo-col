#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.local}"
ACCOUNT_ID="${R2_ACCOUNT_ID:-6596086c2c6737eee1942aeac96e4347}"
BUCKET="${R2_BUCKET:-conteo-col}"
API_BASE="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$BUCKET/objects"
TRANSMISSION_HOST="e14segundavueltapresidentet.registraduria.gov.co"
LIMIT=""
ACT_ID=""
MUNICIPALITY_ID=""
JOBS="${JOBS:-8}"
BATCH_SIZE=400

usage() {
  cat <<'EOF'
Uso: scripts/migrate-v1-to-r2.sh [--id ID_ACTA] [--municipality CODIGO] [--limit CANTIDAD] [--jobs CANTIDAD]

Corrige la ruta de los PDF v1, los descarga, los sube a R2 y actualiza Neon.
Procesa 8 documentos en paralelo por defecto y muestra progreso por lote.
Sin opciones procesa todas las actas v1 aún no migradas.
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
    --municipality)
      [[ $# -ge 2 ]] || { echo "Falta el valor de --municipality" >&2; exit 2; }
      MUNICIPALITY_ID="$2"; shift 2 ;;
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
[[ -z "$MUNICIPALITY_ID" || "$MUNICIPALITY_ID" =~ ^[0-9]{5}$ ]] || { echo "El código de municipio debe tener cinco dígitos." >&2; exit 2; }
[[ -z "$LIMIT" || "$LIMIT" =~ ^[1-9][0-9]*$ ]] || { echo "El límite debe ser un entero positivo." >&2; exit 2; }
[[ "$JOBS" =~ ^[1-9][0-9]*$ ]] || { echo "La cantidad de procesos debe ser un entero positivo." >&2; exit 2; }
[[ -f "$ENV_FILE" ]] || { echo "No existe $ENV_FILE" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for command in curl jq psql mktemp xargs find head date; do
  command -v "$command" >/dev/null || { echo "Falta el comando requerido: $command" >&2; exit 1; }
done

: "${DATABASE_URL:?Falta DATABASE_URL en $ENV_FILE}"
: "${CLOUDFLARE_API_TOKEN:?Falta CLOUDFLARE_API_TOKEN en $ENV_FILE}"

where_clause="pdf_v1 <> '' AND pdf_v1 NOT LIKE 'r2://%'"
if [[ -n "$ACT_ID" ]]; then
  where_clause+=" AND id = '$ACT_ID'"
fi
if [[ -n "$MUNICIPALITY_ID" ]]; then
  where_clause+=" AND municipality_id = '$MUNICIPALITY_ID'"
fi
limit_clause=""
[[ -n "$LIMIT" ]] && limit_clause="LIMIT $LIMIT"

query="SELECT id, zone, pdf_v1 FROM conteo.acts WHERE $where_clause ORDER BY id $limit_clause;"
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
  echo "No hay actas v1 pendientes para los filtros indicados."
  exit 0
fi

format_duration() {
  local seconds="$1"
  printf '%02d:%02d:%02d' "$((seconds / 3600))" "$(((seconds % 3600) / 60))" "$((seconds % 60))"
}

correct_source_url() {
  local source_url="$1"
  local zone="$2"
  local padded_zone prefix remainder
  printf -v padded_zone '%03d' "$((10#$zone))"
  prefix="https://${TRANSMISSION_HOST}/assets/temis/pdf/"
  [[ "$source_url" == "$prefix"* ]] || return 1
  remainder="${source_url#"$prefix"}"
  if [[ "$remainder" =~ ^([0-9]{2}/[0-9]{3}/)[0-9]{3}(/.*)$ ]]; then
    printf '%s%s%s%s' "$prefix" "${BASH_REMATCH[1]}" "$padded_zone" "${BASH_REMATCH[2]}"
    return 0
  fi
  return 1
}

download_pdf() {
  local url="$1"
  local output="$2"
  local separator="?"
  [[ "$url" == *\?* ]] && separator="&"
  curl --fail --location --silent --show-error --http1.1 \
    --retry 3 --retry-all-errors --connect-timeout 20 --max-time 180 \
    --header 'Accept: application/pdf,application/octet-stream;q=0.9,*/*;q=0.8' \
    --header 'Cache-Control: no-cache' \
    --header "Referer: https://${TRANSMISSION_HOST}/" \
    --user-agent 'Mozilla/5.0 (compatible; ConteoCivicoMigration/1.0)' \
    --output "$output" "${url}${separator}uuid=$(date +%s%3N)"
}

is_pdf() {
  local file="$1"
  [[ -s "$file" ]] && [[ "$(head -c 5 "$file")" == '%PDF-' ]]
}

process_one() {
  local id="$1"
  local zone="$2"
  local source_url="$3"
  local corrected_url key target current_file upload_response upload_status updated
  key="V1/$id.pdf"
  target="r2://$BUCKET/$key"
  current_file="$(mktemp --suffix=.pdf)"
  upload_response="$(mktemp)"

  if ! corrected_url="$(correct_source_url "$source_url" "$zone")"; then
    echo "$id: URL v1 no reconocida" >&2
    touch "$BATCH_RESULT_DIR/$id.fail"
    rm -f -- "$current_file" "$upload_response"
    return 1
  fi

  if ! download_pdf "$corrected_url" "$current_file" || ! is_pdf "$current_file"; then
    rm -f -- "$current_file"
    current_file="$(mktemp --suffix=.pdf)"
    if [[ "$corrected_url" == "$source_url" ]] || ! download_pdf "$source_url" "$current_file" || ! is_pdf "$current_file"; then
      echo "$id: no se pudo descargar un PDF válido" >&2
      touch "$BATCH_RESULT_DIR/$id.fail"
      rm -f -- "$current_file" "$upload_response"
      return 1
    fi
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
    "UPDATE conteo.acts SET pdf_v1 = :'target_url' WHERE id = :'act_id' AND pdf_v1 = :'source_url' RETURNING id;" \
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

export BUCKET API_BASE DATABASE_URL CLOUDFLARE_API_TOKEN TRANSMISSION_HOST BATCH_RESULT_DIR
export -f correct_source_url download_pdf is_pdf process_one

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

  xargs -0 -n 3 -P "$JOBS" bash -c 'process_one "$1" "$2" "$3"' _ < "$file" || true

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
while IFS=$'\t' read -r id zone source_url; do
  printf '%s\0%s\0%s\0' "$id" "$zone" "$source_url" >> "$batch_file"
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
