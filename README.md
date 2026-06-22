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
