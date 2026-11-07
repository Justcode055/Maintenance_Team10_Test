import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { deliverStatusChanged, partnerUrl, type DispatchStatusChangedInput } from "./webhook-delivery.ts";
import { isConfiguredSecret } from "./security.ts";
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
  if (!isConfiguredSecret(value)) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function fetchTeam12Activities(limit = 20): Promise<unknown> {
  const url = partnerUrl(partnerActivitiesUrl);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Partner-Key": requiredSecret("TEAM12_PARTNER_API_KEY"),
    },
    cache: "no-store",
    redirect: "error",
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

export type { DispatchStatusChangedInput } from "./webhook-delivery.ts";

export async function dispatchTeam12StatusChanged(input: DispatchStatusChangedInput): Promise<void> {
  const delivered = await deliverStatusChanged(input, partnerWebhookUrl, requiredSecret("TEAM12_WEBHOOK_SECRET"));
  console.info("Team 12 webhook delivered", delivered);
}

export function dispatchStatusChangedWithoutBlocking(input: DispatchStatusChangedInput): void {
  after(async () => {
    try { await dispatchTeam12StatusChanged(input); } catch {
      console.error("Team 12 webhook delivery failed", { workOrderId: input.workOrderId, toStatus: input.toStatus });
    }
  });
}
