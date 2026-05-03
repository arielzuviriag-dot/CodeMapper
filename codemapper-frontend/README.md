# CodeMapper Frontend

Visualizador interactivo de proyectos Java en tiempo real. Frontend Next.js 15 que se conecta a un backend Spring Boot para parsear archivos `.java` y renderizar la arquitectura del proyecto como un grafo de clases (React Flow).

## Stack

- Next.js 15 + React 19 (App Router, TypeScript estricto)
- Tailwind CSS 4 + shadcn/ui (modo oscuro por defecto)
- @xyflow/react para el grafo
- Zustand para estado global
- Framer Motion para animaciones
- Monaco Editor para el viewer de código fuente
- SSE (`EventSource`) para parsing en streaming

## Requisitos

- Node 18+ y pnpm 8+
- Backend [codemapper-backend](../codemapper-backend) corriendo en `http://localhost:8090`

## Setup

```bash
pnpm install
cp .env.example .env.local   # ya viene con la URL por defecto
pnpm dev
```

Abrí <http://localhost:3000>.

## Variables de entorno

| Variable | Default | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8090` | Base URL del backend |

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo en :3000 |
| `pnpm build` | Build de producción |
| `pnpm start` | Servidor de producción |
| `pnpm lint` | Linter de Next |

## Probar end-to-end con un proyecto local

1. Asegurate de que el backend está corriendo en `http://localhost:8090`.
2. `pnpm dev` y abrí <http://localhost:3000>.
3. Tab "Ruta local" → pegá `C:\Users\ariel\Reserva\backend-reserva` → Analizar.
4. Te redirige a `/map/{sessionId}` y va apareciendo el grafo en tiempo real.

## Estructura

```
src/
  app/             # rutas (home + /map/[sessionId])
  components/
    ui/            # primitivas estilo shadcn
    upload/        # tabs de subida
    graph/         # React Flow + nodos custom
    sidebar/       # stats, progreso, panel de detalle
    theme/         # provider dark
  hooks/useSSE.ts  # suscripción al stream del backend
  lib/             # api, sse, layout dagre, types, utils
  store/           # zustand
```
