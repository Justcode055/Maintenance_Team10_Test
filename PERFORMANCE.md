# NFR-01 performance verification

The PRD requires core REST endpoints to have p95 below 300 ms and category suggestions to fall back to manual selection after 1,500 ms.

## Deadline behavior

- The browser budgets 1,500 ms for the complete category request, including authentication, network transport and response parsing. A deadline aborts the request, restores manual selection and focuses Category.
- The authenticated backend separately limits the classification operation to 1,500 ms. The classifier cooperatively checks cancellation during its synchronous loops. Authentication is always verified before returning a protected API response.
- A late suggestion cannot overwrite the browser's manual fallback: only the winning deadline/request promise is consumed.
- A request lock prevents duplicate category calls and keeps an old account's response out of a new account's form. Refreshing the same user's access token does not leave the button stuck in its loading state.
- Scheduling can add small event-loop delays; these are time budgets, not a hard real-time guarantee.

Run the deterministic deadline and percentile checks:

```powershell
npm run test:performance --prefix backend
npm run test:ux --prefix frontend
```

## Live API benchmark

Configure these values privately in `backend/.env.local`, using existing accounts whose administrator-assigned `app_metadata.role` is already correct:

- `TEST_REPORTER_EMAIL` and `TEST_REPORTER_PASSWORD`
- `TEST_STAFF_EMAIL` and `TEST_STAFF_PASSWORD`

Existing Supabase URL and anon/publishable-key settings are reused. Passwords, tokens, response bodies and user identities are not included in the report.
The two authenticated sessions are selected by their server-returned `app_metadata.role`, so reversed configuration labels do not grant or change permissions. Both distinct trusted roles must exist.

If those four test-account fields already live in another ignored environment file, pass `--credentials-file frontend/.env.local` to read that file privately. Paths supplied to `--credentials-file` and `--output` are relative to the repository root. Backend configuration already loaded from `backend/.env.local` takes precedence.

Build the backend, then run:

```powershell
npm run build --prefix backend
npm run perf:api --prefix backend -- --allow-test-writes --samples 50 --warmup 5 --label baseline --output performance/results/baseline.json
```

The runner launches one production-mode backend on a temporary loopback port, authenticates the real test accounts, and uses live Supabase. It creates explicitly labelled requests, advances only those requests through the normal lifecycle, and soft-archives them. Audit history is retained; no hard deletes are performed. An interrupted or failed run attempts to archive the requests it created and reports any cleanup failures.

Partner delivery is inactive only inside this isolated benchmark process by leaving its outgoing webhook secret unset. The normal application configuration is unchanged. This benchmark does not repeat A5 integration testing.

Each round measures successful create, list (reporter/staff/filtered), detail, metadata update, assignment, start, resolve, close, history, archive and category-suggestion HTTP requests. The `/start` alias shares the `/in-progress` handler and is not counted twice. Every measured request includes its real server-side authentication and database work. Login/setup calls are excluded. Failed responses cannot count as a fast pass; missing samples also fail the report.

Reports include p50/p95/p99, minimum/maximum, sample count, strict target, first-observed latency and cleanup status. p95 uses the nearest-rank method. The initial five complete rounds are warm-up only; first-observed route timings are reported separately.
Successful work-order responses also expose numeric `Server-Timing` entries for fresh authentication and database operations. The runner records their p95 values when present. Component percentiles are diagnostic and must not be added together to manufacture an overall p95.

## Deployment placement

The database hostname resolved to an AWS IPv6 prefix listed as `ap-southeast-2` in AWS's published IP ranges on 2026-11-07 UTC. This is a placement inference from infrastructure metadata, not a measurement of the database's internal execution time. The prepared `backend/vercel.json` selects Sydney (`syd1`) to run the backend close to that database. This configuration takes effect only on a new backend deployment.

Vercel recommends placing functions close to their data source: https://vercel.com/docs/functions/configuring-functions/region . AWS publishes the underlying region mapping at https://ip-ranges.amazonaws.com/ip-ranges.json . The `x-vercel-id` edge location on an existing HTTP response does not, by itself, establish the function's compute region.

## Interpretation

- This run measures a local production backend plus live Supabase, one request at a time. It does not establish Vercel/ngrok latency, concurrency capacity, uptime or zero hosting cost.
- Keep the sample count, warm-up, concurrency, dataset and network conditions comparable for before/after runs.
- A result is complete only when all 13 endpoint scenarios have the requested successful sample count, no run/cleanup failures remain, and every p95 meets its target.
- A5 evidence is outside this performance workstream and is accepted as completed by the team.

## Recorded results — 2026-11-07 UTC

The completed [baseline run](performance/results/baseline.json) and [request-client reuse run](performance/results/optimized.json) each include 50 successful measured samples for all 13 scenarios, following five warm-up rounds. Both used a production-mode local backend and the same live Supabase project. No test operation failed, and all 110 test requests across the two runs were soft-archived with their audit history retained.

- Baseline work-order p95 values ranged from 587.08 to 674.10 ms.
- After request-scoped client reuse, work-order p95 values ranged from 553.39 to 613.82 ms. All 12 work-order scenarios still failed the strict 300 ms target.
- Category endpoint p95 was 384.12 ms in the baseline and 297.51 ms in the comparison, both below its 1,500 ms budget.
- In the instrumented comparison, fresh-authentication p95 values ranged from 277.23 to 320.61 ms; database-operation round-trip p95 values ranged from 275.64 to 320.33 ms. These timings include network waits and are not pure PostgreSQL execution times.
- The runs occurred at different times. Network variability is a confounding factor; the observed differences are not proof that removing duplicate client construction caused all of the improvement. The category route, for example, did not have a second database client to remove.

**NFR-01 is not fully met in this measured environment.** The AI deadline and performance tooling are implemented and tested, but the 300 ms work-order requirement remains unverified for a backend deployed near the database. The Sydney configuration is prepared, not deployed. The connected Vercel account currently exposes only unrelated Housemate projects, so Maintenance deployment settings were not changed.
