import { createRequestSupabaseClient } from "@/lib/supabase-server";
import { readJson, supabaseErrorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import {
  resolveWorkOrderSchema,
  type ResolveWorkOrderInput,
} from "@/lib/work-order-schemas";
import { dispatchStatusChangedWithoutBlocking } from "@/lib/team12-integration";

export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAuth(request, ["staff"]);
  if (auth.response) return auth.response;

  const parsed = await readJson<ResolveWorkOrderInput>(request, resolveWorkOrderSchema);
  if (parsed.response) return parsed.response;

  const { id } = await context.params;
  const supabase = createRequestSupabaseClient(request.headers.get("authorization"));
  const { data, error } = await supabase.rpc("resolve_work_order", {
    p_work_order_id: id,
    p_resolution_notes: parsed.data!.resolution_notes,
  });

  if (error) return supabaseErrorResponse(error);
  dispatchStatusChangedWithoutBlocking({
    workOrderId: id,
    fromStatus: "IN_PROGRESS",
    toStatus: "RESOLVED",
    activityId: (data as any)?.activity_id,
  });
  return Response.json(data);
}
