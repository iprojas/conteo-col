#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INPUT="${1:-$SCRIPT_DIR/allTransmissionCodes.json}"
OUTPUT="${2:-$SCRIPT_DIR/informacion-mesas-urls.json}"
BASE_URL="https://e14segundavueltapresidentet.registraduria.gov.co/assets/temis/pdf"
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
  def mesa_id:
    (
      .idCorporationCode[1:] +
      .idDepartmentCode +
      .municipalityCode +
      .idZoneCode +
      .standCode +
      (.numberStand | tonumber | tostring)
    ) as $id
    | $id + (" " * ([16 - ($id | length), 0] | max));

  [
    .data[] | .nodes[]
    | {
        digitalizado: 1,
        escrutado: true,
        id_informacion_mesa_corporacion: mesa_id,
        nombre_archivo: (
          $base_url + "/" +
          .idDepartmentCode + "/" +
          .municipalityCode + "/" +
          .idCorporationCode + "/" +
          .standCode + "/" +
          .numberStand + "/PRE/" +
          .expectedName
        )
      }
  ]
' "$INPUT" > "$TEMPORARY"

mv -- "$TEMPORARY" "$OUTPUT"
trap - EXIT

echo "Archivo generado: $OUTPUT"
