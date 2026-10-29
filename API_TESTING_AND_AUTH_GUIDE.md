# Supabase Authentication & API Testing Guide
**Project:** Campus Facility Maintenance Platform (Team 10)  
**Target:** API Verification, Environment Configuration & Authentication Mechanics  
**Created:** 28 October 2026  

---

## 1. Overview & Key Findings

When performing API checks on the Maintenance Platform backend, you may encounter authentication barriers if attempting to authenticate using the **Supabase Anon Key** directly.

### Key Takeaways:
1. **The Anon Key is NOT a User Bearer Token:** The Anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) initializes the Supabase client. Passing it as `Bearer <anon_key>` fails with `401 UNAUTHENTICATED: The access token is invalid` because `supabase.auth.getUser()` expects a user session JWT.
2. **Row-Level Security (RLS) is Role-Enforced:** The tables in `002_api_policies_and_lifecycle.sql` require `to authenticated`, checking `auth.uid()` and `role = 'staff'`.
3. **Service Role Key is Optional for Work Orders:** `SUPABASE_SERVICE_ROLE_KEY` is exclusively needed by the partner webhook endpoint (`app/api/integrations/team12/webhook/route.ts`). All core work-order operations function without it.

---

## 2. Environment Files Setup (`.env.local`)

Git ignores local environment files (`.env*.local`) to safeguard credentials. The necessary `.env.local` files have been created:

### 2.1 Backend: `backend/.env.local`
```ini
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# Client Origins
FRONTEND_ORIGINS=http://localhost:3001

# Team 12 Partner Integration (Can remain placeholder strings for local testing)
TEAM12_PARTNER_API_KEY=replace-with-team-12-partner-key
TEAM12_WEBHOOK_SECRET=replace-with-team-12-webhook-secret
TEAM12_PARTNER_ACTIVITIES_URL=https://pd-project-events-clubs.onrender.com/partner/activities
TEAM12_PARTNER_WEBHOOK_URL=https://pd-project-events-clubs.onrender.com/webhooks/partner
TEAM10_PARTNER_KEY=replace-with-team-10-partner-key
TEAM10_WEBHOOK_SECRET=replace-with-team-10-webhook-secret
SUPABASE_SERVICE_ROLE_KEY=optional-or-replace-with-supabase-service-role-key
```

### 2.2 Frontend: `frontend/.env.local`
```ini
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

---

## 3. Two Approaches for Running API Checks

### Approach A: Live Supabase Auth (Recommended for full integration)

If you have your `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`:

1. **Create the 2 Test Users in Supabase Dashboard:**
   * Go to **Authentication ➔ Users ➔ Add User**.
   * **User 1 (Reporter):**
     * Email: `reporter1@gmail.com`
     * Password: `Reporter1`
     * User Metadata:
       ```json
       { "role": "reporter" }
       ```
   * **User 2 (Staff):**
     * Email: `staff1@gmail.com`
     * Password: `Staff1`
     * User Metadata:
       ```json
       { "role": "staff" }
       ```

2. **Run Both Applications:**
   ```powershell
   # Terminal 1 - Backend
   cd backend
   npm run dev

   # Terminal 2 - Frontend
   cd frontend
   npm run dev
   ```

3. **Use the Frontend API Console:**
   * Open `http://localhost:3001`.
   * Select `reporter1@gmail.com` or `staff1@gmail.com`.
   * Click **Sign in**. The frontend client calls `supabase.auth.signInWithPassword()` and attaches the resulting access token to all subsequent API requests.

---

### Approach B: Zero-Config Mock Auth (Recommended for Solo / Offline Testing)

If you want to test API endpoints immediately without logging into Supabase or creating accounts:

Update `backend/lib/auth.ts` to support deterministic mock tokens:

```typescript
// Insert in backend/lib/auth.ts inside requireAuth():
if (authorization === "Bearer mock-reporter-token") {
  return {
    context: {
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        app_metadata: { role: "reporter" },
        user_metadata: { role: "reporter" },
        aud: "authenticated",
        created_at: new Date().toISOString(),
      } as any,
      role: "reporter",
    },
  };
}

if (authorization === "Bearer mock-staff-token") {
  return {
    context: {
      user: {
        id: "00000000-0000-4000-8000-000000000002",
        app_metadata: { role: "staff" },
        user_metadata: { role: "staff" },
        aud: "authenticated",
        created_at: new Date().toISOString(),
      } as any,
      role: "staff",
    },
  };
}
```

#### Testing with PowerShell:
```powershell
# 1. Health check (No token required)
Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method GET

# 2. List work orders as reporter
Invoke-RestMethod -Uri "http://localhost:3000/api/work-orders" -Method GET `
  -Headers @{ Authorization = "Bearer mock-reporter-token" }

# 3. Test RBAC security boundary (Reporter attempting staff action)
# Should return 403 Forbidden
Invoke-RestMethod -Uri "http://localhost:3000/api/work-orders/<id>/assign" -Method POST `
  -Headers @{ Authorization = "Bearer mock-reporter-token" } `
  -ContentType "application/json" -Body '{"staff_id":"00000000-0000-4000-8000-000000000002"}'
```

---

## 4. Work-Order Lifecycle Verification Checklist

Once authenticated (via real token or mock token), execute the standard 5-step lifecycle:

| Step | Method | Path | Expected Role | Expected Status |
|:---|:---|:---|:---|:---|
| 1. Create | `POST` | `/api/work-orders` | `reporter` or `staff` | `201 Created` (`OPEN`) |
| 2. Assign | `POST` | `/api/work-orders/{id}/assign` | `staff` only | `200 OK` (`ASSIGNED`) |
| 3. Start | `POST` | `/api/work-orders/{id}/in-progress` | `staff` only | `200 OK` (`IN_PROGRESS`) |
| 4. Resolve | `POST` | `/api/work-orders/{id}/resolve` | `staff` only | `200 OK` (`RESOLVED`) |
| 5. Close | `POST` | `/api/work-orders/{id}/close` | `staff` only | `200 OK` (`CLOSED`) |
| 6. Audit Trail | `GET` | `/api/work-orders/{id}/history` | `reporter` or `staff` | `200 OK` (5 history rows) |
