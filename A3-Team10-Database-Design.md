# Assignment #3: Data and Query Design

## Submission Information

| Item | Value |
|---|---|
| Project | Maintenance |
| Team | Team 10 |
| Database | Supabase PostgreSQL |
| Backend | Next.js App Router API |
| Prepared | 21 September 2026 |

## 1. Database Choice and Explanation

The Maintenance project uses **Supabase PostgreSQL**. The project data is relational: a work order belongs to one location and one category, can have an assignment, and has an ordered status history. PostgreSQL supports these relationships with primary keys, foreign keys, unique constraints, check constraints, indexes, transactions, triggers, and row-level security (RLS).

Supabase was selected because it provides:

- a hosted PostgreSQL database;
- Supabase Auth for reporter and staff identities;
- SQL migrations and a CLI for repeatable remote deployment;
- a dashboard for inspecting tables, constraints, policies, and data; and
- direct integration with the Next.js backend through `@supabase/supabase-js`.

The Next.js API authenticates each request, validates input, and sends queries to Supabase. Database functions handle multi-step lifecycle operations so that a work-order update and its audit-history entry succeed or fail together.

## 2. Database Schema

The SQL implementation is stored in `backend/supabase/migrations`. The application uses five core tables in the `public` schema.

### 2.1 Location (`public.locations`)

| Column | PostgreSQL type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key; defaults to `gen_random_uuid()` |
| `building` | `varchar(150)` | Not null |
| `floor_room` | `varchar(150)` | Not null |
| `created_at` | `timestamptz` | Not null; defaults to `now()` |

### 2.2 Category (`public.categories`)

| Column | PostgreSQL type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key; defaults to `gen_random_uuid()` |
| `name` | `varchar(100)` | Not null; unique |
| `sla_hours` | `integer` | Not null; must be greater than zero |
| `created_at` | `timestamptz` | Not null; defaults to `now()` |

### 2.3 Work Order (`public.work_orders`)

| Column | PostgreSQL type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key; defaults to `gen_random_uuid()` |
| `reporter_id` | `uuid` | Not null; foreign key to `auth.users(id)` |
| `location_id` | `uuid` | Not null; foreign key to `locations(id)` |
| `category_id` | `uuid` | Not null; foreign key to `categories(id)` |
| `title` | `varchar(200)` | Not null |
| `description` | `text` | Not null |
| `resolution_notes` | `text` | Nullable until resolution; non-empty when status becomes `RESOLVED` |
| `status` | `work_order_status` | Not null; defaults to `OPEN` |
| `created_at` | `timestamptz` | Not null; defaults to `now()` |
| `updated_at` | `timestamptz` | Not null; maintained by a trigger |
| `archived_at` | `timestamptz` | Nullable; used for soft deletion |

The `work_order_status` enum allows only:

`OPEN` -> `ASSIGNED` -> `IN_PROGRESS` -> `RESOLVED` -> `CLOSED`

### 2.4 Assignment (`public.assignments`)

| Column | PostgreSQL type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key; defaults to `gen_random_uuid()` |
| `work_order_id` | `uuid` | Not null; foreign key to `work_orders(id)` with cascade delete |
| `staff_id` | `uuid` | Not null; foreign key to `auth.users(id)` |
| `assigned_at` | `timestamptz` | Not null; defaults to `now()` |

A unique index on `work_order_id` prevents more than one assignment row for the same work order.

### 2.5 Status History (`public.status_history`)

| Column | PostgreSQL type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key; defaults to `gen_random_uuid()` |
| `work_order_id` | `uuid` | Not null; foreign key to `work_orders(id)` with cascade delete |
| `changed_by` | `uuid` | Not null; foreign key to `auth.users(id)` |
| `from_status` | `work_order_status` | Nullable only for the initial `OPEN` entry |
| `to_status` | `work_order_status` | Not null |
| `note` | `text` | Nullable |
| `timestamp` | `timestamptz` | Not null; defaults to `now()` |

