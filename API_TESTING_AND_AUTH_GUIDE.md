# API testing and authentication

Use Node.js 22.15 or newer. Authentication is verified by Supabase on every protected API request. Authorization uses only administrator-controlled `app_metadata.role` (`reporter` or `staff`). Never set roles through user metadata or add mock-token backdoors to production code.

## Set up a deployment

1. Apply migrations 001–009 in numeric order to the intended database. Existing deployments apply only pending migrations. Migration 009 may fail if duplicate partner correlation keys already exist; investigate those records without deleting history.
2. Verify each legitimate user's identity, then assign the appropriate `app_metadata.role` using the Supabase Admin API or a trusted database administrator. Do not automatically promote users based on editable `user_metadata` or their email address.
3. Put the Supabase URL, public key, server-only service/secret key and privately agreed partner secrets in the backend's ignored `.env.local`. Configure the frontend with only the project URL, public key and API URL.
4. Start both applications. The frontend requires the user's own email and password; there are no shared passwords or role-switch buttons.

`SUPABASE_SERVICE_ROLE_KEY` is required for partner operations and webhook storage. Missing or placeholder credentials fail closed; there is no anonymous fallback. Never prefix a server key with `NEXT_PUBLIC_`.

## Private live-test credentials

Configure these locally in `backend/.env.local` before running `npm test --prefix backend`:

```ini
TEST_REPORTER_EMAIL=<privately-created-reporter-email>
TEST_REPORTER_PASSWORD=<private-password>
TEST_STAFF_EMAIL=<privately-created-staff-email>
TEST_STAFF_PASSWORD=<private-password>
TEST_API_BASE_URL=http://localhost:3000/api
```

Use a dedicated test database and accounts. These live tests create work orders and advance lifecycle state; they must not be run against real tickets. Obtain a bearer token by signing in through Supabase Auth, then send `Authorization: Bearer <access-token>` to the backend. Reporters must receive 403 on assignment, start, resolve, close, patch and archive routes.

## Local regression checks

```powershell
npm run typecheck --prefix backend
npm run typecheck --prefix frontend
npm run test:unit --prefix backend
npm run test:security --prefix backend
npm run test:ai-eval --prefix backend
npm run check:secrets --prefix backend
```

Security route tests use the real handlers and Supabase client with a fake transport, never live credentials. The database regression uses isolated PostgreSQL through optional PGlite; see `backend/tests/database-security.test.mjs`. The normal test pipeline uses Node's native test runner without a test bundler.

## Partner contract

- Send the agreed `X-Partner-Key` from the Campus Pulse backend, never a browser.
- Supply `activity_id` and preferably a stable `idempotency_key` in the JSON or `X-Idempotency-Key` header. Supplied idempotency keys must agree. References permit letters, digits, underscore, dash, colon and period, up to 200 characters.
- A first creation returns 201; replay returns 200 with `duplicate: true` and the original `workOrderId`. Conflicting links return 409. All partner reads and changes are restricted to Team 12's own work orders.
- Work-order writes, soft cancellation and immutable audit entries commit atomically. Archived orders cannot be modified or reopened.
- Status events are signed over the exact UTF-8 JSON body with HMAC-SHA256. Sequence and version agree across the envelope, data and headers. Retries reuse the same event ID, timestamp, bytes and signature.
- Inbound activity events require `X-Webhook-Secret` and `X-Event-ID`. A supplied HMAC is validated against the raw body. Same-ID conflicting payloads return 409; exact replays are idempotent.
- JSON bodies are limited to 64 KiB. Descriptions and resolution notes are limited to 10,000 characters. Work-order lists default to 100 rows; use `limit` (maximum 200) and `offset` to page.

Keep production secrets private, deploy behind HTTPS, and configure request-rate limits at the hosting gateway. Rotate the old demo passwords because earlier repository revisions exposed them. Removing credentials from the latest source does not erase Git history.
