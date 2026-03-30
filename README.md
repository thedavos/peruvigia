# Peruvigia

Bootstrap base del monorepo para el MVP de Vigia.

## Prerrequisitos

- Node.js 22+
- `pnpm` 10+

## Primer arranque

```bash
pnpm install
pnpm dev
```

## Comandos principales

```bash
pnpm dev
pnpm build
pnpm check
pnpm start:api
pnpm db:check
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

El proyecto declara `vite-plus` localmente, asi que los scripts funcionan sin requerir un `vp`
global. Si ya lo tienes instalado globalmente, tambien puedes seguir usando `vp run ...`.

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

- `DATABASE_URL`: conexion a PostgreSQL para la API y el script `pnpm db:check`
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

- `web` build: `pnpm --filter @peruvigia/web build`
- `web` publish directory: `apps/web/dist`
- `api` build: `pnpm --filter @peruvigia/api build`
- `api` start: `pnpm --filter @peruvigia/api start`
- prueba PostgreSQL: `pnpm db:check`
- generar migraciones: `pnpm db:generate`
- aplicar migraciones: `pnpm db:migrate`

Variables minimas por servicio:

- `web`: `API_URL`
- `api`: `PORT`, `DATABASE_URL`, `WEB_URL`, `OLLAMA_BASE_URL`

## Base de datos

La capa de datos del MVP vive en `apps/api` y usa `drizzle-orm` con PostgreSQL.

Flujo recomendado:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:check
```

La primera migracion crea las tablas base del MVP:

- `people`
- `source_records`
- `signals`
- `entities`
- `person_entity_links`
- `score_snapshots`
- `search_aliases`

El modelo y sus relaciones estan documentados en `docs/data-model.md`.

## Notas de tooling

- `Vite+` es el runner y checker oficial del repositorio.
- No se configura `ESLint` ni `Prettier`.
- La validacion del repo vive en `vp run check`.
