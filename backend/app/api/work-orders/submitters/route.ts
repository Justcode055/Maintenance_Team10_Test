import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { errorResponse, readJson, supabaseErrorResponse } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resolveTrustedRole } from "@/lib/security";

const schema = z.object({ ids: z.array(z.string().regex(/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i)).min(1).max(100) }).strict();

export async function POST(request: Request) {
  const auth = await requireAuth(request, ["staff"]);
  if (auth.response) return auth.response;
  const parsed = await readJson<{ ids: string[] }>(request, schema);
  if (parsed.response) return parsed.response;
  // Only work-order IDs are accepted. Never expose an arbitrary user lookup.
  const { data, error } = await auth.context!.supabase.from("work_orders").select("id,reporter_id").in("id", parsed.data!.ids).is("archived_at", null).limit(100);
  if (error) return supabaseErrorResponse(error);
  if (!data?.length) return Response.json({ data: {} }, { headers: { "Cache-Control": "private, no-store" } });
  try {
    const admin = createSupabaseAdminClient();
    const roles = new Map<string, string>();
    const ids = [...new Set(data.map((order) => order.reporter_id).filter((id): id is string => typeof id === "string"))];
    // Bounded parallelism; keep this display-only lookup off the list/status path.
    for (let offset = 0; offset < ids.length; offset += 8) {
      await Promise.all(ids.slice(offset, offset + 8).map(async (id) => {
        const result = await admin.auth.admin.getUserById(id);
        const role = !result.error && result.data.user ? resolveTrustedRole(result.data.user) : null;
        if (role) roles.set(id, role);
      }));
    }
    // Current administrator-assigned role, not an inferred historical snapshot.
    return Response.json({ data: Object.fromEntries(data.map((order) => [order.id, order.reporter_id ? roles.get(order.reporter_id) ?? "unknown" : "partner"])) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return errorResponse(503, "ATTRIBUTION_UNAVAILABLE", "Submitter labels are temporarily unavailable");
  }
}