### 2.6 Integrity and Query Design

- Foreign keys preserve valid relationships between work orders, locations, categories, assignments, history records, and authenticated users.
- A trigger rejects skipped or reversed status transitions.
- Resolution requires an existing assignment and non-empty resolution notes.
- Closing is allowed only from `RESOLVED`.
- Archiving updates `archived_at` instead of deleting the record and its history.
- Lifecycle database functions use `SECURITY INVOKER`, row locking, and one transaction for the work-order update and history insert.
- Indexes support common filters and lookups: `work_orders(status)`, `work_orders(location_id)`, and `status_history(work_order_id, timestamp)`.
- RLS is enabled on all five public tables. Reporters can read their own work orders, while staff can perform protected lifecycle operations.

## 3. Entity-Relationship Diagram

```mermaid
erDiagram
    LOCATION ||--o{ WORK_ORDER : contains
    CATEGORY ||--o{ WORK_ORDER : classifies
    WORK_ORDER ||--o| ASSIGNMENT : receives
    WORK_ORDER ||--o{ STATUS_HISTORY : records

    LOCATION {
        uuid id PK
        varchar building
        varchar floor_room
        timestamptz created_at
    }

    CATEGORY {
        uuid id PK
        varchar name UK
        integer sla_hours
        timestamptz created_at
    }

    WORK_ORDER {
        uuid id PK
        uuid reporter_id FK
        uuid location_id FK
        uuid category_id FK
        varchar title
        text description
        text resolution_notes
        work_order_status status
        timestamptz created_at
        timestamptz updated_at
        timestamptz archived_at
    }

    ASSIGNMENT {
        uuid id PK
        uuid work_order_id FK_UK
        uuid staff_id FK
        timestamptz assigned_at
    }

    STATUS_HISTORY {
        uuid id PK
        uuid work_order_id FK
        uuid changed_by FK
        work_order_status from_status
        work_order_status to_status
        text note
        timestamptz timestamp
    }
```

`reporter_id`, `staff_id`, and `changed_by` reference identities managed by Supabase Auth. The diagram focuses on the application-owned tables.

## 4. Migration and Remote Deployment

### 4.1 Versioned Migration Files

| Order | File | Purpose |
|---|---|---|
| 1 | `001_initial_schema.sql` | Enum, five core tables, keys, indexes, triggers, and RLS activation |
| 2 | `002_api_policies_and_lifecycle.sql` | RLS policies plus assign, resolve, and close functions |
| 3 | `003_atomic_create_and_start.sql` | Atomic create and start-work functions |
| 4 | `004_seed_api_test_data.sql` | Initial location and category fixtures |
| 5 | `005_fix_api_test_uuid_values.sql` | RFC-compliant UUID fixtures used by the API console |

The optional `backend/supabase/seed.sql` file provides repeatable demonstration records for each lifecycle status.

### 4.2 Deployment Commands

The team ran the commands from `backend/` against the linked hosted Supabase project:

```powershell
npx supabase login
npx supabase link --project-ref <redacted-project-ref>
npx supabase db push --linked
npx supabase db query --linked --file .\supabase\seed.sql
```

### 4.3 Deployment Result

- Deployment date: 20 September 2026.
- `supabase db push` completed successfully and reported that the hosted database was up to date.
- Local migrations `001` through `005` matched the remote migration state.
- Supabase Table Editor showed `locations`, `categories`, `work_orders`, `assignments`, and `status_history` in the `public` schema.
- The seed file was executed through the linked Supabase CLI without requiring a local Docker database.

Project references, database passwords, JWTs, secret keys, and service-role credentials are intentionally excluded from this submission.

## 5. API Design

The API is implemented with Next.js App Router route handlers under `backend/app/api/work-orders`. The deployed API base URL is:

```text
https://maintenanceteam10.vercel.app/api
```

