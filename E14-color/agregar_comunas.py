#!/usr/bin/env python3
"""Descarga y agrega la informacion de mesas listada en json-comunas.txt."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_URL = (
    "https://escrutinios2vueltapresidente2026.registraduria.gov.co"
    "/data/esc/v1/actas-documentos"
)
FILENAME_RE = re.compile(
    r"^actas_documentos_(\d{3})_(\d{2})_(\d{3})_(\d{2})_([0-9A-Z]{2})_"
    r"mesas_\d{8}_\d{6}_\d{3}\.json$"
)


def build_url(filename: str, base_url: str) -> str:
    match = FILENAME_RE.fullmatch(filename)
    if not match:
        raise ValueError(f"Nombre de archivo no reconocido: {filename}")
    return f"{base_url.rstrip('/')}/{'/'.join(match.groups())}/mesas/{filename}"


def download(filename: str, base_url: str, timeout: float, retries: int) -> list[dict]:
    url = build_url(filename, base_url)
    for attempt in range(retries + 1):
        try:
            request = Request(url, headers={"User-Agent": "conteo-col/1.0"})
            with urlopen(request, timeout=timeout) as response:
                payload = json.load(response)
            if not isinstance(payload, list) or not all(isinstance(row, dict) for row in payload):
                raise ValueError("la respuesta no es una lista de objetos JSON")
            return [{key: value for key, value in row.items() if key != "numero"} for row in payload]
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ValueError) as exc:
            if attempt == retries:
                raise RuntimeError(f"{filename}: {exc}") from exc
            time.sleep(min(2**attempt, 8))
    raise AssertionError("bucle de reintentos incompleto")


def parse_args() -> argparse.Namespace:
    directory = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lista", type=Path, default=directory / "json-comunas.txt")
    parser.add_argument("--salida", type=Path, default=directory / "informacion-mesas.json")
    parser.add_argument("--errores", type=Path, default=directory / "errores-descarga.txt")
    parser.add_argument("--base-url", default=BASE_URL)
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--retries", type=int, default=3)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    entries = [line.strip() for line in args.lista.read_text().splitlines() if line.strip()]
    filenames = [filename for filename in entries if filename.startswith("actas_documentos_")]
    ignored = len(entries) - len(filenames)
    if not filenames:
        print(f"No hay archivos actas_documentos en: {args.lista}", file=sys.stderr)
        return 1

    if ignored:
        print(
            f"Entradas ignoradas por no ser actas_documentos: {ignored}",
            file=sys.stderr,
        )

    # Validar toda la lista antes de iniciar solicitudes de red.
    for filename in filenames:
        build_url(filename, args.base_url)

    results: list[list[dict] | None] = [None] * len(filenames)
    errors: list[str] = []
    completed = 0

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(download, filename, args.base_url, args.timeout, args.retries): index
            for index, filename in enumerate(filenames)
        }
        for future in as_completed(futures):
            index = futures[future]
            try:
                results[index] = future.result()
            except Exception as exc:  # Registrar todas las fallas sin perder las descargas exitosas.
                errors.append(str(exc))
            completed += 1
            if completed % 100 == 0 or completed == len(filenames):
                print(
                    f"Procesados {completed}/{len(filenames)}; errores: {len(errors)}",
                    file=sys.stderr,
                    flush=True,
                )

    if errors:
        args.errores.write_text("\n".join(errors) + "\n")
        print(
            f"No se genero la salida: fallaron {len(errors)} solicitudes. "
            f"Detalle en {args.errores}",
            file=sys.stderr,
        )
        return 1

    aggregate = [row for group in results if group is not None for row in group]
    temporary = args.salida.with_suffix(args.salida.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as output:
        json.dump(aggregate, output, ensure_ascii=False, separators=(",", ":"))
        output.write("\n")
    temporary.replace(args.salida)
    args.errores.unlink(missing_ok=True)

    print(f"Comunas procesadas: {len(filenames)}")
    print(f"Registros agregados: {len(aggregate)}")
    print(f"Salida: {args.salida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
