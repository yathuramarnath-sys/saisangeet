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

- Add SQL migrations from the schema docs
- Implement repository SQL queries
- Add request validation
- Add password hashing and refresh token flow
- Add tests for auth and owner dashboard endpoints
