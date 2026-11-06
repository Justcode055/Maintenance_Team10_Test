import { errorResponse, readJson, supabaseErrorResponse } from "@/lib/api";
import { requirePartnerAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createRequestSupabaseClient } from "@/lib/supabase-server";
import {
  createPartnerWorkOrderSchema,
  updatePartnerWorkOrderSchema,
  type CreatePartnerWorkOrderInput,
  type UpdatePartnerWorkOrderInput,
} from "@/lib/work-order-schemas";

function getSupabaseClient() {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && !serviceKey.includes("replace") && !serviceKey.includes("optional")) {
      return createSupabaseAdminClient();
    }
  } catch {
    // fallback
  }
  return createRequestSupabaseClient(null);
}

export async function POST(request: Request) {
  const authError = requirePartnerAuth(request);
  if (authError) return authError;

  const parsed = await readJson<CreatePartnerWorkOrderInput>(request, createPartnerWorkOrderSchema);
  if (parsed.response) return parsed.response;

  const input = parsed.data!;
  const supabase = getSupabaseClient();

  // Extract explicit or implicit idempotency key
  const idempotencyKey =
    request.headers.get("x-idempotency-key") ||
    request.headers.get("idempotency-key") ||
    input.activity_id;

  // 1. Idempotency Check: if idempotencyKey or activity_id is provided, check for existing order
  if (idempotencyKey || input.activity_id) {
    try {
      let query = supabase
        .from("work_orders")
        .select("id, status, title, description, category_id, location_id, created_at, activity_id, idempotency_key");

      if (idempotencyKey && input.activity_id && idempotencyKey !== input.activity_id) {
        query = query.or(`idempotency_key.eq.${idempotencyKey},activity_id.eq.${input.activity_id}`);
      } else if (idempotencyKey) {
        query = query.or(`idempotency_key.eq.${idempotencyKey},activity_id.eq.${idempotencyKey}`);
      } else if (input.activity_id) {
        query = query.eq("activity_id", input.activity_id);
      }

      const { data: existing } = await query.maybeSingle();

      if (existing) {
        return Response.json(
          {
            success: true,
            duplicate: true,
            workOrderId: existing.id,
            activityId: existing.activity_id,
            idempotencyKey: existing.idempotency_key ?? idempotencyKey,
            status: existing.status,
            title: existing.title,
            createdAt: existing.created_at,
            message: "Work order already exists for this idempotencyKey or activityId",
          },
          { status: 200 },
        );
      }
    } catch {
      // In case activity_id or idempotency_key column is pending migration
    }
  }

  // 2. Resolve Category ID (supports category UUID or name: Plumbing, Electrical, HVAC, Safety)
  let categoryId = input.category_id;
  let categoryName = "Facilities";

  try {
    const { data: categories } = await supabase.from("categories").select("id, name");
    if (categories && categories.length > 0) {
      if (categoryId) {
        const found = categories.find((c) => c.id === categoryId);
        if (found) categoryName = found.name;
      } else if (input.category) {
        const target = input.category.toLowerCase().trim();
        const matched = categories.find(
          (c) => c.name.toLowerCase() === target || c.name.toLowerCase().includes(target),
        );
        if (matched) {
          categoryId = matched.id;
          categoryName = matched.name;
        }
      }

      if (!categoryId) {
        categoryId = categories[0].id;
        categoryName = categories[0].name;
      }
    }
  } catch {
    if (!categoryId) {
      categoryId = "55555555-5555-4555-8555-555555555555";
      categoryName = "Electrical";
    }
  }

  // 3. Resolve Location ID
  let locationId = input.location_id;
  try {
    const { data: locations } = await supabase.from("locations").select("id, building, floor_room");
    if (locations && locations.length > 0) {
      if (input.location) {
        const target = input.location.toLowerCase().trim();
        const matched = locations.find(
          (l) =>
            l.building.toLowerCase().includes(target) ||
            l.floor_room.toLowerCase().includes(target),
        );
        if (matched) locationId = matched.id;
      }

      if (!locationId) {
        locationId = locations[0].id;
      }
    }
  } catch {
    if (!locationId) {
      locationId = "11111111-1111-4111-8111-111111111111";
    }
  }

  // 4. Resolve fallback reporter identity for database foreign key constraint
  let reporterId: string | null = null;
  try {
    const { data: sampleOrder } = await supabase
      .from("work_orders")
      .select("reporter_id")
      .not("reporter_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (sampleOrder?.reporter_id) {
      reporterId = sampleOrder.reporter_id;
    }
  } catch {
    // Ignore if not retrievable
  }

  // 5. Insert Work Order
  const fullDescription = input.schedule
    ? `${input.description}\n[Event Schedule: ${input.schedule}]`
    : input.description;

  const insertData: Record<string, unknown> = {
    title: input.title,
    description: fullDescription,
    category_id: categoryId,
    location_id: locationId,
    status: "OPEN",
  };
  if (reporterId) {
    insertData.reporter_id = reporterId;
  }
  if (input.activity_id) {
    insertData.activity_id = input.activity_id;
  }
  if (idempotencyKey) {
    insertData.idempotency_key = idempotencyKey;
  }

  let newOrder: any = null;
  const { data: inserted, error: insertError } = await supabase
    .from("work_orders")
    .insert(insertData)
    .select()
    .single();

  if (insertError) {
    // Fallback: If remote DB does not yet have activity_id/idempotency_key columns, retry without them
    if (
      (insertError.message?.includes("activity_id") || insertError.message?.includes("idempotency_key")) &&
      input.activity_id
    ) {
      delete insertData.activity_id;
      delete insertData.idempotency_key;
      insertData.description = `${input.description}\n[Team 12 Activity: ${input.activity_id}]`;
      const { data: retryData, error: retryError } = await supabase
        .from("work_orders")
        .insert(insertData)
        .select()
        .single();

      if (retryError) return supabaseErrorResponse(retryError);
      newOrder = retryData;
    } else {
      return supabaseErrorResponse(insertError);
    }
  } else {
    newOrder = inserted;
  }

  // 6. Record Status History Entry
  try {
    await supabase.from("status_history").insert({
      work_order_id: newOrder.id,
      changed_by: reporterId,
      from_status: null,
      to_status: "OPEN",
      note: input.activity_id
        ? `Created via Team 12 Partner Integration (Activity: ${input.activity_id})`
        : "Created via Team 12 Partner Integration",
    });
  } catch {
    // Non-fatal
  }

  return Response.json(
    {
      success: true,
      duplicate: false,
      workOrderId: newOrder.id,
      activityId: input.activity_id ?? newOrder.activity_id ?? null,
      idempotencyKey: idempotencyKey ?? null,
      status: newOrder.status,
      title: newOrder.title,
      category: categoryName,
      locationId: newOrder.location_id,
      createdAt: newOrder.created_at,
    },
    { status: 201 },
  );
}

