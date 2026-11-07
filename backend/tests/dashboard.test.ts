import { test } from "node:test";
import assert from "node:assert/strict";
import { campusWeekStart, overdueFilter } from "../lib/dashboard.ts";

test("campus week starts Monday in Bangkok, including the UTC Sunday boundary", () => {
  assert.equal(campusWeekStart(Date.parse("2026-11-08T16:59:59Z")), "2026-11-01T17:00:00.000Z");
  assert.equal(campusWeekStart(Date.parse("2026-11-08T17:00:00Z")), "2026-11-08T17:00:00.000Z");
});
test("overdue filters use each category's own SLA and ignore invalid metadata", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(overdueFilter([{ id, sla_hours: 8 }], Date.parse("2026-11-08T10:00:00Z")), `and(category_id.eq.${id},created_at.lte.2026-11-08T02:00:00.000Z)`);
  assert.equal(overdueFilter([{ id: "untrusted),id.eq.any", sla_hours: 8 }, { id, sla_hours: -1 }], Date.now()), null);
});
