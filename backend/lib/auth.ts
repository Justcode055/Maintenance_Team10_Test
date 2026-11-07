import "server-only";

import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createRequestSupabaseClient } from "@/lib/supabase-server";
import { errorResponse } from "@/lib/api";
import { resolveTrustedRole, secretsMatch } from "@/lib/security";

export type AuthContext = {
  user: User;
  role: "reporter" | "staff";
  supabase: SupabaseClient;
  authDurationMs: number;
};

export async function requireAuth(
  request: Request,
  allowedRoles?: AuthContext["role"][],
): Promise<{ context?: AuthContext; response?: Response }> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return {
      response: errorResponse(401, "UNAUTHENTICATED", "A bearer token is required"),
    };
  }

  try {
    const authStartedAt = performance.now();
    const supabase = createRequestSupabaseClient(authorization);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return {
        response: errorResponse(401, "UNAUTHENTICATED", "The access token is invalid"),
      };
    }

    const role = resolveTrustedRole(data.user);
    if (!role || (allowedRoles && !allowedRoles.includes(role))) {
      return {
        response: errorResponse(403, "FORBIDDEN", "The user role is not allowed"),
      };
    }

    return { context: { user: data.user, role, supabase, authDurationMs: performance.now() - authStartedAt } };
  } catch {
    return { response: errorResponse(503, "AUTH_UNAVAILABLE", "Authentication is temporarily unavailable") };
  }
}

export function requirePartnerAuth(request: Request): Response | null {
  const expected = process.env.TEAM10_PARTNER_KEY;
  const provided = request.headers.get("x-partner-key");
  if (!secretsMatch(provided, expected)) {
    return errorResponse(401, "INVALID_PARTNER_KEY", "Partner key is invalid or missing");
  }

  return null;
}
