# AGENTS.md — Maintenance Platform (Team 10)

Welcome to the **Campus Facility Maintenance Platform (Team 10)** repository. This document serves as the single source of truth and instruction manual for OpenAI Codex, Antigravity, Claude, Cursor, and any other autonomous AI coding agents working on or analyzing this codebase.

---

## 1. Project Overview & Mission

- **Organization:** Mae Fah Luang University (MFU)
- **Course:** 1305308 Platform Development (Gate 3 & Lab 1 / Lab 2 / Assignment A3 / A5 / A8)
- **Repository Purpose:** A contract-first campus facility maintenance platform that converts repair reports into trackable work orders with role-based dispatching, AI-assisted facility categorization with prompt injection defense, chronological immutable audit history, and deterministic HMAC-SHA256 signed event-driven webhooks with external partner services (Team 12 - Campus Events & Clubs).

---

## 2. Monorepo Architecture & Tech Stack

```text
┌─────────────────────────────────┐       HTTPS       ┌─────────────────────────────────────┐
│ Next.js 15 Frontend (Port 3001) │ ────────────────▶ │ Next.js 15 Backend API (Port 3000) │
│ • 3 Core UI Journeys            │                   │ • REST Route Handlers (App Router)  │
│ • Ticket Tracker & Stepper      │                   │ • Server-Side requireAuth (RBAC)    │
│ • AI Categorization & Fallback  │                   │ • AI Facility Classifier & Defense  │
│ • Staff Dispatch Board          │                   │ • Team 12 Partner Integration       │
└─────────────────────────────────┘                   └──────────────────┬──────────────────┘
                                                                         │
                                          ┌──────────────────────────────┼──────────────────────────────┐
                                          ▼                              ▼                              ▼
                                 ┌────────────────┐             ┌────────────────┐             ┌─────────────────┐
                                 │ Supabase Auth  │             │ PostgreSQL DB  │             │ Team 12 Partner │
                                 │ JWT & Roles    │             │ Work Orders    │             │ Webhook (HMAC)  │
                                 └────────────────┘             └────────────────┘             └─────────────────┘
```

### Core Technologies
- **Runtime:** Node.js **22 LTS or later** (Mandatory for native TypeScript `--experimental-strip-types` support in the test runner)
- **Backend:** Next.js 15.5 App Router, TypeScript 5.9, Zod 4.1.5, `@supabase/supabase-js` 2.57.0
- **Frontend:** Next.js 15.5, React 19.1, Tailwind CSS 3.4.19, Lucide React 1.63, Base UI / Shadcn
- **Database & Auth:** Hosted Supabase PostgreSQL with Row Level Security (RLS), custom triggers, atomic stored procedures, and JWT role-based claims.
- **Testing:** Node.js native test runner (`node:test`, `node:assert/strict`) — zero heavy third-party testing dependencies.

---

## 3. Implemented Features & Architecture Inventory

Everything below is **already implemented and operational** in the repository.

### 3.1 Work-Order 5-Stage Atomic Lifecycle (`lib/status.ts`, `supabase/migrations/`)
The system strictly enforces an atomic, forward-only 5-stage lifecycle state machine:
$$\text{OPEN} \longrightarrow \text{ASSIGNED} \longrightarrow \text{IN\_PROGRESS} \longrightarrow \text{RESOLVED} \longrightarrow \text{CLOSED}$$

1. **`OPEN` (Seq 1):** Initial state upon submission by a student/reporter or via partner integration.
2. **`ASSIGNED` (Seq 2):** Staff assigns a qualified technician to the ticket (`rpc/assign_work_order`).
3. **`IN_PROGRESS` (Seq 3):** Technician initiates physical repairs (`rpc/start_work_order`).
4. **`RESOLVED` (Seq 4):** Staff marks repair completed; **mandatory `resolution_notes`** must be provided (`rpc/resolve_work_order`).
5. **`CLOSED` (Seq 5):** Final verification and closure by staff (`rpc/close_work_order`).

> **Invariant:** Skipping stages (e.g. `OPEN ➔ RESOLVED`), backward moves (`CLOSED ➔ OPEN`), or resolving without notes are rejected by both TypeScript validators (`isAllowedTransition`) and PostgreSQL database triggers (`enforce_status_transition`).

### 3.2 Role-Based Access Control (RBAC) (`backend/lib/auth.ts`)
- **`reporter` (Students & Campus Users):**
  - Allowed: Create tickets (`POST /api/work-orders`), view own tickets (`GET /api/work-orders`), view history (`GET /api/work-orders/{id}/history`).
  - Blocked (`HTTP 403 Forbidden`): Any attempt to assign staff, change status, resolve, close, or soft-archive tickets.
