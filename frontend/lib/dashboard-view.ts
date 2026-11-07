import type { WorkOrder, WorkOrderStatus } from "./ticket-view.ts";

export type DashboardUpdate = { id: string; from_status: WorkOrderStatus | null; to_status: WorkOrderStatus; timestamp: string; work_orders: WorkOrder };
export type DashboardData = {
  summary: { open: number; inProgress: number; needsAttention: number; resolvedThisWeek: number };
  orders: WorkOrder[]; updates: DashboardUpdate[]; asOf: string;
};

export function updateLabel(status: WorkOrderStatus): string {
  return { OPEN: "Request submitted", ASSIGNED: "Technician assigned", IN_PROGRESS: "Repair started", RESOLVED: "Repair resolved", CLOSED: "Request closed" }[status];
}

export function relativeUpdate(timestamp: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 60000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ${minutes < 120 ? "hour" : "hours"} ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }).format(new Date(timestamp));
}

export function requestReference(id: string): string { return `#${id.slice(0, 8).toUpperCase()}`; }

export function submitterLabel(role?: string): string {
  return role === "staff" ? "Submitted by staff" : role === "reporter" ? "Submitted by reporter" : role === "partner" ? "Submitted by partner" : "Submitter unavailable";
}
