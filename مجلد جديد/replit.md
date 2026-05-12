# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Real-time**: Socket.io (WebSocket multiplayer game)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### لعبة الأساطير (`asateen-game`)
A real-time multiplayer Arabic party game with 4 rounds:
1. **Sports Questions** (أسئلة رياضية) — multiple choice trivia
2. **Draw & Guess** (رسم وتخمين) — draw a word on canvas, other team guesses
3. **Weird Riddles** (ألغاز غريبة) — pick the correct answer to riddles
4. **Secret Code** (الكود السري) — give clues to help team guess a secret word

The game uses Socket.io for real-time communication. All game logic lives in `artifacts/api-server/src/game/`.
Frontend is a React + Vite app at `/`.

### API Server (`api-server`)
Express 5 backend serving:
- `/api` — REST endpoints
- `/socket.io` — WebSocket game server

Game files: `artifacts/api-server/src/game/`
- `types.ts` — TypeScript types
- `questions.ts` — Game questions and word lists
- `rooms.ts` — Room state management
- `socket.ts` — Socket.io event handlers and game logic