- **`staff` (Technicians & Dispatchers):**
  - Allowed: Full access to all work orders, dispatching, technician assignment, status progression, resolution notes, closure, and soft archiving (`DELETE /api/work-orders/{id}`).
- **Verification:** Evaluated on every protected route via `requireAuth(request, ['staff'])`.

### 3.3 AI Facility Categorization & Defense Engine (`backend/lib/ai-classifier.ts`, `app/api/ai/categorize/route.ts`)
- **MFU Campus Grounding:** Grounded in Mae Fah Luang University buildings (S1 Science Lab, C1/C2 Complex, E1 IT School, AD1 Admin) and Chiang Rai regional facilities issues.
- **Disciplines & SLAs:**
  - `Plumbing` (12h SLA)
  - `Electrical` (8h SLA)
  - `HVAC` (18h SLA)
  - `Safety` (24h SLA)
- **Multilingual Support:** Handles technical English and Thai colloquial terms (e.g., `แอร์ไม่เย็น`, `น้ำรั่ว`, `ไฟดับ`).
- **Threat T-01 Prompt Injection Defense (Lab 1):** Untrusted user inputs are scanned via pre-execution regex interceptors (`[SYSTEM OVERRIDE]`, `DAN`, `CRITICAL_SAFETY_BYPASS`, `ROOT_ADMIN`, etc.). If an attack is detected, the AI safely triggers `fallbackToManual: true` with `decision_method: "Prompt-Defense"` in `< 0.1ms` without executing malicious payloads.
- **Priority Conflict Resolution:** If water is detected near electrical switchboards or live wires, priority automatically elevates to `Safety`.
- **Latency Circuit Breaker & Guardrails:** Strict SLA timeout (<1500ms per NFR-01) and confidence review threshold (minimum 0.40); falls back to manual selection if ambiguous.

### 3.4 Team 12 Partner Integration (`backend/lib/team12-integration.ts`, `backend/app/api/partner/`)
Bidirectional integration with Campus Events & Clubs (Team 12):
1. **Inbound Partner Work Order Creation (`POST /api/partner/work-orders`):**
   - Authenticated via `X-Partner-Key` with constant-time `timingSafeEqual`.
   - Accepts `activity_id`, `idempotency_key`, text category & location hints, schedule notes.
   - Idempotent: duplicate `activity_id` or `idempotency_key` returns existing ticket (`HTTP 200, duplicate: true`) instead of creating duplicates.
2. **Inbound Partner Lookups (`GET /api/partner/work-orders`):** Query by `?activity_id=...` or `?id=...`.
3. **Inbound Partner Modification & Cancellation (`PATCH /api/partner/work-orders`):**
   - Supports venue modification (`location`, `location_id`) and rescheduling (`title`, `description`).
   - Supports immediate cancellation via `action: "cancel"`, which soft-archives the ticket and records an audit trail note.
4. **Partner Health Endpoint (`GET /api/partner/health`):** Authenticated availability check with simulated degradation toggle (`TEAM10_PARTNER_HEALTH_DEGRADED=true`).
5. **Team 10 Webhook Receiver (`POST /api/integrations/team12/webhook`):**
   - Validates `X-Webhook-Secret` and requires `X-Event-ID`.
   - Idempotently records incoming payloads into `partner_webhook_events`.
6. **Outgoing Webhook Dispatcher (`dispatchTeam12StatusChanged`):**
   - Dispatches `maintenance.status_changed` events on every lifecycle change.
   - Signs payloads deterministically with HMAC-SHA256 (`X-Webhook-Signature: sha256=<hex>`).
   - Includes strictly monotonic `sequence` and `version` numbers (`OPEN: 1` ➔ `CLOSED: 5`).
   - Non-blocking: background dispatch (`dispatchStatusChangedWithoutBlocking`) prevents webhook timeouts from blocking database commits.
7. **Team 12 Activity Fetcher (`fetchTeam12ActivitiesWithRetry`):**
   - 3-attempt exponential backoff retry `[0ms, 1000ms, 2000ms]`.
   - Graceful degradation: returns cached stale data with HTTP `Retry-After: 30` when partner is down.

### 3.5 Frontend Interactive Experience (`frontend/app/page.tsx`)
- **3 Core User Journeys:**
  1. **Issue Reporting:** Title, description, live AI categorization button (`/api/ai/categorize`), confidence display, building hint detection, and automatic dropdown fallback.
  2. **Ticket Tracker:** List and search work orders, status filters (`ALL`, `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`), visual 5-stage stepper, SLA countdown, and modal for the immutable chronological audit trail (`status_history`).
  3. **Staff Dispatch Board:** Role-protected technician assignment, start work, resolve with mandatory notes modal, close, and soft-delete/archive.
