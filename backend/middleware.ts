import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const allowedMethods = "GET,POST,PATCH,DELETE,OPTIONS";
const allowedHeaders =
  "Authorization, Content-Type, X-Partner-Key, X-Webhook-Secret, X-Webhook-Signature, X-Event-ID, X-Event-Sequence, X-Event-Version, X-Idempotency-Key, Idempotency-Key";

function allowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  const configured = (process.env.FRONTEND_ORIGINS ?? "http://localhost:3001")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return origin && configured.includes(origin) ? origin : null;
}

export function middleware(request: NextRequest) {
  const origin = allowedOrigin(request);
  if (request.headers.has("origin") && !origin) {
    return NextResponse.json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed" } }, { status: 403 });
  }
  const headers = new Headers({
    "Access-Control-Allow-Methods": allowedMethods,
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);

  if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers });

  const response = NextResponse.next();
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = { matcher: "/api/:path*" };
