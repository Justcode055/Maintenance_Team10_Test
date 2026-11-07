import { createHmac, randomUUID } from "node:crypto";
import { getStatusSequence, isAllowedTransition } from "./status.ts";
import type { WorkOrderStatus } from "./types.ts";

export type DispatchStatusChangedInput = {
  workOrderId: string; fromStatus: string; toStatus: string;
  activityId?: string | null; sequence?: number; version?: number;
};

export function partnerUrl(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || (url.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) {
    throw new Error("Partner URL must use HTTPS without embedded credentials");
  }
  return url;
}

export async function deliverStatusChanged(
  input: DispatchStatusChangedInput, target: string, secret: string,
  transport: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<{ eventId: string; sequence: number; status: number }> {
  const sequence = getStatusSequence(input.toStatus);
  if (!isAllowedTransition(input.fromStatus as WorkOrderStatus, input.toStatus as WorkOrderStatus)
    || (input.sequence !== undefined && input.sequence !== sequence)
    || (input.version !== undefined && input.version !== sequence)) {
    throw new Error("Webhook must describe a valid transition with matching sequence and version");
  }
  const url = partnerUrl(target);
  const event = { id: randomUUID(), type: "maintenance.status_changed", occurredAt: new Date().toISOString(),
    sequence, version: sequence, data: {
      workOrderId: input.workOrderId, fromStatus: input.fromStatus, toStatus: input.toStatus,
      sequence, version: sequence, ...(input.activityId ? { activityId: input.activityId } : {}),
    },
  };
  // Construct once so retries reuse the UUID, occurrence time, exact bytes and signature.
  const body = JSON.stringify(event);
  const headers = { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true",
    "X-Webhook-Secret": secret, "X-Webhook-Signature": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    "X-Event-ID": event.id, "X-Event-Sequence": String(sequence), "X-Event-Version": String(sequence),
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await pause(attempt * 1000);
    let response: Response;
    try {
      response = await transport(url, { method: "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(10000) });
    } catch {
      if (attempt === 2) throw new Error("Team 12 webhook network delivery failed");
      continue;
    }
    await response.body?.cancel();
    if (response.ok) return { eventId: event.id, sequence, status: response.status };
    if ((response.status < 500 && ![408, 429].includes(response.status)) || attempt === 2) {
      throw new Error(`Team 12 webhook failed with HTTP ${response.status}`);
    }
  }
  throw new Error("Team 12 webhook delivery exhausted retries");
}