- **Role Switcher & Mock/Live Auth:** One-click instant toggle between `reporter1@gmail.com` and `staff1@gmail.com` with in-memory JWT handling.

### 3.6 Automated CI Quality Gates & Testing (`.github/workflows/ci.yml`, `backend/tests/`)
Continuous Integration pipeline running 4 automated gates in **38 seconds**:
1. **Gate 1: TypeScript Typecheck:** Full compile check for both `backend` and `frontend`.
2. **Gate 2: Security Dependency Audit:** `npm audit --audit-level=critical`.
3. **Gate 3: 10-Item AI Golden Dataset Benchmark (`golden-dataset.test.ts`):** 100% across all 5 dimensions (Correctness, Safety Defense, Enum Grounding, Schema Validity, Latency SLA <1500ms).
4. **Gate 4: Platform Unit & Security Tests (`unit-suite.test.ts`):** 7 tests verifying state transition enforcement, HMAC generation, prompt injection defense, partner schema validation, monotonic sequence numbering, partner cancellation, and constant-time key validation.

---

## 4. Repository Directory Structure

```text
Maintenance_Team10/
├── .github/
│   └── workflows/
│       └── ci.yml                               # 4-stage GitHub Actions CI Quality Gate
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ai/categorize/route.ts           # AI categorization endpoint (POST)
│   │   │   ├── health/route.ts                  # Public service health check (GET)
│   │   │   ├── integrations/team12/
│   │   │   │   ├── activities/route.ts          # Team 12 activity consumer with retry (GET)
│   │   │   │   └── webhook/route.ts             # Inbound partner webhook receiver (POST)
│   │   │   ├── partner/
│   │   │   │   ├── health/route.ts              # Authenticated partner health check (GET)
│   │   │   │   └── work-orders/route.ts         # Partner ticket CRUD & cancel (POST/GET/PATCH/DELETE)
│   │   │   └── work-orders/
│   │   │       ├── route.ts                     # List (GET) and Create (POST) work orders
│   │   │       └── [id]/
│   │   │           ├── route.ts                 # Retrieve (GET), Update (PATCH), Archive (DELETE)
│   │   │           ├── assign/route.ts          # Assign technician (POST)
│   │   │           ├── close/route.ts           # Close resolved ticket (POST)
│   │   │           ├── history/route.ts         # Chronological audit history (GET)
│   │   │           ├── in-progress/route.ts     # Mark repair in-progress (POST)
│   │   │           ├── resolve/route.ts         # Resolve with notes (POST)
│   │   │           └── start/route.ts           # Alias for in-progress (POST)
│   ├── lib/
│   │   ├── ai-classifier.ts                     # AI facility model & prompt injection defense
│   │   ├── api.ts                               # Standardized JSON response helpers
│   │   ├── auth.ts                              # Bearer JWT verification & RBAC role guards
│   │   ├── env.ts                               # Environment variable loader
│   │   ├── status.ts                            # State machine transition rules & sequences
│   │   ├── supabase-admin.ts                    # Supabase service-role client (server-only)
│   │   ├── supabase-server.ts                   # Supabase client scoped to user Bearer token
│   │   ├── team12-integration.ts                # Partner webhook signing, retries & fetchers
│   │   ├── types.ts                             # Core TypeScript type definitions
│   │   └── work-order-schemas.ts                # Zod schemas for request validation
│   ├── supabase/
│   │   ├── migrations/
│   │   │   ├── 001_initial_schema.sql           # Tables, constraints, enums, triggers
│   │   │   ├── 002_api_policies_and_lifecycle.sql # RLS & assign/resolve/close stored procs
│   │   │   ├── 003_atomic_create_and_start.sql  # create_work_order & start_work_order procs
│   │   │   ├── 004_seed_api_test_data.sql       # Seed fixtures for categories/locations
│   │   │   ├── 005_fix_api_test_uuid_values.sql # Normalized UUID fixtures
│   │   │   ├── 006_partner_webhook_events.sql   # partner_webhook_events table
│   │   │   ├── 007_remove_plumbing_api_test_category.sql # Category deduplication
│   │   │   └── 008_partner_work_orders.sql      # activity_id, idempotency_key, nullable reporter
│   │   └── seed.sql                             # Comprehensive seed script
│   ├── tests/
│   │   ├── golden-dataset.test.ts               # 10-Case AI Golden Dataset Benchmark (Slide 37)
│   │   ├── platform-suite.test.ts               # Minimum 7-Test Platform Suite with live DB
│   │   ├── probe-endpoints.mjs                  # Standalone HTTP probe runner
│   │   └── unit-suite.test.ts                   # Isolated platform unit & security tests
│   ├── package.json                             # Backend scripts and dependencies
│   └── README.md                                # Backend setup and documentation
├── frontend/
│   ├── app/
│   │   ├── globals.css                          # Theme styling (Maia/Mist/Red palette)
│   │   ├── layout.tsx                           # Root layout
│   │   └── page.tsx                             # Unified UI: Tracker, Report Form, Dispatch Board
│   ├── lib/
│   │   ├── supabase-browser.ts                  # Supabase client for browser session
│   │   └── utils.ts                             # UI utility functions
│   ├── tailwind.config.js                       # Tailwind CSS styling configuration
│   ├── package.json                             # Frontend scripts and dependencies
│   └── README.md                                # Frontend setup guide
├── diagrams/                                    # Architectural diagrams and workflows
├── A3-Team10-Database-Design.md                 # Complete database design & schema specification
├── A5-Team10-Integration-Evidence.md            # Inter-service integration & webhook proofs
├── API_TESTING_AND_AUTH_GUIDE.md                # Authentication & API testing handbook
├── architecture.md                              # High-level architecture and component topology
├── Lab1-Security.md                             # Threat model, attack vectors & code defense
├── Lab2-Quality-Gates-and-Testing.md            # CI quality gate report & Red-to-Green evidence
├── MAINTENANCE_CONNECTION.md                    # Team 12 handoff & integration contract
├── PRD_Maintenance.md                           # Product Requirements Document
├── PROJECT_TODO.md                              # Historical implementation roadmap
├── TEAM_PROJECT_BOARD.html                      # Interactive visual task board & exam guide
└── TEAM_ROLES.md                                # Team roles & RBAC permission matrix
```

