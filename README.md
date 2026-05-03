# CodeMapper

Visualizador interactivo de proyectos Java. Parsea código fuente y dibuja un mapa de clases y conexiones en tiempo real.

## Estructura
## Stack

**Backend**
- Java 17
- Spring Boot 3.5
- JavaParser (Symbol Solver)
- Server-Sent Events (SSE) para streaming progresivo

**Frontend**
- Next.js 15 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- React Flow (XYFlow) para grafos
- Zustand para estado
- Monaco Editor para visualizar código

## Cómo correr

### Backend
```bash
cd codemapper-backend
mvn spring-boot:run
```

### Frontend
```bash
cd codemapper-frontend
pnpm install
pnpm dev
```

## Estado del proyecto

🚧 En desarrollo activo
