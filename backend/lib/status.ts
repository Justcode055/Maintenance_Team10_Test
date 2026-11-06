import type { WorkOrderStatus } from "@/lib/types";

export const STATUS_SEQUENCE: Record<WorkOrderStatus, number> = {
  OPEN: 1,
  ASSIGNED: 2,
  IN_PROGRESS: 3,
  RESOLVED: 4,
  CLOSED: 5,
};

export function getStatusSequence(status: string): number {
  return STATUS_SEQUENCE[status as WorkOrderStatus] ?? 1;
}

const transitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  OPEN: ["ASSIGNED"],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

export function isAllowedTransition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
): boolean {
  return transitions[from]?.includes(to) ?? false;
}
