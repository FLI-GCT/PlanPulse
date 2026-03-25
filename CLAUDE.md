# CLAUDE.md

> PlanPulse - Planification dynamique de production (DAG temps reel)

## Commands

```bash
yarn db:up              # Start PostgreSQL + Redis containers
yarn db:migrate         # Run Prisma migrations
yarn db:generate        # Generate Prisma client
yarn seed               # Seed database (idempotent)
yarn dev                # Start API + Frontend in dev mode
yarn dev:api            # Start NestJS API only
yarn dev:frontend       # Start Vite frontend only
yarn dev:ai             # Start Python AI service
yarn test               # Run API tests
yarn test:frontend      # Run frontend tests
```

## Architecture

| Category    | Technologies                                              |
| ----------- | --------------------------------------------------------- |
| **API**     | NestJS 11, TypeScript, Prisma 7, Zod + nestjs-zod        |
| **Realtime**| Socket.IO (@nestjs/websockets), Redis pub/sub             |
| **Frontend**| React 19, Vite 7, TanStack Router, TanStack Query        |
| **State**   | Zustand + Immer (graphStore + uiStore)                    |
| **UI**      | `@fli-dgtf/flow-ui` (Base UI), Tailwind CSS 4, Lucide    |
| **Graphs**  | @xyflow/react (DAG view), D3.js (Gantt, Heatmap)         |
| **AI**      | Python FastAPI, NetworkX, NumPy, SciPy, scikit-learn      |
| **DB**      | PostgreSQL 16, Redis 7                                    |

## Monorepo Layout

```
planpulse/
├── database/           # Prisma 7 schema, migrations, seeds
├── api/                # NestJS 11 backend
├── frontend/           # React 19 + Vite frontend
├── ai/                 # Python FastAPI AI service
├── docker-compose.yml
└── package.json        # Root scripts
```

## Backend Module Pattern (CQRS-lite)

Each module follows this structure:
```
module/
├── _entities.ts        # Zod schemas + Entity class
├── _ports.ts           # Interface tokens (I_XXX_REPOSITORY)
├── _contract.ts        # API DTOs namespace
├── _exceptions.ts      # Domain exceptions
├── commands/           # Write use cases
├── queries/            # Read use cases + Prisma queries
├── adapters/           # Prisma repository implementations
├── module.controller.ts
└── module.module.ts
```

## Frontend Module Pattern

```
features/
├── _api.ts             # React Query hooks
├── _context.ts         # Zustand + Immer store (if needed)
├── _route.route.tsx    # TanStack Router route component
└── components/         # Feature-specific components
```

## Key Conventions

- Path alias: `@/` maps to `./src` (frontend), `src/` absolute imports (API)
- Icons: `import { SearchIcon } from 'lucide-react'` (always `Icon` suffix)
- UI: All components from `@fli-dgtf/flow-ui`, NOT shadcn/Radix
- CSS: `@fli-dgtf/flow-ui/style.css` + Tailwind CSS 4 (CSS-first, no config file)
- Toasts: `import { toast } from 'sonner'`
- Class merge: `import { cn } from '@fli-dgtf/flow-ui'`
- DI tokens: `export const I_OF_REPOSITORY = 'I_OF_REPOSITORY'`
- DTOs: `export namespace OfApi { export class ListRequest extends createZodDto(schema) {} }`
- All labels and messages in French
- Dates: `date-fns` with `fr` locale, format `dd/MM/yyyy`

## Stores

Two Zustand stores, never mix:
- `graphStore` = server-synced data (nodes, edges, margins, critical path, allocations, alerts, KPIs, propagation preview)
- `uiStore` = UI-only state (selectedNode, hoveredNode, filters, dragState, activeView, drawer state)

## WebSocket Protocol

- `of:move-preview` carries `requestId` (incremental counter). Client ignores responses with `requestId < lastEmittedRequestId`.
- On disconnect: banner shown, drag disabled. On reconnect: full `GET /graph` to resync, then resume WS deltas.

## Table `Dependance` - Polymorphic

Uses plain String fields `sourceType`, `sourceId`, `targetType`, `targetId` WITHOUT Prisma @relation.
Type resolution is done in GraphService at the application level.
