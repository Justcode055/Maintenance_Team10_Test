export const STAGES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type WorkOrderStatus = (typeof STAGES)[number];
export type LocationItem = { id: string; building: string; floor_room: string };
export type CategoryItem = { id: string; name: string; sla_hours: number };
export interface WorkOrder {
  id: string; reporter_id: string | null; location_id: string; category_id: string;
  title: string; description: string; status: WorkOrderStatus;
  resolution_notes?: string | null; created_at: string; updated_at: string;
}
export type StatusUpdate = { order: WorkOrder; noticeId: number; expiresAt: number };
export const statusLabel = (status: string) => status === "ALL" ? "All statuses" : status === "IN_PROGRESS" ? "In progress" : status.charAt(0) + status.slice(1).toLowerCase();

export function targetTime(order: WorkOrder, categories: CategoryItem[]): number {
  const hours = categories.find((c) => c.id === order.category_id)?.sla_hours;
  return hours && Number.isFinite(Date.parse(order.created_at)) ? Date.parse(order.created_at) + hours * 3600000 : Infinity;
}

export function targetLabel(order: WorkOrder, categories: CategoryItem[], now: number) {
  if (order.status === "CLOSED" || order.status === "RESOLVED") return { text: statusLabel(order.status), overdue: false };
  const due = targetTime(order, categories);
  if (!Number.isFinite(due)) return { text: "Target unavailable", overdue: false };
  const minutes = Math.max(1, Math.ceil(Math.abs(due - now) / 60000));
  const duration = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  return { text: due <= now ? `Overdue by ${duration}` : `Due in ${duration}`, overdue: due <= now };
}

export function selectTickets(orders: WorkOrder[], categories: CategoryItem[], filters: { query: string; status: string; location: string; sort: string }) {
  const query = filters.query.trim().toLocaleLowerCase();
  return orders.filter((o) => (filters.status === "ALL" || o.status === filters.status)
    && (!filters.location || o.location_id === filters.location)
    && (!query || `${o.title} ${o.id}`.toLocaleLowerCase().includes(query)))
    .sort((a, b) => {
      if (filters.sort === "oldest") return Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);
      if (filters.sort === "urgent") {
        const rank = (o: WorkOrder) => o.status === "CLOSED" || o.status === "RESOLVED" ? Infinity : targetTime(o, categories);
        const difference = rank(a) - rank(b);
        if (!Number.isNaN(difference) && difference !== 0) return difference;
      }
      return Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id);
    });
}
