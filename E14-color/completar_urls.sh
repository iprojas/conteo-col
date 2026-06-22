#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INPUT="${1:-$SCRIPT_DIR/informacion-mesas.json}"
OUTPUT="${2:-$SCRIPT_DIR/informacion-mesas-urls.json}"
BASE_URL="https://escrutinios2vueltapresidente2026.registraduria.gov.co"
TEMPORARY="${OUTPUT}.tmp"

command -v jq >/dev/null 2>&1 || {
  echo "Error: jq no esta instalado." >&2
  exit 1
}

[[ -f "$INPUT" ]] || {
  echo "Error: no existe el archivo de entrada: $INPUT" >&2
  exit 1
}

trap 'rm -f -- "$TEMPORARY"' EXIT

jq --compact-output --arg base_url "$BASE_URL" '
  map(
    if (.nombre_archivo | type) == "string" and (.nombre_archivo | startswith("/"))
    then .nombre_archivo = ($base_url + .nombre_archivo)
    else .
    end
  )
' "$INPUT" > "$TEMPORARY"

mv -- "$TEMPORARY" "$OUTPUT"
trap - EXIT

echo "Archivo generado: $OUTPUT"
