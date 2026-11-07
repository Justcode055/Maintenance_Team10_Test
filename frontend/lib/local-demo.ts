// Preview access is deliberately unavailable in production, including localhost builds.
export function canUseLocalDemo(hostname: string): boolean {
  return process.env.NODE_ENV === "development"
    && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export const demoLocations = [{ id: "demo-location", building: "S1 Science Laboratory Wing", floor_room: "Lab 204" }, { id: "demo-location-2", building: "AD1 Administration Building", floor_room: "Office 103" }];
export const demoCategories = [{ id: "demo-category", name: "Electrical", sla_hours: 8 }, { id: "demo-category-2", name: "HVAC", sla_hours: 18 }];

export function sampleWorkOrders() {
  const now = new Date().toISOString();
  return [
    { id: "demo-open", title: "Flickering light in Lab 204", description: "The ceiling light above the lab benches flickers during class.", status: "OPEN" as const },
    { id: "demo-assigned", title: "Projector power socket needs attention", description: "The projector power socket is loose. A technician has been assigned.", status: "ASSIGNED" as const },
    { id: "demo-resolved", title: "Corridor lighting repaired", description: "Replacement lighting has been installed outside the laboratory.", status: "RESOLVED" as const, resolution_notes: "Replaced the faulty light and checked operation." },
    { id: "demo-progress", title: "Air conditioning needs repair", description: "The office air conditioner is blowing warm air. Repairs are underway.", status: "IN_PROGRESS" as const },
    { id: "demo-closed", title: "Lecture room lighting repaired", description: "The classroom lights were flickering during lectures.", status: "CLOSED" as const, resolution_notes: "Replaced the faulty fitting and verified the repair." },
  ].map((order) => ({ ...order, reporter_id: "demo-user", location_id: order.id === "demo-progress" ? "demo-location-2" : "demo-location", category_id: order.id === "demo-progress" ? "demo-category-2" : "demo-category", created_at: order.id === "demo-progress" ? new Date(Date.now() - 20 * 3600000).toISOString() : now, updated_at: now }));
}
