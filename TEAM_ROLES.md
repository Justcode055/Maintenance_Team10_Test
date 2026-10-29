# Team Roles & Responsibilities — Maintenance Platform (Team 10)

**Course:** 1305308 Platform Development  
**Project:** Campus Facility Maintenance Platform  
**Semester:** 1/2026  
**Last Updated:** 27 October 2026  

---

## 1. System User Roles & Application Permissions (RBAC)

These roles define permissions within the software application itself, enforced by Supabase JWT claims and server-side route guards.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          APPLICATION ACCESS MATRIX                          │
├───────────────────────────────┬──────────────────────┬──────────────────────┤
│ Endpoint / Feature            │ Reporter Role        │ Staff Role           │
├───────────────────────────────┼──────────────────────┼──────────────────────┤
│ Issue Submission (POST)       │ Allowed              │ Allowed              │
│ View Personal Tickets (GET)   │ Allowed (own only)   │ Allowed (all)        │
│ View Audit History (GET)      │ Allowed              │ Allowed              │
│ Assign Technician (POST)      │ BLOCKED (403)        │ Allowed              │
│ Start Work Order (POST)       │ BLOCKED (403)        │ Allowed              │
│ Resolve with Notes (POST)     │ BLOCKED (403)        │ Allowed              │
│ Close Work Order (POST)       │ BLOCKED (403)        │ Allowed              │
│ Soft-Delete / Archive (DELETE)│ BLOCKED (403)        │ Allowed              │
└───────────────────────────────┴──────────────────────┴──────────────────────┘
```

### A. Role: `reporter`
* **Target Users:** Campus students, lecturers, university staff.
* **Authentication Identifier:** `reporter1@gmail.com` (Token: `mock-reporter-token` in local development).
* **Allowed Actions:**
  * Submit new facility repair tickets (`POST /api/work-orders`).
  * View personal submitted tickets and live status tracking (`GET /api/work-orders`).
  * View status transition timeline (`GET /api/work-orders/{id}/history`).
* **Strict Restrictions:** Cannot modify tickets, assign staff, change repair statuses, or soft-delete records.

### B. Role: `staff` (Dispatchers & Maintenance Technicians)
* **Target Users:** Campus facility managers, dispatchers, maintenance engineers, technicians.
* **Authentication Identifier:** `staff1@gmail.com` (Token: `mock-staff-token` in local development).
* **Allowed Actions:**
  * Access full campus dispatch board across all buildings and statuses.
  * Assign technicians to active work orders (`POST /api/work-orders/{id}/assign`).
  * Transition orders to `IN_PROGRESS` upon starting repairs (`POST /api/work-orders/{id}/in-progress`).
  * Submit completion details and mark as `RESOLVED` (`POST /api/work-orders/{id}/resolve`).
  * Finalize and close completed repairs (`POST /api/work-orders/{id}/close`).
  * Soft-delete/archive cancelled or duplicate orders (`DELETE /api/work-orders/{id}`).

---

## 2. Engineering Team Roles & Detailed Responsibilities

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ENGINEERING TEAM ROSTER                            │
├───────────────────────────────┬────────────────────────────┬────────────────┤
│ Name                          │ Student ID                 │ Role Title     │
├───────────────────────────────┼────────────────────────────┼────────────────┤
│ Khant Nyi Nyi Aung            │ 6731503059                 │ Product Mgr    │
│ Hein Zaw                      │ 6731503055                 │ Frontend UX/UI │
│ Ye Myat Min                   │ 6731503094                 │ Backend & DB   │
│ Zwe Nyi Win                   │ 6731503096                 │ QA & Security  │
│ Danielle Jusayan              │ 6731503051                 │ DevOps & Docs  │
└───────────────────────────────┴────────────────────────────┴────────────────┘
```

---

### Role 1: Product Manager (PM)
**Owner:** **Khant Nyi Nyi Aung (6731503059)**

#### Core Objective
Own the product vision, enforce MVP scope discipline, define acceptance criteria, and ensure deliverables strictly satisfy the course rubric and user journey requirements.

#### Key Responsibilities
1. **Scope Control:** Ensure the team prioritizes the core repair journey (`Submit ➔ Assign ➔ Resolve ➔ Close`) and prevents scope creep.
2. **Acceptance Criteria & Scenarios:** Define testable user scenarios for demonstrations, grading reviews, and the AI golden dataset.
3. **Cross-Role Alignment:** Coordinate daily syncs between Frontend, Backend, QA, and Documentation to prevent delivery bottlenecks.

