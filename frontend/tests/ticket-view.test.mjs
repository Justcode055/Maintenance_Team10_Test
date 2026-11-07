import test from "node:test";
import assert from "node:assert/strict";
import { selectTickets, targetLabel } from "../lib/ticket-view.ts";

const categories = [{ id: "electrical", name: "Electrical", sla_hours: 8 }, { id: "hvac", name: "HVAC", sla_hours: 18 }];
const base = { reporter_id: "user", location_id: "lab", category_id: "electrical", description: "Repair needed", updated_at: "2026-11-07T08:00:00Z" };
const orders = [
  { ...base, id: "ABC-123", title: "Broken light", status: "OPEN", created_at: "2026-11-07T04:00:00Z" },
  { ...base, id: "DEF-456", title: "Air conditioning", status: "IN_PROGRESS", location_id: "office", category_id: "hvac", created_at: "2026-11-06T08:00:00Z" },
  { ...base, id: "GHI-789", title: "Repaired light", status: "RESOLVED", created_at: "2026-11-05T08:00:00Z" },
];
const filters = { query: "", status: "ALL", location: "", sort: "newest" };
test("search finds request IDs and titles without case sensitivity", () => {
  assert.deepEqual(selectTickets(orders, categories, { ...filters, query: " abc-123 " }).map((o) => o.id), ["ABC-123"]);
  assert.equal(selectTickets(orders, categories, { ...filters, query: "LIGHT" }).length, 2);
});
test("status, location and search are combined rather than replacing each other", () => {
  assert.equal(selectTickets(orders, categories, { ...filters, query: "light", status: "RESOLVED", location: "lab" })[0].id, "GHI-789");
  assert.equal(selectTickets(orders, categories, { ...filters, status: "OPEN", location: "office" }).length, 0);
});
test("repair-target sorting prioritizes active overdue work and does not mutate the source", () => {
  const original = orders.map((o) => o.id);
  assert.deepEqual(selectTickets(orders, categories, { ...filters, sort: "urgent" }).map((o) => o.id), ["DEF-456", "ABC-123", "GHI-789"]);
  assert.deepEqual(orders.map((o) => o.id), original);
});
test("target labels distinguish due work from finished work and missing categories", () => {
  const now = Date.parse("2026-11-07T10:00:00Z");
  assert.deepEqual(targetLabel(orders[0], categories, now), { text: "Due in 2h", overdue: false });
  assert.deepEqual(targetLabel(orders[1], categories, now), { text: "Overdue by 8h", overdue: true });
  assert.deepEqual(targetLabel(orders[2], categories, now), { text: "Resolved", overdue: false });
  assert.equal(targetLabel(orders[0], [], now).text, "Target unavailable");
});