export async function GET(request: Request) {
  const authError = requirePartnerAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const activityId = url.searchParams.get("activity_id");
  const workOrderId = url.searchParams.get("work_order_id") || url.searchParams.get("id");

  if (!activityId && !workOrderId) {
    return errorResponse(400, "MISSING_QUERY_PARAM", "Please provide ?activity_id=... or ?id=...");
  }

  const supabase = getSupabaseClient();
  let query = supabase.from("work_orders").select("*");

  if (activityId) {
    query = query.eq("activity_id", activityId);
  } else if (workOrderId) {
    query = query.eq("id", workOrderId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return supabaseErrorResponse(error);
  if (!data) return errorResponse(404, "NOT_FOUND", "Work order not found");

  return Response.json({
    success: true,
    data: {
      workOrderId: data.id,
      activityId: data.activity_id ?? null,
      status: data.status,
      title: data.title,
      description: data.description,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

export async function PATCH(request: Request) {
  const authError = requirePartnerAuth(request);
  if (authError) return authError;

  const parsed = await readJson<UpdatePartnerWorkOrderInput>(request, updatePartnerWorkOrderSchema);
  if (parsed.response) return parsed.response;

  const input = parsed.data!;
  const supabase = getSupabaseClient();

  // Find existing active work order
  let query = supabase.from("work_orders").select("*").is("archived_at", null);
  if (input.work_order_id) {
    query = query.eq("id", input.work_order_id);
  } else if (input.activity_id) {
    query = query.eq("activity_id", input.activity_id);
  }

  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) return supabaseErrorResponse(findError);
  if (!existing) {
    return errorResponse(404, "NOT_FOUND", "Active work order not found for this activity or ID");
  }

  // Handle Cancellation
  if (input.action === "cancel") {
    const now = new Date().toISOString();
    const { error: cancelError } = await supabase
      .from("work_orders")
      .update({ archived_at: now })
      .eq("id", existing.id);

    if (cancelError) return supabaseErrorResponse(cancelError);

    try {
      await supabase.from("status_history").insert({
        work_order_id: existing.id,
        changed_by: existing.reporter_id,
        from_status: existing.status,
        to_status: existing.status,
        note: input.activity_id
          ? `Cancelled by Team 12 Partner (Activity: ${input.activity_id})`
          : "Cancelled by Team 12 Partner",
      });
    } catch {
      // Non-fatal
    }

    return Response.json({
      success: true,
      cancelled: true,
      workOrderId: existing.id,
      activityId: existing.activity_id,
      archivedAt: now,
      message: "Work order successfully cancelled and archived",
    });
  }

  // Handle Modification (Rescheduling, Notes, Venue change)
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.title) updatePayload.title = input.title;
  if (input.description) updatePayload.description = input.description;

  // Resolve Category if changed
  if (input.category_id) {
    updatePayload.category_id = input.category_id;
  } else if (input.category) {
    const { data: categories } = await supabase.from("categories").select("id, name");
    if (categories) {
      const target = input.category.toLowerCase().trim();
      const matched = categories.find(
        (c) => c.name.toLowerCase() === target || c.name.toLowerCase().includes(target),
      );
      if (matched) updatePayload.category_id = matched.id;
    }
  }

  // Resolve Location (Venue change) if changed
  if (input.location_id) {
    updatePayload.location_id = input.location_id;
  } else if (input.location) {
    const { data: locations } = await supabase.from("locations").select("id, building, floor_room");
    if (locations) {
      const target = input.location.toLowerCase().trim();
      const matched = locations.find(
        (l) =>
          l.building.toLowerCase().includes(target) ||
          l.floor_room.toLowerCase().includes(target),
      );
      if (matched) updatePayload.location_id = matched.id;
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("work_orders")
    .update(updatePayload)
    .eq("id", existing.id)
    .select()
    .single();

  if (updateError) return supabaseErrorResponse(updateError);

  try {
    await supabase.from("status_history").insert({
      work_order_id: existing.id,
      changed_by: existing.reporter_id,
      from_status: existing.status,
      to_status: existing.status,
      note: "Updated by Team 12 Partner (Venue/Details modification)",
    });
  } catch {
    // Non-fatal
  }

  return Response.json({
    success: true,
    updated: true,
    workOrderId: updated.id,
    activityId: updated.activity_id,
    title: updated.title,
    description: updated.description,
    locationId: updated.location_id,
    categoryId: updated.category_id,
    updatedAt: updated.updated_at,
  });
}

export async function DELETE(request: Request) {
  const authError = requirePartnerAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const activityId = url.searchParams.get("activity_id");
  const workOrderId = url.searchParams.get("work_order_id") || url.searchParams.get("id");

  if (!activityId && !workOrderId) {
    return errorResponse(400, "MISSING_QUERY_PARAM", "Please provide ?activity_id=... or ?id=...");
  }

  const supabase = getSupabaseClient();
  let query = supabase.from("work_orders").select("*").is("archived_at", null);

  if (activityId) {
    query = query.eq("activity_id", activityId);
  } else if (workOrderId) {
    query = query.eq("id", workOrderId);
  }

  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) return supabaseErrorResponse(findError);
  if (!existing) {
    return errorResponse(404, "NOT_FOUND", "Active work order not found for this activity or ID");
  }

  const now = new Date().toISOString();
  const { error: archiveError } = await supabase
    .from("work_orders")
    .update({ archived_at: now })
    .eq("id", existing.id);

  if (archiveError) return supabaseErrorResponse(archiveError);

  try {
    await supabase.from("status_history").insert({
      work_order_id: existing.id,
      changed_by: existing.reporter_id,
      from_status: existing.status,
      to_status: existing.status,
      note: activityId
        ? `Cancelled/Archived by Team 12 Partner (Activity: ${activityId})`
        : "Cancelled/Archived by Team 12 Partner",
    });
  } catch {
    // Non-fatal
  }

  return Response.json({
    success: true,
    cancelled: true,
    workOrderId: existing.id,
    activityId: existing.activity_id ?? null,
    archivedAt: now,
    message: "Work order cancelled and archived",
  });
}
