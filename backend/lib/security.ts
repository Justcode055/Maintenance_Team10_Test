import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type AppRole = "reporter" | "staff";

export function resolveTrustedRole(user: { app_metadata?: Record<string, unknown> }): AppRole | null {
  const role = user.app_metadata?.role;
  return role === "reporter" || role === "staff" ? role : null;
}

export function isConfiguredSecret(value: string | undefined): value is string {
  return !!value && !/^(?:replace|optional|your[-_]|<)/i.test(value);
}

export function secretsMatch(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !isConfiguredSecret(expected)) return false;
  // Equal-sized digests avoid leaking the expected secret's length via comparison.
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

export function verifyWebhookSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature.slice(7), "hex"),
    createHmac("sha256", secret).update(body, "utf8").digest(),
  );
}

export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 64) throw new Error("JSON nesting exceeds 64 levels");
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item, depth + 1)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key], depth + 1)}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
