import { supabaseErrorResponse, timedJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const supabase = auth.context!.supabase;
  const databaseStartedAt = performance.now();
  const { data, error } = await supabase
    .from("status_history")
    .select("*")
    .eq("work_order_id", id)
    .order("timestamp", { ascending: true });

  if (error) return supabaseErrorResponse(error);
  return timedJson({ data }, auth.context!, databaseStartedAt);
}
