import { z } from "zod";
import { errorResponse, readRequestText } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { canonicalJson, secretsMatch, verifyWebhookSignature } from "@/lib/security";

const eventSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  type: z.string().trim().min(1).max(128),
}).passthrough();

export async function POST(request: Request) {
  const secret = process.env.TEAM10_WEBHOOK_SECRET;
  if (!secretsMatch(request.headers.get("x-webhook-secret"), secret)) {
    return errorResponse(401, "INVALID_WEBHOOK_SECRET", "Webhook secret is invalid");
  }
  const eventId = request.headers.get("x-event-id");
  if (!eventId || eventId.length > 200 || !/^[A-Za-z0-9_.:-]+$/.test(eventId)) {
    return errorResponse(400, "INVALID_EVENT_ID", "A valid X-Event-ID is required");
  }
  const raw = await readRequestText(request);
  if (raw.response) return raw.response;
  const signature = request.headers.get("x-webhook-signature");
  // Preserve the agreed shared-secret inbound contract; verify any supplied HMAC
  // over the exact raw bytes, never a reserialized JSON object.
  if (signature !== null && !verifyWebhookSignature(raw.text!, signature, secret!)) {
    return errorResponse(401, "INVALID_SIGNATURE", "Webhook signature is invalid");
  }
  let payload: z.infer<typeof eventSchema>;
  try { payload = eventSchema.parse(JSON.parse(raw.text!)); canonicalJson(payload); } catch {
    return errorResponse(400, "INVALID_EVENT", "Webhook requires a valid JSON event with a type");
  }
  if (payload.id && payload.id !== eventId) {
    return errorResponse(400, "EVENT_ID_MISMATCH", "Event ID must match X-Event-ID");
  }
  let client;
  try { client = createSupabaseAdminClient(); } catch {
    return errorResponse(503, "WEBHOOK_UNAVAILABLE", "Webhook storage is not configured");
  }
  // Insert first: the primary key serializes concurrent deliveries.
  const { error } = await client.from("partner_webhook_events").insert({
    event_id: eventId, event_type: payload.type, payload,
  });
  if (!error) return Response.json({ received: true, duplicate: false, eventId }, { status: 201 });
  if (error.code !== "23505") {
    return errorResponse(503, "WEBHOOK_STORAGE_ERROR", "Webhook storage is temporarily unavailable");
  }
  const { data: existing, error: lookupError } = await client.from("partner_webhook_events")
    .select("payload").eq("event_id", eventId).single();
  if (lookupError) return errorResponse(503, "WEBHOOK_STORAGE_ERROR", "Webhook storage is temporarily unavailable");
  if (canonicalJson(existing.payload) !== canonicalJson(payload)) {
    return errorResponse(409, "EVENT_ID_CONFLICT", "Event ID has already been used for a different payload");
  }
  return Response.json({ received: true, duplicate: true, eventId });
}