---

## 5. API Route Specification

Protected routes expect: `Authorization: Bearer <supabase-access-token>`.
Partner routes expect: `X-Partner-Key: <partner-key>`.

| Method | Endpoint | Allowed Roles | Description | Status Code |
|---|---|---|---|---|
| `GET` | `/api/health` | Public | Backend health check | `200` |
| `POST` | `/api/ai/categorize` | `reporter`, `staff` | AI facility categorization with injection defense | `200` |
| `GET` | `/api/work-orders` | `reporter`, `staff` | List active work orders (supports `?status=`, `?location_id=`) | `200` |
| `POST` | `/api/work-orders` | `reporter`, `staff` | Create a new work order (`OPEN`) via `rpc/create_work_order` | `201` |
| `GET` | `/api/work-orders/{id}` | `reporter`, `staff` | Retrieve work order by UUID | `200` / `404` |
| `PATCH` | `/api/work-orders/{id}` | `staff` | Update work order fields (title, description, location) | `200` |
| `DELETE` | `/api/work-orders/{id}` | `staff` | Soft-archive work order (sets `archived_at`) | `200` |
| `POST` | `/api/work-orders/{id}/assign` | `staff` | Assign technician to work order (`rpc/assign_work_order`) | `200` |
| `POST` | `/api/work-orders/{id}/in-progress` | `staff` | Transition from `ASSIGNED` to `IN_PROGRESS` | `200` |
| `POST` | `/api/work-orders/{id}/start` | `staff` | Alias for `in-progress` endpoint | `200` |
| `POST` | `/api/work-orders/{id}/resolve` | **`staff` Only** | Resolve order with mandatory notes (`403` for reporters) | `200` / `403` |
| `POST` | `/api/work-orders/{id}/close` | **`staff` Only** | Close resolved order (`rpc/close_work_order`) | `200` / `403` |
| `GET` | `/api/work-orders/{id}/history` | `reporter`, `staff` | Get chronological immutable audit trail (`status_history`) | `200` |
| `POST` | `/api/partner/work-orders` | Partner Key | Server-to-server create ticket with idempotency & activity link | `201` / `200` |
| `GET` | `/api/partner/work-orders` | Partner Key | Partner fetch by `?activity_id=` or `?work_order_id=` | `200` / `404` |
| `PATCH` | `/api/partner/work-orders` | Partner Key | Partner venue update, reschedule, or cancel (`action: "cancel"`) | `200` / `404` |
| `DELETE` | `/api/partner/work-orders` | Partner Key | Partner soft-archive ticket by activity or work order ID | `200` / `404` |
| `GET` | `/api/partner/health` | Partner Key | Authenticated partner availability probe | `200` / `503` |
| `POST` | `/api/integrations/team12/webhook` | Webhook Secret | Inbound Team 12 webhook receiver with deduplication | `201` / `200` |
| `GET` | `/api/integrations/team12/activities` | `staff` | Staff fetch of Team 12 activities with 3x retry & fallback | `200` / `503` |

