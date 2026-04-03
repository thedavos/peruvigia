# Peruvigia

Bootstrap base del monorepo para el MVP de Vigia.

## Prerrequisitos

- Node.js 22+
- `pnpm` 10+

## Primer arranque

```bash
vp install
vp run dev
```

## Comandos principales

```bash
vp run dev
vp run build
vp run check
vp run test:api
vp run start:api
vp run sync:contraloria
vp run sync:dji
vp run db:check
vp run db:generate
vp run db:migrate
vp run db:studio
```

Sincronizacion de Contraloria:

```bash
vp run sync:contraloria
vp run sync:contraloria --report-url "https://www.gob.pe/..."
vp run sync:contraloria --input-dir ./tmp/contraloria
vp run sync:contraloria --report-url "https://www.gob.pe/..." --allow-backfill
```

Por defecto, el importador rechaza publicaciones mas antiguas que la ultima fecha ya importada en
`source_records`. Usa `--allow-backfill` solo cuando quieras cargar historico de forma
intencional.

Sincronizacion de DJI:

```bash
vp run sync:dji
vp run sync:dji --input-dir ./tmp/dji
vp run sync:dji --allow-backfill
```

El importador de DJI resuelve distribuciones oficiales desde metadata del catalogo de datos
abiertos y prioriza `json > csv > xml`. Para fixtures offline, `--input-dir` debe contener los
archivos `declarations.*`, `employment.*`, `commercial.*`, `family.*`, `guild.*` y
`board_membership.*`.

`declarations.*` es obligatorio. Los demas son opcionales y se importan solo si la fuente oficial
o tu carpeta offline realmente los tiene disponibles. Esto permite correr el ETL con la oferta
actual verificada del portal, donde hoy estan claros `declarations`, `employment` y `family`.

El proyecto declara `vite-plus` localmente, asi que todo el tooling del repositorio puede entrar
por `vp` sin requerir una instalacion global adicional.

## Estructura

```text
apps/
  api/        Fastify + Swagger
  web/        Astro + Vue + Tailwind
packages/
  shared/     Schemas y tipos compartidos
  config/     Configuracion compartida de TypeScript
```

## Variables de entorno

Copia `.env.example` segun necesites:

- `DATABASE_URL`: conexion a PostgreSQL para la API y el script `vp run db:check`
- `PORT`: puerto HTTP de la API
- `API_URL`: URL publica de la API; la web la usa para consultar el backend
- `WEB_URL`: URL publica de la web; la API la usa para permitir CORS
- `OLLAMA_BASE_URL`: URL base de Ollama para integraciones futuras

Valores practicos en Coolify:

- `WEB_URL`: `https://web.tudominio.com`
- `API_URL`: `https://api.tudominio.com`

## Coolify

Servicios sugeridos para `VIG-5`:

- `web`: `Static Site` separada para la interfaz
- `api`: app separada para Fastify
- `postgres`: servicio PostgreSQL administrado por Coolify

Comandos sugeridos:

- `web` build: `vp run --filter @peruvigia/web build`
- `web` publish directory: `apps/web/dist`
- `api` build: `vp run --filter @peruvigia/api build`
- `api` start: `vp run --filter @peruvigia/api start`
- prueba PostgreSQL: `vp run db:check`
- sincronizar Contraloría: `vp run sync:contraloria`
- sincronizar DJI: `vp run sync:dji`
- generar migraciones: `vp run db:generate`
- aplicar migraciones: `vp run db:migrate`

Variables minimas por servicio:

- `web`: `API_URL`
- `api`: `PORT`, `DATABASE_URL`, `WEB_URL`, `OLLAMA_BASE_URL`

## Base de datos

La capa de datos del MVP vive en `apps/api` y usa `drizzle-orm` con PostgreSQL.

Flujo recomendado:

```bash
vp run db:generate
vp run db:migrate
vp run db:check
```

Las migraciones del MVP crean estas tablas base:

- `people`
- `source_records`
- `signals`
- `entities`
- `person_entity_links`
- `person_person_links`
- `score_snapshots`
- `search_aliases`

El modelo y sus relaciones estan documentados en `docs/data-model.md`.

## API

Rutas disponibles hoy para contexto por persona:

- `GET /people/:personId/contraloria-status`
- `GET /people/:personId/dji-context`

## Notas de tooling

- `Vite+` es el runner y checker oficial del repositorio.
- No se configura `ESLint` ni `Prettier`.
- La validacion del repo vive en `vp run check`.
