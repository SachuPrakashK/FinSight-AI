# FinSight AI

FinSight AI is a personal finance application. The repository is being built in milestones; the current foundation establishes the frontend, API, shared contracts, design system and translation setup.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Local development

1. Copy `.env.example` to `.env` and set values as needed.
2. Run `npm install --include=dev` at the repository root to install the build and lint tools.
3. Run `npm run dev` to start the API at `http://localhost:3001` and the web app at `http://localhost:5173`.
4. Run `npm run typecheck`, `npm run lint` and `npm run build` before submitting changes.

The API health endpoint is `GET /api/v1/health`. No database-backed features are claimed in this foundation milestone.

## Structure

- `frontend/` — React, TypeScript, Vite, Tailwind CSS and i18next.
- `backend/` — TypeScript Express API entry point and middleware foundation.
- `shared/` — API contracts shared across frontend and backend.

## Environment

See `.env.example`. Secrets belong in local or deployment environment configuration and must not be committed.
