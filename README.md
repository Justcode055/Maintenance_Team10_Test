# Maintenance Team 10

A contract-first campus maintenance platform that turns repair reports into trackable work orders with role-based dispatching, audit history, and event-driven webhooks.

## Overview

Maintenance Team 10 is a small full-stack monorepo for reporting and managing campus facility issues. It contains two independently runnable Next.js applications:

- `frontend/` — a browser-based API test console and client for reporters and maintenance staff.
- `backend/` — the REST API, authentication and authorization middleware, work-order lifecycle logic, and partner integrations.

The platform uses Supabase PostgreSQL for relational data and Supabase Auth for JWT-based role checks. Status changes can publish signed integration events to downstream systems such as helpdesk, notification, and analytics services.

## Core capabilities

- Create, list, view, update, and archive work orders.
- Track work orders through the lifecycle:
  `OPEN` → `ASSIGNED` → `IN_PROGRESS` → `RESOLVED` → `CLOSED`.
- Assign staff members and record resolution notes.
- Preserve immutable status history and audit information.
- Enforce `reporter` and `staff` permissions on the server.
- Categorize issue descriptions with an AI-oriented flow and manual fallback.
- Publish signed `maintenance.status_changed` webhook events.
- Support partner health checks and Team 12 integration webhooks.

## Architecture

```text
┌──────────────────┐       HTTPS       ┌──────────────────────────┐
│ Next.js frontend │ ────────────────▶ │ Next.js backend API      │
│ Port 3001        │                   │ Port 3000                │
└──────────────────┘                   └───────────┬──────────────┘
                                                   │
                              ┌────────────────────┼───────────────────┐
                              ▼                    ▼                   ▼
                     ┌────────────────┐  ┌────────────────┐  ┌─────────────────┐
                     │ Supabase Auth  │  │ PostgreSQL      │  │ Webhook/partner │
                     │ JWT + roles    │  │ work-order data│  │ integrations    │
                     └────────────────┘  └────────────────┘  └─────────────────┘
```

See [architecture.md](./architecture.md) for the detailed component and failure-handling overview.

## Repository structure

```text
Maintenance_Team10/
├── backend/
│   ├── app/api/work-orders/       # REST route handlers
│   ├── lib/                       # Authentication, validation, and Supabase helpers
│   ├── supabase/migrations/       # Database schema, policies, and lifecycle functions
│   ├── .env.example                # Backend environment template
│   └── README.md                   # Backend setup and deployment details
├── frontend/
│   ├── app/                       # Client pages and API test console
│   ├── lib/                       # Frontend helpers
│   ├── .env.example                # Frontend environment template
│   └── README.md                   # Frontend-specific instructions
├── diagrams/                      # Architecture and design diagrams
├── A3-Team10-Database-Design.md   # Database design documentation
├── PRD_Maintenance.md              # Product requirements document
└── architecture.md                # Platform architecture
```

## Prerequisites

- Node.js 20 or later
- npm
- A Supabase project with Authentication and PostgreSQL enabled
- Access to the project credentials and test-account passwords

## Local setup

### 1. Configure the backend

```powershell
cd backend
npm install
Copy-Item .env.example .env.local
```

Set the required values in `backend/.env.local`. At minimum, configure:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-or-publishable-key>
FRONTEND_ORIGINS=http://localhost:3001
SUPABASE_SERVICE_ROLE_KEY=<server-only-secret-key>
```

Keep service-role keys, webhook secrets, partner keys, and access tokens private. Never commit `.env.local` or expose server-only secrets to the frontend.

### 2. Apply the database migrations

The migration files are in `backend/supabase/migrations`. For a new Supabase project, run them in numeric order using the Supabase SQL Editor or the Supabase CLI:

1. `001_initial_schema.sql`
2. `002_api_policies_and_lifecycle.sql`
3. `003_atomic_create_and_start.sql`
4. `004_seed_api_test_data.sql`
5. `005_fix_api_test_uuid_values.sql`
6. `006_partner_webhook_events.sql`

For CLI-based setup:

```powershell
cd backend
npx supabase login
npx supabase link --project-ref <project-ref>
```

### 3. Configure the frontend

```powershell
cd ..\frontend
npm install
Copy-Item .env.example .env.local
```

Set the following values in `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-or-publishable-key>
```

### 4. Start both applications

Run each application in a separate terminal from the repository root.

**Backend**

```powershell
cd backend
npm run dev
```

The backend runs at `http://localhost:3000`.

**Frontend**

```powershell
cd frontend
npm run dev
```

The frontend runs at `http://localhost:3001`.

Check the backend health endpoint at:

```text
http://localhost:3000/api/health
```

## API routes

The backend exposes the following work-order routes under `/api`:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/work-orders` | Create a work order |
| `GET` | `/work-orders` | List work orders, with filters |
| `GET` | `/work-orders/{id}` | Retrieve one work order |
| `PATCH` | `/work-orders/{id}` | Update work-order metadata |
| `DELETE` | `/work-orders/{id}` | Archive a work order |
| `POST` | `/work-orders/{id}/assign` | Assign a staff member |
| `POST` | `/work-orders/{id}/in-progress` | Move an assigned order into progress |
| `POST` | `/work-orders/{id}/resolve` | Add resolution notes and resolve the order |
| `POST` | `/work-orders/{id}/close` | Close a resolved order |
| `GET` | `/work-orders/{id}/history` | View status and audit history |

Protected routes require a Supabase access token:

```http
Authorization: Bearer <supabase-access-token>
```

The backend verifies the token and role on every protected request. Client-side route guards are not treated as authorization controls.

## Roles and lifecycle rules

- **Reporter** — submits work orders and views personal work-order progress.
- **Staff** — views the dispatch board, assigns work, updates statuses, resolves issues, closes orders, and performs staff-only actions.
- A work order cannot be resolved without an assigned staff member and non-empty resolution notes.
- A work order can only be closed after it reaches `RESOLVED`.
- Deletion archives the record by setting `archived_at`; it does not remove history.

## Validation

Run these commands in each application directory as applicable:

```powershell
npm run typecheck
npm run build
```

The backend also provides:

```powershell
npm run lint
```

## Deployment

The frontend and backend are designed to deploy as separate Vercel projects, with Supabase providing database and authentication services. Configure environment variables in the deployment platform rather than committing secrets to the repository.

Before production deployment:

1. Apply all database migrations.
2. Configure Supabase URL and public key values for the frontend.
3. Configure server-only service keys and webhook secrets for the backend.
4. Set `NEXT_PUBLIC_API_BASE_URL` to the deployed backend API URL.
5. Verify `/api/health` and the integration health endpoints.

## Documentation

- [Product requirements](./PRD_Maintenance.md)
- [Architecture](./architecture.md)
- [Database design](./A3-Team10-Database-Design.md)
- [Backend setup and API details](./backend/README.md)
- [Frontend setup](./frontend/README.md)

## Security

Do not commit passwords, Supabase service-role keys, webhook secrets, partner API keys, or access tokens. Use the provided `.env.example` files as templates and store real values in local environment files or deployment secrets.
