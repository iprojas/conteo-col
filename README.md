# Revisión ciudadana de actas

MVP en Next.js para comparar dos versiones públicas de actas electorales y registrar revisiones compartidas.

## Ejecutar

Requiere Node.js 22 o superior.

```bash
npm install
export DATABASE_URL='postgresql://...'
npm run data:import
npm run dev
```

Abre `http://localhost:3000`. El importador cruza `data/v1.json` y `data/v2.json` por `id_informacion_mesa_corporacion`, agrega nombres desde `data/corporacion.csv` y carga el esquema `conteo` en PostgreSQL.

## Persistencia

- Las revisiones se guardan en Neon PostgreSQL y son visibles para todos los usuarios.
- El navegador sólo conserva un `reviewerId` anónimo en `localStorage`.
- La actualización condicional de cada acta evita que dos revisores guarden la misma acta simultáneamente.
- La aplicación usa `@neondatabase/serverless` por HTTP y obtiene la conexión exclusivamente desde `DATABASE_URL`.

## Comandos

```bash
npm run lint
npm run build
npm start
```

Los PDF se sirven mediante `/api/pdf/:id/:version` porque las fuentes originales impiden mostrarlos directamente dentro de un iframe.

## Migrar PDF a R2

Las migraciones son incrementales: cada PDF se descarga a un archivo temporal, se valida, se carga en `V1/` o `V2/` y se elimina localmente antes de continuar.

Para transmisión (V1), el script corrige el segmento de zona y agrega un `uuid` temporal antes de descargar:

```bash
./scripts/migrate-v1-to-r2.sh --id 010100117096
./scripts/migrate-v1-to-r2.sh --limit 100
./scripts/migrate-v1-to-r2.sh --limit 1000 --jobs 8
./scripts/migrate-v1-to-r2.sh --municipality 01001 --jobs 12
./scripts/migrate-v1-to-r2.sh
```

Para claveros (V2):

```bash
./scripts/migrate-v2-to-r2.sh --id 010100101011
./scripts/migrate-v2-to-r2.sh --limit 100
./scripts/migrate-v2-to-r2.sh --limit 1000 --jobs 8
./scripts/migrate-v2-to-r2.sh --municipality 01001 --jobs 12
./scripts/migrate-medellin-v2-to-r2.sh --jobs 12
./scripts/migrate-v2-to-r2.sh
```

El script usa `DATABASE_URL` y `CLOUDFLARE_API_TOKEN` desde `.env.local`. Procesa ocho documentos en paralelo por defecto, acepta `--jobs` para ajustar la concurrencia y reporta tiempo/velocidad cada 100 documentos. La aplicación usa además `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY` para generar descargas privadas temporales.
