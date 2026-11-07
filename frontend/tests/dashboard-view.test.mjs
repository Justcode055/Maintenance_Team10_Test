import test from "node:test";
import assert from "node:assert/strict";
import { relativeUpdate, submitterLabel, updateLabel } from "../lib/dashboard-view.ts";

test("submitter attribution never guesses staff or reporter when identity is missing", () => {
  assert.equal(submitterLabel("staff"), "Submitted by staff");
  assert.equal(submitterLabel("reporter"), "Submitted by reporter");
  assert.equal(submitterLabel("partner"), "Submitted by partner");
  assert.equal(submitterLabel(), "Submitter unavailable");
});
test("update labels and time formatting distinguish each real lifecycle event", () => {
  assert.equal(updateLabel("RESOLVED"), "Repair resolved");
  assert.equal(updateLabel("CLOSED"), "Request closed");
  const now = Date.parse("2026-11-08T10:00:00Z");
  assert.equal(relativeUpdate("2026-11-08T09:48:00Z", now), "12 min ago");
  assert.equal(relativeUpdate("2026-11-08T09:00:00Z", now), "1 hour ago");
  assert.equal(relativeUpdate("not-a-date", now), "");
});
