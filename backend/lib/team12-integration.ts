import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { getStatusSequence } from "@/lib/status";

const partnerActivitiesUrl =
  process.env.TEAM12_PARTNER_ACTIVITIES_URL ??
  "https://pd-project-events-clubs.onrender.com/partner/activities";
const partnerWebhookUrl =
  process.env.TEAM12_PARTNER_WEBHOOK_URL ??
  "https://pd-project-events-clubs.onrender.com/webhooks/partner";

let lastSuccessAt: string | null = null;
let lastSuccessfulActivities: unknown = null;

function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function fetchTeam12Activities(limit = 20): Promise<unknown> {
  const url = new URL(partnerActivitiesUrl);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Partner-Key": requiredSecret("TEAM12_PARTNER_API_KEY"),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Team 12 activity request failed with HTTP ${response.status}`);
  }

  return body;
}

export async function fetchTeam12ActivitiesWithRetry(limit = 20) {
  const requestId = randomUUID();
  const retryDelays = [0, 1000, 2000];
  let lastError = "Team 12 is unavailable";

  for (const [attempt, delay] of retryDelays.entries()) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const data = await fetchTeam12Activities(limit);
      const recovered = attempt > 0;
      lastSuccessfulActivities = data;
      lastSuccessAt = new Date().toISOString();
      console.info("Team 12 activity fetch recovered", {
        requestId,
        attempt: attempt + 1,
        recovered,
        lastSuccessAt,
      });

      return {
        status: "ok" as const,
        data,
        stale: false,
        lastSuccessAt,
        requestId,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Team 12 is unavailable";
      console.warn("Team 12 activity fetch retry failed", {
        requestId,
        attempt: attempt + 1,
        error: lastError,
      });
    }
  }

  console.error("Team 12 activity fetch degraded", {
    requestId,
    reason: "PARTNER_UNAVAILABLE",
    retryAfterSeconds: 30,
    error: lastError,
  });

  return {
    status: "degraded" as const,
    data: lastSuccessfulActivities,
    stale: lastSuccessfulActivities !== null,
    lastSuccessAt,
    reason: "PARTNER_UNAVAILABLE",
    retryAfterSeconds: 30,
    requestId,
  };
}

export type DispatchStatusChangedInput = {
  workOrderId: string;
  fromStatus: string;
  toStatus: string;
  activityId?: string | null;
  sequence?: number;
  version?: number;
};

export async function dispatchTeam12StatusChanged(
  input: DispatchStatusChangedInput,
): Promise<void> {
  const sequence = input.sequence ?? input.version ?? getStatusSequence(input.toStatus);
  const event = {
    id: randomUUID(),
    type: "maintenance.status_changed",
    occurredAt: new Date().toISOString(),
    sequence,
    version: sequence,
    data: {
      workOrderId: input.workOrderId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      sequence,
      version: sequence,
      ...(input.activityId ? { activityId: input.activityId } : {}),
    },
  };
  const body = JSON.stringify(event);
  const secret = requiredSecret("TEAM12_WEBHOOK_SECRET");
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  const response = await fetch(partnerWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      "X-Webhook-Secret": secret,
      "X-Webhook-Signature": `sha256=${signature}`,
      "X-Event-ID": event.id,
      "X-Event-Sequence": String(sequence),
      "X-Event-Version": String(sequence),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Team 12 webhook failed with HTTP ${response.status}`);
  }

  console.info("Team 12 webhook delivered", {
    eventId: event.id,
    sequence,
    status: response.status,
  });
}

export function dispatchStatusChangedWithoutBlocking(
  input: DispatchStatusChangedInput,
): void {
  void dispatchTeam12StatusChanged(input).catch((error: unknown) => {
    console.error("Team 12 webhook delivery failed", {
      workOrderId: input.workOrderId,
      toStatus: input.toStatus,
      sequence: input.sequence,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  });
}