---

## 6. Environment Configuration

### Backend (`backend/.env.local`)
```ini
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-secret-key>

# Allowed Frontend Origins (CORS)
FRONTEND_ORIGINS=http://localhost:3001

# Team 12 Partner Integration
TEAM12_PARTNER_API_KEY=replace-with-team-12-partner-key
TEAM12_WEBHOOK_SECRET=replace-with-team-12-webhook-secret
TEAM12_PARTNER_ACTIVITIES_URL=https://pd-project-events-clubs.onrender.com/partner/activities
TEAM12_PARTNER_WEBHOOK_URL=https://pd-project-events-clubs.onrender.com/webhooks/partner

# Team 10 Inbound Partner Authentication
TEAM10_PARTNER_KEY=replace-with-team-10-partner-key
TEAM10_WEBHOOK_SECRET=replace-with-team-10-webhook-secret
# TEAM10_PARTNER_HEALTH_DEGRADED=true  # Set to simulate partner degradation
```

### Frontend (`frontend/.env.local`)
```ini
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

---

## 7. Developer & Agent Commands

Run all commands from the repository root:

### Running Development Servers
```powershell
# Terminal 1 - Start Backend API (Port 3000)
npm run dev --prefix backend

# Terminal 2 - Start Frontend UI (Port 3001)
npm run dev --prefix frontend
```

### Type Checking
```powershell
npm run typecheck --prefix backend
npm run typecheck --prefix frontend
```

### Running Test Suites
```powershell
# Run Fast Platform Unit & Security Tests (Zero-network, no live DB required)
npm run test:unit --prefix backend

# Run 10-Item AI Golden Dataset Benchmark
npm run test:ai-eval --prefix backend

# Run Live Integration 7-Test Platform Suite (Requires running backend & Supabase DB)
npm run test --prefix backend
```

---

## 8. Critical Invariants for Autonomous Agents

When modifying or expanding this codebase, agents **MUST** uphold the following rules:

1. **State Machine Invariant:** Status transitions can only advance sequentially:
   `OPEN` ➔ `ASSIGNED` ➔ `IN_PROGRESS` ➔ `RESOLVED` ➔ `CLOSED`.
   Never allow an endpoint or client to skip states or resolve without non-empty `resolution_notes`.
2. **Authorization Boundary:** A `reporter` role MUST NEVER be permitted to call technician assignment (`/assign`), work initiation (`/in-progress`), resolution (`/resolve`), closure (`/close`), or archiving (`DELETE`). These operations require role `staff` and must respond with `HTTP 403 Forbidden`.
3. **Database Atomicity:** Always update work order state and record status history within the same database transaction. Use the established Supabase stored procedures (`rpc/create_work_order`, `rpc/assign_work_order`, `rpc/start_work_order`, `rpc/resolve_work_order`, `rpc/close_work_order`).
4. **Soft Deletion Policy:** Work orders are never permanently removed with SQL `DELETE`. Always use soft archiving by setting `archived_at = now()`. The `status_history` audit records are permanent and immutable.
5. **Prompt Injection & Safety Defense:** User-supplied text in `description` or `title` is untrusted. Any modifications to AI classification must preserve the XML/text encapsulation and pre-execution regex interceptors in `backend/lib/ai-classifier.ts`. When an attack or low-confidence input is detected, safely trigger `fallbackToManual: true`.
6. **Partner Idempotency & Monotonicity:**
   - Partner work order requests (`POST /api/partner/work-orders`) must preserve idempotency keyed by `activity_id` or `idempotency_key`.
   - Webhook dispatch (`dispatchTeam12StatusChanged`) must maintain strictly monotonic sequence numbers (`OPEN: 1` to `CLOSED: 5`) and HMAC-SHA256 signatures.
   - Webhook dispatch must remain non-blocking so partner latency does not delay core operations.
7. **Timing-Safe Authentication:** Partner key comparisons and webhook secret comparisons must use `node:crypto`'s `timingSafeEqual` to eliminate timing side-channel attacks.
8. **Node.js 22 LTS Compatibility:** Do not introduce Babel, ts-node, or heavy bundlers into the test pipeline. Tests run natively with `node --experimental-strip-types --test`. Keep tests compatible with Node 22+.
9. **Credential Safety:** NEVER commit passwords, Supabase service-role keys, bearer tokens, or webhook secrets to source code or git history.
