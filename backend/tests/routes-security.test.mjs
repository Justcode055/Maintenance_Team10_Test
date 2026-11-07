import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { registerHooks, createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHmac } from "node:crypto";

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
// Resolve the app's TypeScript aliases without a test bundler. Only Next's
// compile-time server marker is replaced; the actual route/auth/SDK code runs.
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
  if (specifier === "next/server") return { url: pathToFileURL(require.resolve("next/server")).href, shortCircuit: true };
  if (specifier.startsWith("@/")) return { url: new URL(specifier.slice(2) + ".ts", root).href, shortCircuit: true };
  if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts") && !/\.[a-z]+$/i.test(specifier)) {
    return { url: new URL(specifier + ".ts", context.parentURL).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "route-test-public-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "route-test-service-key";
process.env.TEAM10_PARTNER_KEY = "route-test-partner-key";
process.env.TEAM10_WEBHOOK_SECRET = "route-test-webhook-key";
process.env.FRONTEND_ORIGINS = "http://localhost:3001";
const originalFetch = globalThis.fetch;
const events = new Map();
const databaseCalls = [];
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  assert.equal(url.hostname, "supabase.invalid", "Tests must never contact a live service");
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (url.pathname === "/auth/v1/user") {
    if (!["reporter-token", "staff-token", "editable-token"].includes(token)) return Response.json({ message: "invalid token" }, { status: 401 });
    return Response.json({ id: "00000000-0000-4000-8000-000000000001", email: "fixture@example.invalid",
      app_metadata: token === "editable-token" ? {} : { role: token === "staff-token" ? "staff" : "reporter" },
      user_metadata: { role: "staff" },
    });
  }
  databaseCalls.push({ method: request.method, path: url.pathname, query: url.searchParams });
  if (url.pathname === "/rest/v1/partner_webhook_events") {
    if (request.method === "POST") {
      const event = await request.json();
      if (events.has(event.event_id)) return Response.json({ code: "23505", message: "duplicate" }, { status: 409 });
      events.set(event.event_id, event);
      return new Response(null, { status: 201 });
    }
    const id = url.searchParams.get("event_id")?.slice(3);
    return Response.json(events.has(id) ? { payload: events.get(id).payload } : null);
  }
  if (url.pathname === "/rest/v1/work_orders") return Response.json([]);
  return Response.json({ message: "unexpected database call" }, { status: 500 });
};
after(() => { globalThis.fetch = originalFetch; hooks.deregister(); });

const load = (path) => import(new URL(path, root));
const workOrders = await load("app/api/work-orders/route.ts");
const order = await load("app/api/work-orders/[id]/route.ts");
const partner = await load("app/api/partner/work-orders/route.ts");
const webhook = await load("app/api/integrations/team12/webhook/route.ts");
const { middleware } = await load("middleware.ts");
const staffRoutes = await Promise.all(["assign", "in-progress", "start", "resolve", "close"].map((name) => load(`app/api/work-orders/[id]/${name}/route.ts`)));
const context = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000010" }) };
const request = (method, token, body) => new Request("http://localhost/api/work-orders", { method,
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, body });

