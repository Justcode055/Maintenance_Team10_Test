import { createRequestSupabaseClient } from "@/lib/supabase-server";
import { errorResponse, supabaseErrorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import {
  assignWorkOrderSchema,
  type AssignWorkOrderInput,
} from "@/lib/work-order-schemas";
import { dispatchStatusChangedWithoutBlocking } from "@/lib/team12-integration";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAuth(request, ["staff"]);
  if (auth.response) return auth.response;

  let staffId = auth.context?.user.id;

  const text = await request.text();
  if (text.trim().length > 0) {
    try {
      const body = JSON.parse(text);
      const parsed = assignWorkOrderSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          parsed.error.issues.map((issue) => issue.message).join("; "),
        );
      }
      if (parsed.data.staff_id) {
        staffId = parsed.data.staff_id;
      }
    } catch {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
    }
  }

  if (!staffId) {
    return errorResponse(400, "VALIDATION_ERROR", "staff_id is required");
  }

  const { id } = await context.params;
  const supabase = createRequestSupabaseClient(request.headers.get("authorization"));
  const { data, error } = await supabase.rpc("assign_work_order", {
    p_work_order_id: id,
    p_staff_id: staffId,
  });

  if (error) return supabaseErrorResponse(error);
  dispatchStatusChangedWithoutBlocking({
    workOrderId: id,
    fromStatus: "OPEN",
    toStatus: "ASSIGNED",
    activityId: (data as any)?.activity_id,
  });
  return Response.json(data);
}
