# Peruvigia

Bootstrap base del monorepo para el MVP de Vigia.

## Prerrequisitos

- Node.js 22+
- `pnpm` 10+
- `vp` instalado globalmente como CLI de Vite+

## Primer arranque

```bash
pnpm install
vp run dev
```

## Comandos principales

```bash
vp run dev
vp run build
vp run check
```

Tambien estan disponibles como scripts raiz via `pnpm dev`, `pnpm build` y `pnpm check`.

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

- `PORT`: puerto HTTP de la API
- `PUBLIC_API_BASE_URL`: base URL que usa la web para consultar la API

## Notas de tooling

- `Vite+` es el runner y checker oficial del repositorio.
- No se configura `ESLint` ni `Prettier`.
- La validacion del repo vive en `vp run check`.
