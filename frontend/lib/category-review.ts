import type { CategorySuggestion } from "./category-request.ts";

export function reviewCategorySuggestion(
  selection: { categoryId: string; locationId: string },
  suggestion: CategorySuggestion,
  categories: { id: string; name: string }[],
) {
  // Resolve against the actual options; seed IDs may differ between databases.
  const byId = categories.find((item) => item.id === suggestion.category_id);
  const byName = categories.find((item) => typeof suggestion.category_name === "string" && item.name.toLowerCase() === suggestion.category_name.toLowerCase());
  const conflicts = !!byId && typeof suggestion.category_name === "string" && byId.name.toLowerCase() !== suggestion.category_name.toLowerCase();
  const category = conflicts ? undefined : byId ?? byName;
  const applied = !suggestion.fallbackToManual && !!category;
  const name = suggestion.detected_building?.name;
  return {
    categoryId: applied ? category!.id : selection.categoryId,
    categoryName: applied ? category!.name : undefined,
    // A detected building does not identify a room. Preserve even a blank field.
    locationId: selection.locationId,
    buildingHint: typeof name === "string" && name.trim() ? name.trim().slice(0, 150) : null,
    applied,
  };
}
