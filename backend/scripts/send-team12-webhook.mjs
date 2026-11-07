import { fileURLToPath } from "node:url";
import { deliverStatusChanged } from "../lib/webhook-delivery.ts";
import { isConfiguredSecret } from "../lib/security.ts";

process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) flags.set(process.argv[i], process.argv[i + 1]);
const input = { workOrderId: flags.get("--work-order-id"), fromStatus: flags.get("--from"), toStatus: flags.get("--to"), activityId: flags.get("--activity-id") };
if (!input.workOrderId || !input.fromStatus || !input.toStatus) {
  throw new Error("Provide --work-order-id UUID --from STATUS --to STATUS [--activity-id ID]. Verify the database transition first.");
}
const target = process.env.TEAM12_PARTNER_WEBHOOK_URL;
const secret = process.env.TEAM12_WEBHOOK_SECRET;
if (!target || !isConfiguredSecret(secret)) throw new Error("Configure the agreed webhook URL and secret privately");
try {
  console.log(await deliverStatusChanged(input, target, secret));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
