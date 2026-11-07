# Maintenance Team 10 API

This repository contains the Assignment #3 database migration and Next.js API implementation for the Maintenance platform.

## Setup

The database is hosted in Supabase. The backend and frontend run locally:

- Supabase database and authentication: hosted project
- Backend API: `http://localhost:3000`
- Frontend API console: `http://localhost:3001`

### Prerequisites

- Node.js 22.15 or later and npm
- A Supabase account with access to the Team 10 project
- The Supabase project URL and anon/publishable key
- The test account passwords, shared separately from this repository

### Environment files

1. Install dependencies:

   ```powershell
   cd backend
   npm ci
   ```

2. Create the backend environment file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Replace the placeholder values in `backend/.env.local`:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-or-publishable-key>
   FRONTEND_ORIGINS=http://localhost:3001
   SUPABASE_SERVICE_ROLE_KEY=<server-only-secret-key>
   ```

   The `SUPABASE_SERVICE_ROLE_KEY` is server-only and is required by the Team 12
   webhook receiver. Find it in Supabase Dashboard → Project Settings → API →
   Secret keys (or the legacy `service_role` key). Never expose it in frontend
   code, screenshots, GitHub, or chat.

   Do not commit `.env.local` or share passwords and access tokens in the repository.

### Database setup

The schema and API functions are in `supabase/migrations`. Link the Supabase CLI to the shared project:

```powershell
cd backend
npx supabase login
npx supabase link --project-ref <project-ref>
```

For a new Supabase project, open the Supabase Dashboard SQL Editor and run the migration files in numeric order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_api_policies_and_lifecycle.sql`
3. `supabase/migrations/003_atomic_create_and_start.sql`
4. `supabase/migrations/004_seed_api_test_data.sql`
5. `supabase/migrations/005_fix_api_test_uuid_values.sql`
6. `supabase/migrations/006_partner_webhook_events.sql`
7. `supabase/migrations/007_remove_plumbing_api_test_category.sql`
8. `supabase/migrations/008_partner_work_orders.sql`
9. `supabase/migrations/009_security_hardening.sql`

The current repository uses legacy numeric migration names. If `npx supabase db push` reports that remote migration versions are missing locally, use the SQL Editor procedure above instead of repairing or deleting remote migration history. Migrations 004–005 seed the location and category fixtures; migration 007 consolidates the duplicate Plumbing test category while preserving existing work orders.

### Start the applications

Open two PowerShell terminals from `Maintenance_Team10`.

Terminal 1, backend:

```powershell
cd backend
npm ci
npm run dev
```

Terminal 2, frontend:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set these values in `frontend/.env.local`:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-or-publishable-key>
```

Open the console at `http://localhost:3001` and check the backend at `http://localhost:3000/api/health`.

### First API test

1. Sign in with your own privately provisioned campus account.
2. Submit an issue using **Submit New Ticket** and confirm its status is OPEN.
3. Check the tracker and history. Staff users can use the Dispatch Board to advance the ticket sequentially.

The frontend forwards the Supabase access token as `Authorization: Bearer <token>`. The backend independently verifies the user and its administrator-controlled role on every protected request.

## API routes

- `POST /api/work-orders`
- `GET /api/work-orders`
- `GET /api/work-orders/{id}`
- `PATCH /api/work-orders/{id}`
- `DELETE /api/work-orders/{id}`
- `POST /api/work-orders/{id}/assign`
- `POST /api/work-orders/{id}/in-progress`
- `POST /api/work-orders/{id}/resolve`
- `POST /api/work-orders/{id}/close`
- `GET /api/work-orders/{id}/history`

Protected routes require:

```http
Authorization: Bearer <supabase-access-token>
```

The token user must have `role: reporter` or `role: staff` in administrator-controlled Supabase `app_metadata`. Staff-only routes enforce the role on the server. CORS allows the configured `FRONTEND_ORIGINS` values.

The separate API test client is in `../frontend` and runs on port `3001`.

### Production deployment

The backend and frontend are separate Vercel projects. Run these commands from
PowerShell. Enter secret values directly when Vercel prompts; do not paste them
into Markdown files.

```powershell
# Deploy the backend from Maintenance_Team10/backend
npx vercel login
npx supabase db push --linked
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production --type secret
npx vercel --prod
# Backend production URL:
# https://maintenanceteam10.vercel.app

# Deploy the frontend from Maintenance_Team10/frontend
cd ..\frontend
npx vercel env add NEXT_PUBLIC_API_BASE_URL production
# Enter: https://maintenanceteam10.vercel.app/api
the# Frontend production URL:
# https://frontend-orcin-seven-56.vercel.app
```

After deployment, verify:

```powershell
Invoke-WebRequest https://maintenanceteam10.vercel.app/api/health
```

The Team 10 provider endpoint is
`GET https://maintenanceteam10.vercel.app/api/partner/health` with
`X-Partner-Key`. The Team 10 webhook receiver is
`POST https://maintenanceteam10.vercel.app/api/integrations/team12/webhook`
with `X-Webhook-Secret` and `X-Event-ID`.

## Validation

```powershell
npm run typecheck
npm run build
```

The database migration source is in `supabase/migrations`. Assignment documentation is in `A3-Team10-Database-Design.md`.

## Security deployment requirements

Read [the authentication and testing guide](../API_TESTING_AND_AUTH_GUIDE.md) before deployment. Apply migration 009 and assign trusted `app_metadata.role` values before deploying the matching backend. Partner routes now require the server-only service key and the service-only atomic partner RPCs; missing migrations or credentials return 503 rather than silently bypassing audit or idempotency. Rotate previously exposed demo passwords.
