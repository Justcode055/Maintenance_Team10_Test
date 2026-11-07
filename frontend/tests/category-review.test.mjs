import test from "node:test";
import assert from "node:assert/strict";
import { reviewCategorySuggestion } from "../lib/category-review.ts";

const categories = [{ id: "real-electrical", name: "Electrical" }, { id: "real-plumbing", name: "Plumbing" }];
const suggestion = { fallbackToManual: false, category_id: "seed-electrical", category_name: "Electrical", detected_building: { id: "seed-e1-room", name: "E1 School of Information Tech" } };

test("a valid category suggestion cannot overwrite an existing location with a building's seed room", () => {
  const selection = { categoryId: "real-plumbing", locationId: "user-selected-s1-room" };
  const result = reviewCategorySuggestion(selection, suggestion, categories);
  assert.equal(result.categoryId, "real-electrical");
  assert.equal(result.locationId, "user-selected-s1-room");
  assert.equal(selection.categoryId, "real-plumbing");
  assert.equal(result.buildingHint, "E1 School of Information Tech");
});
test("a building hint also leaves an empty location empty until the user chooses a room", () => {
  assert.equal(reviewCategorySuggestion({ categoryId: "", locationId: "" }, suggestion, categories).locationId, "");
});
test("fallback and unavailable categories preserve the user's manual choice", () => {
  const selection = { categoryId: "real-plumbing", locationId: "my-room" };
  for (const candidate of [{ ...suggestion, fallbackToManual: true }, { fallbackToManual: false, category_id: "unknown", category_name: "Unknown" }, { fallbackToManual: false, category_id: "real-electrical", category_name: "Plumbing" }]) {
    const result = reviewCategorySuggestion(selection, candidate, categories);
    assert.equal(result.applied, false);
    assert.equal(result.categoryId, selection.categoryId);
    assert.equal(result.locationId, selection.locationId);
  }
});
