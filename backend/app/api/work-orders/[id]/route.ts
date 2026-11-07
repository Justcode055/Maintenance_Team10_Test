import { errorResponse, readJson, supabaseErrorResponse, timedJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import {
  updateWorkOrderSchema,
  type UpdateWorkOrderInput,
} from "@/lib/work-order-schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const supabase = auth.context!.supabase;
  const databaseStartedAt = performance.now();
  const { data, error } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return supabaseErrorResponse(error);
  return timedJson(data, auth.context!, databaseStartedAt);
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAuth(request, ["staff"]);
  if (auth.response) return auth.response;

  const parsed = await readJson<UpdateWorkOrderInput>(request, updateWorkOrderSchema);
  if (parsed.response) return parsed.response;

  const { id } = await context.params;
  const supabase = auth.context!.supabase;
  const databaseStartedAt = performance.now();
  const { data, error } = await supabase
    .from("work_orders")
    .update(parsed.data!)
    .eq("id", id)
    .is("archived_at", null)
    .select()
    .single();

  if (error) return supabaseErrorResponse(error);
  return timedJson(data, auth.context!, databaseStartedAt);
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireAuth(request, ["staff"]);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const supabase = auth.context!.supabase;
  const databaseStartedAt = performance.now();
  const { data, error } = await supabase
    .from("work_orders")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select("id, archived_at")
    .single();

  if (error) return supabaseErrorResponse(error);
  return timedJson(data, auth.context!, databaseStartedAt);
}