describe("Actual route security boundaries", () => {
  it("rejects unauthenticated and invalid bearer requests", async () => {
    assert.equal((await workOrders.GET(request("GET"))).status, 401);
    assert.equal((await workOrders.GET(request("GET", "invalid-token"))).status, 401);
  });
  it("blocks user-metadata role escalation at the actual API boundary", async () => {
    const before = databaseCalls.length;
    assert.equal((await workOrders.GET(request("GET", "editable-token"))).status, 403);
    assert.equal(databaseCalls.length, before);
  });
  it("still permits verified reporter and staff identities", async () => {
    assert.equal((await workOrders.GET(request("GET", "reporter-token"))).status, 200);
    assert.equal((await workOrders.GET(request("GET", "staff-token"))).status, 200);
  });
  it("rejects reporters on every staff mutation before accessing the database", async () => {
    const before = databaseCalls.length;
    for (const route of staffRoutes) assert.equal((await route.POST(request("POST", "reporter-token", "{}"), context)).status, 403);
    assert.equal((await order.PATCH(request("PATCH", "reporter-token", '{"title":"attack"}'), context)).status, 403);
    assert.equal((await order.DELETE(request("DELETE", "reporter-token"), context)).status, 403);
    assert.equal(databaseCalls.length, before);
  });
  it("enforces JSON body limits after authentication", async () => {
    assert.equal((await workOrders.POST(request("POST", "reporter-token", "x".repeat(65537)))).status, 413);
  });
  it("keeps partner access scoped and fails closed when the server key is missing", async () => {
    const valid = { "X-Partner-Key": process.env.TEAM10_PARTNER_KEY, "Content-Type": "application/json" };
    const before = databaseCalls.length;
    assert.equal((await partner.GET(new Request("http://localhost/api/partner/work-orders?activity_id=valid"))).status, 401);
    assert.equal(databaseCalls.length, before);
    assert.equal((await partner.GET(new Request("http://localhost/api/partner/work-orders?activity_id=valid", { headers: valid }))).status, 404);
    assert.equal(databaseCalls.at(-1).query.get("partner_source"), "eq.team12");
    assert.equal((await partner.GET(new Request("http://localhost/api/partner/work-orders?activity_id=x%29or%28id.eq.any%29", { headers: valid }))).status, 400);
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    try {
      assert.equal((await partner.POST(new Request("http://localhost/api/partner/work-orders", { method: "POST", headers: valid, body: '{"title":"test","description":"test"}' }))).status, 503);
    } finally { process.env.SUPABASE_SERVICE_ROLE_KEY = key; }
  });
  it("rejects unapproved browser origins and permits the configured frontend", () => {
    assert.equal(middleware(new Request("http://localhost/api/health", { headers: { Origin: "https://attacker.invalid" } })).status, 403);
    const allowed = middleware(new Request("http://localhost/api/health", { method: "OPTIONS", headers: { Origin: "http://localhost:3001" } }));
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "http://localhost:3001");
    assert.equal(allowed.headers.get("Cache-Control"), "no-store");
  });
  it("authenticates raw webhook bytes, deduplicates races and rejects conflicting event IDs", async () => {
    const body = JSON.stringify({ id: "route-test-event", type: "activity.published", data: { activityId: "activity-test" } });
    const headers = { "X-Webhook-Secret": process.env.TEAM10_WEBHOOK_SECRET, "X-Event-ID": "route-test-event",
      "X-Webhook-Signature": `sha256=${createHmac("sha256", process.env.TEAM10_WEBHOOK_SECRET).update(body).digest("hex")}` };
    const post = (text = body, override = {}) => webhook.POST(new Request("http://localhost/api/integrations/team12/webhook", { method: "POST", headers: { ...headers, ...override }, body: text }));
    assert.equal((await post(body, { "X-Webhook-Secret": "wrong" })).status, 401);
    assert.equal((await post(body + " ")).status, 401);
    assert.equal((await post()).status, 201);
    const duplicates = await Promise.all([post(), post(), post()]);
    assert.ok(duplicates.every((response) => response.status === 200));
    assert.equal(events.size, 1);
    const conflict = JSON.stringify({ id: "route-test-event", type: "activity.cancelled" });
    const signature = `sha256=${createHmac("sha256", process.env.TEAM10_WEBHOOK_SECRET).update(conflict).digest("hex")}`;
    assert.equal((await post(conflict, { "X-Webhook-Signature": signature })).status, 409);
    const legacy = JSON.stringify({ id: "route-test-legacy", type: "activity.published" });
    assert.equal((await webhook.POST(new Request("http://localhost/api/integrations/team12/webhook", {
      method: "POST", headers: { "X-Webhook-Secret": process.env.TEAM10_WEBHOOK_SECRET, "X-Event-ID": "route-test-legacy" }, body: legacy,
    }))).status, 201, "The agreed secret-only inbound contract remains supported");
  });
});