#### Action Checklist
- [ ] Review and validate the 3 Core User Journeys built by Frontend against the PRD.
- [ ] Author the 10-case Golden Dataset for AI categorization in [Lab2-Quality-Gates-and-Testing.md](file:///C:/Users/ADMIN/Desktop/Maintenance_Team10/Lab2-Quality-Gates-and-Testing.md).
- [ ] Lead the interactive live-flow demonstration script for Assignment #3.
- [ ] Coordinate with partner Team 12 (Campus Events) to obtain provider proof sign-off.

---

### Role 2: Frontend UX/UI Developer
**Owner:** **Hein Zaw (6731503055)**

#### Core Objective
Transform the raw developer API console into a responsive, user-friendly client application supporting the 3 Core User Journeys and instant role switching.

#### Key Responsibilities
1. **Interactive UI Journeys:** Build the reporting form, ticket tracking visual stepper, and the staff dispatch board.
2. **Role & Mode Switcher:** Provide a persistent UI header allowing instant switching between `Reporter` and `Staff`, and between `Mock Mode` and `Live API`.
3. **Feedback & Usability States:** Handle loading, error, empty, and permission-denied states clearly without unhandled client errors.

#### Action Checklist
- [ ] Build Top Navigation Bar with Quick Role Switcher (`reporter1@gmail.com` ↔ `staff1@gmail.com`).
- [ ] Build **Journey 1: Issue Submission Screen** (Building/Room selector, Description, Category badges, AI suggestion preview).
- [ ] Build **Journey 2: Ticket Tracking Screen** (Card list, 5-stage visual stepper, Status History audit drawer).
- [ ] Build **Journey 3: Staff Dispatch Board** (Kanban/table view, Assign modal, Resolve modal with notes, Close button).
- [ ] Retain developer API test sub-tab for grading inspection.

---

### Role 3: Backend API and Database Developer
**Owner:** **Ye Myat Min (6731503094)**

#### Core Objective
Maintain server-side reliability, enforce relational constraints and business rules, provide a zero-config mock data layer, and implement the AI categorization service.

#### Key Responsibilities
1. **Zero-Config Mock Layer:** Implement in-memory mock repository seeded with [backend/supabase/seed.sql](file:///C:/Users/ADMIN/Desktop/Maintenance_Team10/backend/supabase/seed.sql) fixtures so routes work offline.
2. **Business Rules Enforcement:** Ensure backend strictly blocks invalid state transitions (BR-01, BR-02) and prevents race conditions.
3. **AI Classification & Fallback (`FR-05`):** Implement prompt template, schema parsing, and the 1500 ms timeout fallback.
4. **Partner Webhook Dispatch:** Maintain signed HMAC-SHA256 webhook dispatch to Team 12 on all status changes.

#### Action Checklist
- [ ] Create `backend/lib/mock-data.ts` and update `env.ts` to allow graceful fallback when Supabase is offline.
- [ ] Update `backend/lib/auth.ts` to accept pre-configured mock tokens (`mock-reporter-token`, `mock-staff-token`).
- [ ] Implement `backend/lib/ai-classifier.ts` with XML input isolation and 1500 ms timeout.
- [ ] Add explicit server logging when dispatching `maintenance.status_changed` webhooks to satisfy Assignment #5 rubric.

---

### Role 4: Quality and Security Engineer (QA & Security)
**Owner:** **Zwe Nyi Win (6731503096)**

#### Core Objective
Design the test strategy, execute security attacks and fixes (Lab 1), implement the Minimum 7-Test Suite (Lab 2), and hunt real bugs to enforce Gate 3 and Assignment A8.

#### Key Responsibilities
1. **Security Vulnerability Audits (Lab 1):** Execute threat modeling, attack the application (Prompt Injection & BOLA/RBAC bypass), apply security controls, and write regression tests.
2. **Test Automation (Lab 2):** Implement the Minimum 7-Test Suite (2 Unit, 2 Integration, 1 Authz, 1 E2E, 1 AI-Behaviour).
3. **AI Behavior Evaluation:** Benchmark the AI classifier against the 10-case Golden Dataset across the 5 evaluation dimensions.
4. **"Hunt a Real Bug" Exercise:** Reproduce a real defect, capture CI failure evidence (Red `X`), verify the fix, and capture green CI evidence.

#### Action Checklist
- [ ] Complete Threat Modeling Table and identify high-priority attack vectors in [Lab1-Security.md](file:///C:/Users/ADMIN/Desktop/Maintenance_Team10/Lab1-Security.md).
- [ ] Execute attack payloads against the API and capture before/after terminal logs.
- [ ] Implement the Minimum 7-Test Suite in `backend/tests/`.
- [ ] Run the 10-test Golden Dataset evaluation and compute pass rates.
- [ ] Capture the Red-to-Green CI evidence for Gate 3 / Assignment A8.

---

### Role 5: Delivery, DevOps and Documentation
**Owner:** **Danielle Jusayan (6731503051)**

#### Core Objective
Automate local launch and CI/CD pipelines, ensure zero-cost hosting compliance, resolve cross-group integration gaps, and produce polished PDF submissions.

#### Key Responsibilities
1. **CI/CD Pipeline Setup:** Create and maintain `.github/workflows/ci.yml` blocking PRs on lint, typecheck, or test failures.
2. **Developer Experience:** Provide `.env.local` templates and root-level scripts so teammates can boot both apps in one step.
3. **Integration Evidence (Assignment #5):** Close the 3 partial evidence sections with Team 12 (Provider access logs, sender logs, degradation retry logs).
4. **Submission Packaging:** Ensure all Markdown deliverables ([A3-Team10-Database-Design.md](file:///C:/Users/ADMIN/Desktop/Maintenance_Team10/A3-Team10-Database-Design.md), [A5-Team10-Integration-Evidence.md](file:///C:/Users/ADMIN/Desktop/Maintenance_Team10/A5-Team10-Integration-Evidence.md), and Gate 3/A8) are cleanly exported to PDF.

#### Action Checklist
- [ ] Create `.github/workflows/ci.yml` with typecheck, dependency audit, and test execution jobs.
- [ ] Provide sample environment configuration files (`.env.local`).
- [ ] Capture partner health logs and Team 12 confirmation for Assignment #5 Provider Proof.
- [ ] Format and export all Markdown reports into submission-ready PDFs.
- [ ] Perform security sweeps to ensure no API secrets or service keys are committed.

---

## 3. RACI Responsibility Matrix

| Deliverable / Task Area | Khant Nyi Nyi (PM) | Hein Zaw (Frontend) | Ye Myat Min (Backend) | Zwe Nyi Win (QA/Sec) | Danielle (DevOps) |
|---|:---:|:---:|:---:|:---:|:---:|
| **Zero-Config Mock Engine** | I | C | **A / R** | C | C |
| **Frontend 3 User Journeys** | C | **A / R** | C | C | I |
| **Backend Business Rules (BR-01, 02)** | I | C | **A / R** | C | I |
| **AI Classifier & Fallback (`FR-05`)** | C | C | **A / R** | C | I |
| **Security Attack & Defense (Lab 1)** | I | I | C | **A / R** | C |
| **Minimum 7-Test Suite (Lab 2)** | I | I | C | **A / R** | C |
| **GitHub Actions CI Quality Gate** | I | I | C | C | **A / R** |
| **Team 12 Evidence Closure (A5)** | C | I | C | I | **A / R** |
| **Assignment PDF Submissions** | C | I | I | I | **A / R** |

*Legend: **R** = Responsible (does the work), **A** = Accountable (approves/owns outcome), **C** = Consulted (provides input), **I** = Informed (kept updated).*

---

## 4. Collaborative Handoff Workflows

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CORE COLLABORATION LIFECYCLE                          │
└─────────────────────────────────────────────────────────────────────────────┘
   1. PM (Khant Nyi Nyi) defines acceptance criteria & demo scenarios
        │
        ▼
   2. Backend (Ye Myat Min) exposes mock endpoints & business logic
        │
        ├──▶ 3. Frontend (Hein Zaw) builds user journeys & role switcher
        │         │
        │         ▼
        └──▶ 4. QA (Zwe Nyi Win) attacks system, runs tests & golden dataset
                  │
                  ▼
             5. DevOps (Danielle) enforces Green CI & exports final PDF reports
```

1. **Backend ➔ Frontend Handoff:**
   * Backend provides mock tokens and sample fixtures (`seed.sql`).
   * Frontend connects forms directly to `/api/work-orders` endpoints using the pre-set mock tokens.
2. **Backend ➔ QA Handoff:**
   * Backend exposes the state transition functions and classification logic.
   * QA attacks the boundaries (Prompt Injection & BOLA) and embeds regression tests in `tests/`.
3. **QA ➔ DevOps Handoff:**
   * QA writes the tests; DevOps configures `.github/workflows/ci.yml` to run them on every commit and pull request.
4. **All Roles ➔ PM Sign-Off:**
   * PM reviews the integrated app in the browser and confirms that all 3 user journeys and acceptance criteria are satisfied before submission.
