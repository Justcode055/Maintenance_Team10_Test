// Bangkok has a fixed UTC+7 offset. Dashboard weeks start Monday at campus time.
export function campusWeekStart(now = Date.now()): string {
  const campus = new Date(now + 7 * 3600000);
  const day = (campus.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(campus.getUTCFullYear(), campus.getUTCMonth(), campus.getUTCDate() - day) - 7 * 3600000).toISOString();
}

export function overdueFilter(categories: { id: string; sla_hours: number }[], now: number): string | null {
  const terms = categories.filter((category) => /^[\da-f-]{36}$/i.test(category.id) && Number.isFinite(category.sla_hours) && category.sla_hours > 0)
    .map((category) => `and(category_id.eq.${category.id},created_at.lte.${new Date(now - category.sla_hours * 3600000).toISOString()})`);
  return terms.length ? terms.join(",") : null;
}
