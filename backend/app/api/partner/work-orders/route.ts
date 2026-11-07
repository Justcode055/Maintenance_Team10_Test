import { errorResponse, readJson, supabaseErrorResponse } from "@/lib/api";
import { requirePartnerAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  createPartnerWorkOrderSchema, updatePartnerWorkOrderSchema,
  partnerLookupSchema, partnerReferenceSchema,
  type CreatePartnerWorkOrderInput, type UpdatePartnerWorkOrderInput,
} from "@/lib/work-order-schemas";

function adminClient() {
  try { return createSupabaseAdminClient(); } catch { return null; }
}
const unavailable = () => errorResponse(503, "PARTNER_UNAVAILABLE", "Partner database access is not configured");
type AdminClient = NonNullable<ReturnType<typeof adminClient>>;

async function resolveReferences(client: AdminClient, input: CreatePartnerWorkOrderInput | UpdatePartnerWorkOrderInput, defaults: boolean) {
  let categoryId = input.category_id;
  let locationId = input.location_id;
  let categoryName: string | undefined;
  if (defaults || input.category || categoryId) {
    const { data, error } = await client.from("categories").select("id, name").order("name");
    if (error) return { response: supabaseErrorResponse(error) };
    // Preserve the creation contract's best-effort text hints. Explicit UUIDs
    // must resolve exactly; an unrecognized hint may use the configured default.
    const category = categoryId ? data?.find((item) => item.id === categoryId)
      : input.category ? data?.find((item) => item.name.toLowerCase() === input.category!.toLowerCase()) ?? (defaults ? data?.[0] : undefined)
      : data?.[0];
    if (!category) return { response: errorResponse(400, "INVALID_CATEGORY", "Select an existing category") };
    categoryId = category.id;
    categoryName = category.name;
  }
  if (defaults || input.location || locationId) {
    const { data, error } = await client.from("locations").select("id, building, floor_room").order("building");
    if (error) return { response: supabaseErrorResponse(error) };
    const location = locationId ? data?.find((item) => item.id === locationId)
      : input.location ? data?.find((item) => item.building.toLowerCase().includes(input.location!.toLowerCase()) || item.floor_room.toLowerCase().includes(input.location!.toLowerCase())) ?? (defaults ? data?.[0] : undefined)
      : data?.[0];
    if (!location) return { response: errorResponse(400, "INVALID_LOCATION", "Select an existing location") };
    locationId = location.id;
  }
  return { categoryId, locationId, categoryName };
}

function lookup(request: Request) {
  const url = new URL(request.url);
  return partnerLookupSchema.safeParse({
    activity_id: url.searchParams.get("activity_id") ?? undefined,
    work_order_id: url.searchParams.get("work_order_id") ?? url.searchParams.get("id") ?? undefined,
  });
}

export async function POST(request: Request) {
  const authError = requirePartnerAuth(request);
  if (authError) return authError;
  const parsed = await readJson(request, createPartnerWorkOrderSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data!;
  const keys = [request.headers.get("x-idempotency-key"), request.headers.get("idempotency-key"), input.idempotency_key].filter((key): key is string => key != null);
  if (keys.some((key) => !partnerReferenceSchema.safeParse(key).success) || new Set(keys).size > 1) {
    return errorResponse(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency keys must be valid and agree");
  }
  const client = adminClient();
  if (!client) return unavailable();
  const refs = await resolveReferences(client, input, true);
  if (refs.response) return refs.response;
  const { data, error } = await client.rpc("create_partner_work_order", {
    p_title: input.title, p_description: input.schedule ? `${input.description}\n[Event Schedule: ${input.schedule}]` : input.description,
    p_category_id: refs.categoryId, p_location_id: refs.locationId,
    p_activity_id: input.activity_id ?? null, p_idempotency_key: keys[0]?.trim() ?? input.activity_id ?? null,
  });
  if (error) return supabaseErrorResponse(error);
  const order = data.work_order;
  return Response.json({
    success: true, duplicate: data.duplicate, workOrderId: order.id,
    activityId: order.activity_id, idempotencyKey: order.idempotency_key,
    status: order.status, title: order.title, category: refs.categoryName,
    locationId: order.location_id, createdAt: order.created_at,
  }, { status: data.duplicate ? 200 : 201 });
}

export async function GET(request: Request) {
  const authError = requirePartnerAuth(request);
  if (authError) return authError;
  const parsed = lookup(request);
  if (!parsed.success) return errorResponse(400, "MISSING_QUERY_PARAM", "Provide a valid activity_id or work_order_id");
  const client = adminClient();
  if (!client) return unavailable();
  // The partner key never grants access to unrelated student work orders.
  let query = client.from("work_orders").select("id, activity_id, status, title, description, created_at, updated_at").eq("partner_source", "team12");
  if (parsed.data.activity_id) query = query.eq("activity_id", parsed.data.activity_id);
  if (parsed.data.work_order_id) query = query.eq("id", parsed.data.work_order_id);
  const { data, error } = await query.maybeSingle();
  if (error) return supabaseErrorResponse(error);
  if (!data) return errorResponse(404, "NOT_FOUND", "Work order not found");
  return Response.json({ success: true, data: {
    workOrderId: data.id, activityId: data.activity_id, status: data.status,
    title: data.title, description: data.description, createdAt: data.created_at, updatedAt: data.updated_at,
  } });
}

async function modify(input: UpdatePartnerWorkOrderInput) {
  const client = adminClient();
  if (!client) return unavailable();
  const refs = await resolveReferences(client, input, false);
  if (refs.response) return refs.response;
  const { data, error } = await client.rpc("modify_partner_work_order", {
    p_work_order_id: input.work_order_id ?? null, p_activity_id: input.activity_id ?? null,
    p_cancel: input.action === "cancel", p_title: input.title ?? null,
    p_description: input.description ?? null, p_category_id: refs.categoryId ?? null,
    p_location_id: refs.locationId ?? null,
  });
  if (error) return supabaseErrorResponse(error);
  return Response.json({ success: true, workOrderId: data.id, activityId: data.activity_id,
    ...(input.action === "cancel" ? { cancelled: true, archivedAt: data.archived_at }
      : { updated: true, title: data.title, description: data.description, locationId: data.location_id, categoryId: data.category_id, updatedAt: data.updated_at }),
  });
}

export async function PATCH(request: Request) {
  const authError = requirePartnerAuth(request);
  if (authError) return authError;
  const parsed = await readJson(request, updatePartnerWorkOrderSchema);
  if (parsed.response) return parsed.response;
  return modify(parsed.data!);
}

export async function DELETE(request: Request) {
  const authError = requirePartnerAuth(request);
  if (authError) return authError;
  const parsed = lookup(request);
  if (!parsed.success) return errorResponse(400, "MISSING_QUERY_PARAM", "Provide a valid activity_id or work_order_id");
  return modify({ ...parsed.data, action: "cancel" });
}
