import { errorResponse } from "@/lib/api";
import { requirePartnerAuth } from "@/lib/auth";

export function GET(request: Request) {
  const authError = requirePartnerAuth(request);
  if (authError) return authError;

  if (process.env.TEAM10_PARTNER_HEALTH_DEGRADED === "true") {
    return errorResponse(503, "PARTNER_UNAVAILABLE", "Maintenance partner health check is temporarily unavailable");
  }

  return Response.json({ status: "ok", service: "maintenance-team10-api" });
}
