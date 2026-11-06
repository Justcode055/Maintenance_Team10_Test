import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Read secret from backend/.env.local
const envPath = path.resolve(process.cwd(), "backend/.env.local");
let webhookSecret = process.env.TEAM12_WEBHOOK_SECRET || "";

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("TEAM12_WEBHOOK_SECRET=")) {
      webhookSecret = trimmed.replace("TEAM12_WEBHOOK_SECRET=", "").trim().replace(/^["']|["']$/g, "");
    }
  }
}

const targetUrl = "https://veneering-decipher-entire.ngrok-free.dev/webhooks/partner";
const workOrderId = "88888888-8888-4888-8888-888888888888";
const eventId = randomUUID();
const occurredAt = new Date().toISOString();

const payload = {
  id: eventId,
  type: "maintenance.status_changed",
  occurredAt,
  data: {
    workOrderId,
    fromStatus: "OPEN",
    toStatus: "ASSIGNED",
  },
};

const body = JSON.stringify(payload);
const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");

const headers = {
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true",
  "X-Webhook-Secret": webhookSecret,
  "X-Webhook-Signature": `sha256=${signature}`,
  "X-Event-ID": eventId,
  "X-Event-Sequence": "2",
  "X-Event-Version": "2",
};

async function sendWebhook() {
  console.log(`Sending status webhook to Team 12:`);
  console.log(`Target URL: ${targetUrl}`);
  console.log(`Work Order ID: ${workOrderId}`);
  console.log(`Event ID: ${eventId}`);
  console.log(`Payload:\n${JSON.stringify(payload, null, 2)}\n`);

  // Attempt 1: Initial delivery
  console.log("--- Attempt 1 (Initial Delivery) ---");
  const res1 = await fetch(targetUrl, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  });

  const text1 = await res1.text();
  console.log(`HTTP Status: ${res1.status} ${res1.statusText}`);
  console.log(`Response Body: ${text1}\n`);

  // Attempt 2: Replay (Testing idempotency)
  console.log("--- Attempt 2 (Replay / Duplicate Delivery) ---");
  const res2 = await fetch(targetUrl, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  });

  const text2 = await res2.text();
  console.log(`HTTP Status: ${res2.status} ${res2.statusText}`);
  console.log(`Response Body: ${text2}\n`);

  return {
    workOrderId,
    eventId,
    attempt1: { status: res1.status, body: text1 },
    attempt2: { status: res2.status, body: text2 },
  };
}

sendWebhook().catch((err) => {
  console.error("Failed to deliver webhook to Team 12:", err);
  process.exit(1);
});