| Operation | Method and endpoint | Access |
|---|---|---|
| Create | `POST /work-orders` | Reporter or staff |
| List | `GET /work-orders` | Authenticated user; RLS filters rows |
| Read one | `GET /work-orders/{id}` | Authenticated user; RLS filters rows |
| Update | `PATCH /work-orders/{id}` | Staff |
| Archive | `DELETE /work-orders/{id}` | Staff |
| Assign | `POST /work-orders/{id}/assign` | Staff |
| Start work | `POST /work-orders/{id}/in-progress` | Staff |
| Resolve | `POST /work-orders/{id}/resolve` | Staff |
| Close | `POST /work-orders/{id}/close` | Staff |
| History | `GET /work-orders/{id}/history` | Authenticated user; RLS filters rows |

The frontend API console authenticates with Supabase and sends the returned access token to the backend. A hosted `GET /api/work-orders` request was verified with a Reporter account and returned `200 OK` with seeded data. The examples below are sanitized demonstrations of the implemented route contracts; IDs, JWTs, and timestamps are illustrative. For readability, lifecycle responses show the fields most relevant to each operation; the implemented database functions return the complete updated work-order row.

## 6. API Request and Response Examples

### 6.1 Authentication Header

```http
Authorization: Bearer <redacted-supabase-jwt>
Content-Type: application/json
```

### 6.2 Create a Work Order

```http
POST /api/work-orders
Authorization: Bearer <redacted-reporter-jwt>
Content-Type: application/json

{
  "location_id": "11111111-1111-4111-8111-111111111111",
  "category_id": "22222222-2222-4222-8222-222222222222",
  "title": "Laboratory water leak",
  "description": "Water is leaking beside the second-floor laboratory."
}
```

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "reporter_id": "<authenticated-user-id>",
  "location_id": "11111111-1111-4111-8111-111111111111",
  "category_id": "22222222-2222-4222-8222-222222222222",
  "title": "Laboratory water leak",
  "description": "Water is leaking beside the second-floor laboratory.",
  "resolution_notes": null,
  "status": "OPEN",
  "created_at": "2026-09-20T10:00:00Z",
  "updated_at": "2026-09-20T10:00:00Z",
  "archived_at": null
}
```

Expected status: `201 Created`. Invalid or missing fields return `400 Bad Request`.

### 6.3 List and Read Work Orders

```http
GET /api/work-orders?status=OPEN&location_id=11111111-1111-4111-8111-111111111111
Authorization: Bearer <redacted-supabase-jwt>
```

```json
{
  "data": [
    {
      "id": "33333333-3333-4333-8333-333333333333",
      "title": "Laboratory water leak",
      "status": "OPEN",
      "archived_at": null
    }
  ]
}
```

```http
GET /api/work-orders/33333333-3333-4333-8333-333333333333
Authorization: Bearer <redacted-supabase-jwt>
```

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "location_id": "11111111-1111-4111-8111-111111111111",
  "category_id": "22222222-2222-4222-8222-222222222222",
  "title": "Laboratory water leak",
  "status": "OPEN",
  "archived_at": null
}
```

Expected status: `200 OK`. An inaccessible or unknown ID returns an error response.

### 6.4 Update a Work Order

```http
PATCH /api/work-orders/33333333-3333-4333-8333-333333333333
Authorization: Bearer <redacted-staff-jwt>
Content-Type: application/json

{
  "title": "Urgent laboratory water leak"
}
```

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "title": "Urgent laboratory water leak",
  "status": "OPEN",
  "updated_at": "2026-09-20T10:05:00Z"
}
```

Expected status: `200 OK`. A reporter attempting this staff-only operation receives `403 Forbidden`.

### 6.5 Assign the Work Order

```http
POST /api/work-orders/33333333-3333-4333-8333-333333333333/assign
Authorization: Bearer <redacted-staff-jwt>
Content-Type: application/json

