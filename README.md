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

## Dominio y despliegue

El dominio canónico de producción es `https://conteocol.lat`. `SITE_URL` permite
declararlo explícitamente en el entorno de despliegue y usa ese dominio como valor
predeterminado. Las visitas al dominio anterior `conteo-col.vercel.app` se
redirigen permanentemente al dominio canónico conservando la ruta. Las variantes
`www.conteocol.lat`, `conteocol.com` y `www.conteocol.com` también redirigen al
dominio canónico.

El dominio debe apuntar por DNS al proveedor donde se ejecute Next.js. Si la
aplicación continúa en Vercel, agrega `conteocol.com`, `www.conteocol.com`,
`conteocol.lat` y `www.conteocol.lat` al proyecto y configura los registros DNS
indicados por Vercel. En otro proveedor, ejecuta `npm run build` y `npm start` con
Node.js 22 o superior y configura todas las variables de `.env.example`.

Los PDF almacenados en R2 se transmiten mediante `/api/pdf/:id/:version`, por lo
que el navegador no depende de la política CORS del bucket ni expone URLs
temporales de R2.

## Migrar PDF a R2

Las migraciones son incrementales: cada PDF se descarga a un archivo temporal, se valida, se carga en `V1/` o `V2/` y se elimina localmente antes de continuar.

Para transmisión (V1), el script corrige el segmento de zona antes de descargar:

```bash
./scripts/migrate-v1-to-r2.sh --id 010100117096
./scripts/migrate-v1-to-r2.sh --limit 100
./scripts/migrate-v1-to-r2.sh --limit 1000 --jobs 2
./scripts/migrate-v1-to-r2.sh --municipality 01001 --jobs 4
./scripts/migrate-v1-to-r2.sh
```

V1 ejecuta una descarga de prueba antes de modificar R2 o Neon y admite como máximo ocho workers. Si Akamai exige una sesión de navegador, exporta manualmente cookies en formato Netscape y usa `--cookie-file /ruta/cookies.txt`. No guardes cookies en el repositorio.

Para claveros (V2):

```bash
./scripts/migrate-v2-to-r2.sh --id 010100101011
./scripts/migrate-v2-to-r2.sh --limit 100
./scripts/migrate-v2-to-r2.sh --limit 1000 --jobs 8
./scripts/migrate-v2-to-r2.sh --municipality 01001 --jobs 12
./scripts/migrate-medellin-v2-to-r2.sh --jobs 12
./scripts/migrate-v2-to-r2.sh
```

Los scripts usan `DATABASE_URL` y `CLOUDFLARE_API_TOKEN` desde `.env.local`, aceptan `--jobs` para ajustar la concurrencia y reportan progreso por lotes. La aplicación usa además `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY` para generar descargas privadas temporales.
