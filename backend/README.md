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
3. Install dependencies:

```bash
npm install
```

4. Start development server:

```bash
npm run dev
```

## Next implementation tasks

- Add SQL migrations from `src/db/schema.sql`
- Replace the in-memory operations repository with PostgreSQL queries
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

These endpoints currently use an in-memory store so the API contract is available before the PostgreSQL repositories are fully wired.
