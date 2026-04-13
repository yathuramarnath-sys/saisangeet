# Backend Scaffold

This folder contains the initial Express backend scaffold for the restaurant POS platform.

## Current scope

- Owner dashboard-first module structure
- Shared config, database, middleware, and error handling
- Starter routes and controllers for:
  - auth
  - business profile
  - outlets
  - roles and permissions
  - tax profiles
  - receipt templates
  - devices and POS linking
- Operations API foundation for:
  - live order summary
  - order queue
  - send KOT
  - request bill
  - discount approval
  - void approval

## Run locally

1. Install Node.js 20+ and npm
2. Copy `.env.example` to `.env`
3. Optional: enable PostgreSQL runtime persistence in `.env`

```bash
ENABLE_DATABASE=true
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/restaurant_pos
```

4. Install dependencies:

```bash
npm install
```

5. Start development server:

```bash
npm run dev
```

## Next implementation tasks

- Add SQL migrations from `src/db/schema.sql`
- Replace runtime snapshot persistence with normalized PostgreSQL queries per module
- Add request validation
- Add password hashing and refresh token flow
- Add tests for auth and owner dashboard endpoints

## Operations endpoints

- `GET /api/v1/operations/summary`
- `GET /api/v1/operations/orders`
- `GET /api/v1/operations/orders/:tableId`
- `POST /api/v1/operations/orders/:tableId/kot`
- `POST /api/v1/operations/orders/:tableId/request-bill`
- `POST /api/v1/operations/orders/:tableId/discount-approval`
- `POST /api/v1/operations/orders/:tableId/void-approval`

These endpoints currently support two modes:
- default in-memory mode for local preview
- PostgreSQL runtime-state persistence when `ENABLE_DATABASE=true`

This keeps the working API contract stable while we gradually replace snapshot persistence with normalized module-level SQL repositories.
