# Maintenance Team 10 Frontend

This is a separate API test client for the backend in `../backend`. For the complete teammate setup, including Supabase database and authentication requirements, read [`../backend/README.md`](../backend/README.md).

## Run

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

The client runs at `http://localhost:3001` and sends requests to `NEXT_PUBLIC_API_BASE_URL`.

The backend must be running at `http://localhost:3000` before sending requests.

Set the Supabase URL and anon/publishable key in `.env.local`. Sign in with your own account email and password. An administrator assigns your `app_metadata.role`; the UI cannot switch roles or sign into a shared staff account. Supabase manages the browser session and refreshes its access token, which is forwarded to the backend for verification.

Paste a Supabase access token into the request form to test protected routes. The token is kept in memory by the browser and is not stored in the repository.
