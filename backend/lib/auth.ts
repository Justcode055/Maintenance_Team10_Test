import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createRequestSupabaseClient } from "@/lib/supabase-server";
import { errorResponse } from "@/lib/api";

export type AuthContext = {
  user: User;
  role: "reporter" | "staff";
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
    const supabase = createRequestSupabaseClient(authorization);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return {
        response: errorResponse(401, "UNAUTHENTICATED", "The access token is invalid"),
      };
    }

    const role = resolveRole(data.user);
    if (!role || (allowedRoles && !allowedRoles.includes(role))) {
      return {
        response: errorResponse(403, "FORBIDDEN", "The user role is not allowed"),
      };
    }

    return { context: { user: data.user, role } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed";
    return { response: errorResponse(500, "AUTH_CONFIGURATION_ERROR", message) };
  }
}

export function requirePartnerAuth(request: Request): Response | null {
  const expected = process.env.TEAM10_PARTNER_KEY;
  const provided = request.headers.get("x-partner-key");
  if (!expected || !provided) {
    return errorResponse(401, "INVALID_PARTNER_KEY", "Partner key is invalid or missing");
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return errorResponse(401, "INVALID_PARTNER_KEY", "Partner key is invalid or missing");
  }

  return null;
}

function resolveRole(user: User): AuthContext["role"] | null {
  const role = user.app_metadata?.role ?? user.user_metadata?.role;
  return role === "staff" || role === "reporter" ? role : null;
}
