# Maintenance Team 10 Frontend

This is the web app for the backend in `../backend`. For the complete teammate setup, including Supabase database and authentication requirements, read [`../backend/README.md`](../backend/README.md).

## Run

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

The client runs at `http://localhost:3001` and sends requests to `NEXT_PUBLIC_API_BASE_URL`.

The backend must be running at `http://localhost:3000` before sending requests.

For a password-free UI preview, run `npm run dev` and open `/login` on localhost. Choose **Student demo** or **Staff demo**. This uses sample tickets, disables changes and AI requests, and does not create a Supabase session or call the backend. Demo access is unavailable in production builds and on non-loopback hosts. Exit the demo to use normal sign-in.

Set the Supabase URL and anon/publishable key in `.env.local`. Sign in with your own account email and password. An administrator assigns your `app_metadata.role`; the UI cannot switch roles or sign into a shared staff account. Supabase manages the browser session and refreshes its access token, which is forwarded to the backend for verification.

Protected requests use the current Supabase browser session. Real account roles always come from administrator-controlled `app_metadata.role`.

## Password recovery

The sign-in page links to `/forgot-password`. Supabase emails the reset link and returns the user to `/reset-password`, where a valid authenticated recovery session is required to update the password. Passwords are never stored in this repository. The page handles expired links, mismatched passwords, weak-password errors and duplicate submissions.

In **Supabase → Authentication → URL Configuration → Redirect URLs**, add the frontend reset URL for each environment, for example `http://localhost:3001/reset-password` and your deployed frontend's `https://<frontend-domain>/reset-password`. If you use `127.0.0.1` or another development port, allow that exact origin and path too. Configure your Site URL and email delivery for the hosted environment. These project settings are required for the reset email to return to the correct page.

## UX checks

Run `npm run typecheck`, `npm run test:ux`, and `npm run build`. Native tests cover request search, combined filters, repair-target ordering and development-only demo restrictions. Browser checks should cover failed list requests, retained resolution notes after an error, pending-action locks, dialog keyboard behavior, mobile layouts, and password recovery using a local authentication fixture. Do not send test password-reset emails to real users.

Search and filters apply to loaded requests. The list loads 100 at a time and offers **Load more requests** when additional records may exist. Repair targets are calculated from the reported time plus the category's target hours; resolved and closed requests are excluded from overdue prioritization.
## Dashboard views

The workspace opens on Overview. Reporter summaries, recent requests and audit updates include only their own active requests. Staff summaries cover campus requests; both My Requests and Dispatch Board show all campus requests, with lifecycle controls on Dispatch Board.

`GET /api/dashboard` supplies exact counts independently of list pagination. Open means `OPEN`; in progress means `IN_PROGRESS`; needs attention means active, unresolved requests past their category SLA. Resolved this week counts actual `IN_PROGRESS` → `RESOLVED` audit events since Monday at 00:00 Asia/Bangkok, including requests subsequently closed. Archived requests are excluded. Recent updates omit metadata-only edits.

Staff submitter tags load separately from `POST /api/work-orders/submitters`. Only verified staff can request labels for existing active work orders. The server returns administrator-controlled current roles, not emails or editable user metadata. These are display labels, not historical snapshots of roles at submission, and never grant permissions. Partner-created records have a separate label; unavailable attribution is never guessed. No new database migration is needed for the dashboard.

## Request cards

Cards show the title, status, location/category, repair target and five-step progress. Details contains the full request ID, description, dates, repair notes and audit history. Searching by ID still works. Staff submitter tags and dispatch actions remain available.

Progress animates once when the displayed confirmed status advances. Opening a card or Details does not replay earlier steps. Resolved remains awaiting closure; Closed checks all five steps in green and ends the animation. Reduced-motion preferences disable motion.

## Category suggestions

Suggestions update only a recognized category option. A detected building appears as a small location-field hint; it never fills or replaces the selected building/room, including when that field is empty. The user confirms the location themselves. Changing the title, description, category or location invalidates pending suggestions so a late response cannot undo manual edits. Manual category choices survive fallback or unavailable/conflicting category mappings.
