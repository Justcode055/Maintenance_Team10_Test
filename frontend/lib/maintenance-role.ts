export type MaintenanceRole = "reporter" | "staff";

// UI routing uses the same administrator-controlled claim as the API.
// The backend still verifies authorization on every protected request.
export function maintenanceRole(user: { app_metadata?: Record<string, unknown> } | null | undefined): MaintenanceRole | null {
  const role = user?.app_metadata?.role;
  return role === "reporter" || role === "staff" ? role : null;
}
