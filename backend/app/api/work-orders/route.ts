import { errorResponse, readJson, supabaseErrorResponse, timedJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import {
  createWorkOrderSchema,
  listWorkOrdersQuerySchema,
  type CreateWorkOrderInput,
} from "@/lib/work-order-schemas";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const filters = listWorkOrdersQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!filters.success) return errorResponse(400, "INVALID_FILTER", "Work-order filters are invalid");
  const supabase = auth.context!.supabase;
  let query = supabase
    .from("work_orders")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range(filters.data.offset, filters.data.offset + filters.data.limit - 1);

  const status = filters.data.status;
  const locationId = filters.data.location_id;
  if (status) query = query.eq("status", status);
  if (locationId) query = query.eq("location_id", locationId);

  const databaseStartedAt = performance.now();
  const { data, error } = await query;
  if (error) return supabaseErrorResponse(error);
  return timedJson({ data }, auth.context!, databaseStartedAt);
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, ["reporter", "staff"]);
  if (auth.response) return auth.response;

  const parsed = await readJson<CreateWorkOrderInput>(request, createWorkOrderSchema);
  if (parsed.response) return parsed.response;

  const supabase = auth.context!.supabase;
  const databaseStartedAt = performance.now();
  const { data, error } = await supabase.rpc("create_work_order", {
    p_reporter_id: auth.context!.user.id,
    p_location_id: parsed.data!.location_id,
    p_description: parsed.data!.description,
    p_category_id: parsed.data!.category_id,
    p_title: parsed.data!.title,
  });

  if (error) return supabaseErrorResponse(error);
  return timedJson(data, auth.context!, databaseStartedAt, { status: 201 });
}
