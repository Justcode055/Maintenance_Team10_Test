import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { resolveTrustedRole, secretsMatch, verifyWebhookSignature, canonicalJson } from "../lib/security.ts";
import { readJson, readRequestText, MAX_BODY_BYTES, supabaseErrorResponse } from "../lib/api.ts";
import { deliverStatusChanged, partnerUrl } from "../lib/webhook-delivery.ts";
import { createPartnerWorkOrderSchema, updatePartnerWorkOrderSchema, partnerLookupSchema } from "../lib/work-order-schemas.ts";

describe("Security regressions", () => {
  it("cannot promote a user using editable metadata", () => {
    const attacker = { app_metadata: {}, user_metadata: { role: "staff" } };
    assert.equal(resolveTrustedRole(attacker), null);
    assert.equal(resolveTrustedRole({ ...attacker, app_metadata: { role: "reporter" } }), "reporter");
    assert.equal(resolveTrustedRole({ app_metadata: { role: "staff" } }), "staff");
    assert.equal(resolveTrustedRole({ app_metadata: { role: "owner" } }), null);
  });

  it("rejects missing, placeholder, wrong-length and incorrect secrets", () => {
    assert.equal(secretsMatch("agreed-test-secret", "agreed-test-secret"), true);
    for (const value of [null, "", "wrong", "agreed-test-secret-extra"]) assert.equal(secretsMatch(value, "agreed-test-secret"), false);
    assert.equal(secretsMatch("replace-me", "replace-me"), false);
    assert.equal(secretsMatch("anything", undefined), false);
  });

  it("verifies HMAC against exact raw bytes and rejects malformed signatures", () => {
    const body = '{"type":"activity.published", "data":{"title":"งาน"}}';
    const secret = "unit-test-signing-key";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    assert.equal(verifyWebhookSignature(body, signature, secret), true);
    assert.equal(verifyWebhookSignature(JSON.stringify(JSON.parse(body)), signature, secret), false);
    for (const invalid of [null, "sha256=ff", "sha256=" + "g".repeat(64), signature + "00"]) {
      assert.equal(verifyWebhookSignature(body, invalid, secret), false);
    }
  });

  it("detects conflicting event payloads despite JSON key ordering", () => {
    assert.equal(canonicalJson({ b: [1, 2], a: 3 }), canonicalJson({ a: 3, b: [1, 2] }));
    assert.notEqual(canonicalJson({ status: "OPEN" }), canonicalJson({ status: "CLOSED" }));
    let nested: unknown = 0;
    for (let i = 0; i < 70; i++) nested = [nested];
    assert.throws(() => canonicalJson(nested), /nesting/);
  });

  it("bounds body bytes with or without an honest Content-Length header", async () => {
    for (const headers of [new Headers(), new Headers({ "Content-Length": "1" })]) {
      const r = await readRequestText(new Request("http://localhost", { method: "POST", headers, body: "x".repeat(MAX_BODY_BYTES + 1) }));
      assert.equal(r.response?.status, 413);
    }
    const utf8 = await readRequestText(new Request("http://localhost", { method: "POST", body: "งาน".repeat(MAX_BODY_BYTES / 4) }));
    assert.equal(utf8.response?.status, 413);
    const valid = await readJson(new Request("http://localhost", { method: "POST", body: '{"name":"valid"}' }), z.object({ name: z.string() }));
    assert.deepEqual(valid.data, { name: "valid" });
    const invalid = await readJson(new Request("http://localhost", { method: "POST", body: "{" }), z.object({}));
    assert.equal(invalid.response?.status, 400);
  });

  it("rejects filter injection, cross-field privilege changes and excessive input", () => {
    const input = { title: "Facilities", description: "Projector setup", activity_id: "rXTvjUumz1aTJDwiq9yt", idempotency_key: "team12:event:1" };
    assert.equal(createPartnerWorkOrderSchema.safeParse(input).success, true);
    for (const activity_id of ["x,id.not.is.null", "x)or(id.eq.any)", " ", "a".repeat(201)]) {
      assert.equal(createPartnerWorkOrderSchema.safeParse({ ...input, activity_id }).success, false);
    }
    assert.equal(createPartnerWorkOrderSchema.safeParse({ ...input, description: "a".repeat(10001) }).success, false);
    assert.equal(updatePartnerWorkOrderSchema.safeParse({ activity_id: "valid", status: "CLOSED" }).success, false);
    assert.equal(partnerLookupSchema.safeParse({ work_order_id: "not-a-uuid" }).success, false);
  });

  it("does not leak database internals in error responses", async () => {
    const result = supabaseErrorResponse({ code: "XX000", message: "private database host and query details" });
    assert.equal(result.status, 503);
    assert.doesNotMatch(await result.text(), /private database/);
    assert.equal(supabaseErrorResponse({ code: "23505", message: "constraint name" }).status, 409);
  });

  it("retries a webhook with identical UUID, payload, HMAC and sequence headers", async () => {
    const requests: RequestInit[] = [];
    const transport = async (_url: unknown, init?: RequestInit) => {
      requests.push(init!);
      return new Response(null, { status: requests.length === 1 ? 503 : 200 });
    };
    const result = await deliverStatusChanged({ workOrderId: "test-order", activityId: "activity-1", fromStatus: "OPEN", toStatus: "ASSIGNED" }, "https://partner.example/webhooks", "test-signing-secret", transport as typeof fetch, async () => {});
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body, requests[1].body);
    assert.deepEqual(requests[0].headers, requests[1].headers);
    const event = JSON.parse(requests[0].body as string);
    const headers = new Headers(requests[0].headers);
    assert.equal(headers.get("X-Event-ID"), event.id);
    assert.equal(event.id, result.eventId);
    assert.equal(event.sequence, 2);
    assert.equal(event.data.sequence, event.version);
    assert.equal(event.data.version, Number(headers.get("X-Event-Version")));
    assert.equal(verifyWebhookSignature(requests[0].body as string, headers.get("X-Webhook-Signature"), "test-signing-secret"), true);
    assert.equal(requests[0].redirect, "error");
  });

  it("uses fresh event UUIDs and refuses illegal transitions or mismatched versions", async () => {
    const ids: string[] = [];
    const transport = async (_url: unknown, init?: RequestInit) => { ids.push(JSON.parse(init!.body as string).id); return new Response(null, { status: 200 }); };
    for (const [fromStatus, toStatus] of [["OPEN", "ASSIGNED"], ["ASSIGNED", "IN_PROGRESS"]]) {
      await deliverStatusChanged({ workOrderId: "test", fromStatus, toStatus }, "https://partner.example", "test-key", transport as typeof fetch);
    }
    assert.notEqual(ids[0], ids[1]);
    for (const input of [{ fromStatus: "OPEN", toStatus: "CLOSED" }, { fromStatus: "OPEN", toStatus: "ASSIGNED", version: 4 }]) {
      await assert.rejects(deliverStatusChanged({ workOrderId: "test", ...input }, "https://partner.example", "test-key", transport as typeof fetch));
    }
    assert.equal(ids.length, 2);
    assert.throws(() => partnerUrl("http://external.example/webhook"));
    assert.throws(() => partnerUrl("https://user:password@external.example/webhook"));
  });
});