{
  "staff_id": "44444444-4444-4444-8444-444444444444"
}
```

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "status": "ASSIGNED",
  "updated_at": "2026-09-20T10:10:00Z"
}
```

The database function creates the assignment, changes the status, and inserts an `OPEN` to `ASSIGNED` history record in one transaction.

### 6.6 Start Work

```http
POST /api/work-orders/33333333-3333-4333-8333-333333333333/in-progress
Authorization: Bearer <redacted-staff-jwt>
```

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "status": "IN_PROGRESS",
  "updated_at": "2026-09-20T10:15:00Z"
}
```

Expected status: `200 OK`. The database rejects this transition unless the current status is `ASSIGNED`.

### 6.7 Resolve the Work Order

```http
POST /api/work-orders/33333333-3333-4333-8333-333333333333/resolve
Authorization: Bearer <redacted-staff-jwt>
Content-Type: application/json

{
  "resolution_notes": "Replaced the damaged pipe and tested the water supply."
}
```

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "status": "RESOLVED",
  "resolution_notes": "Replaced the damaged pipe and tested the water supply.",
  "updated_at": "2026-09-20T10:25:00Z"
}
```

Expected status: `200 OK`. Missing assignment or empty resolution notes are rejected.

### 6.8 Close the Work Order

```http
POST /api/work-orders/33333333-3333-4333-8333-333333333333/close
Authorization: Bearer <redacted-staff-jwt>
```

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "status": "CLOSED",
  "updated_at": "2026-09-20T10:30:00Z"
}
```

Expected status: `200 OK`. Only a `RESOLVED` work order can be closed.

### 6.9 Archive a Work Order

```http
DELETE /api/work-orders/33333333-3333-4333-8333-333333333333
Authorization: Bearer <redacted-staff-jwt>
```

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "archived_at": "2026-09-20T10:35:00Z"
}
```

Expected status: `200 OK`. This operation is a soft delete, so the work-order and history rows remain stored.

### 6.10 Read Status History

```http
GET /api/work-orders/33333333-3333-4333-8333-333333333333/history
Authorization: Bearer <redacted-supabase-jwt>
```

```json
{
  "data": [
    {
      "from_status": null,
      "to_status": "OPEN",
      "note": null,
      "timestamp": "2026-09-20T10:00:00Z"
    },
    {
      "from_status": "OPEN",
      "to_status": "ASSIGNED",
      "note": null,
      "timestamp": "2026-09-20T10:10:00Z"
    },
    {
      "from_status": "ASSIGNED",
      "to_status": "IN_PROGRESS",
      "note": null,
      "timestamp": "2026-09-20T10:15:00Z"
    },
    {
      "from_status": "IN_PROGRESS",
      "to_status": "RESOLVED",
      "note": "Replaced the damaged pipe and tested the water supply.",
      "timestamp": "2026-09-20T10:25:00Z"
    },
    {
      "from_status": "RESOLVED",
      "to_status": "CLOSED",
      "note": null,
      "timestamp": "2026-09-20T10:30:00Z"
    }
  ]
}
```

Expected status: `200 OK`. The query orders history by `timestamp` in ascending order.

### 6.11 Error Response Shape

Validation, authorization, and database errors use a consistent JSON envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Required field is missing or invalid"
  }
}
```

## 7. Complete Work-Order Flow

The complete supported flow is:

```text
POST /api/work-orders
  OPEN
    -> POST /api/work-orders/{id}/assign
  ASSIGNED
    -> POST /api/work-orders/{id}/in-progress
  IN_PROGRESS
    -> POST /api/work-orders/{id}/resolve
  RESOLVED
    -> POST /api/work-orders/{id}/close
  CLOSED
```

Each transition is checked in PostgreSQL, updates `work_orders`, and appends to `status_history`. An invalid transition is rejected before the row is changed. The history endpoint provides an auditable record of the complete lifecycle.