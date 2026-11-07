import { z } from "zod";

export function errorResponse(
  status: number,
  code: string,
  message: string,
) {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export const MAX_BODY_BYTES = 64 * 1024;

export async function readRequestText(request: Request): Promise<{ text?: string; response?: Response }> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return { response: errorResponse(413, "BODY_TOO_LARGE", "Request body exceeds 64 KiB") };
  }
  if (!request.body) return { text: "" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { response: errorResponse(413, "BODY_TOO_LARGE", "Request body exceeds 64 KiB") };
      }
      text += decoder.decode(value, { stream: true });
    }
    return { text: text + decoder.decode() };
  } catch {
    return { response: errorResponse(400, "INVALID_BODY", "Request body must be valid UTF-8") };
  } finally {
    reader.releaseLock();
  }
}

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data?: T; response?: Response }> {
  try {
    const raw = await readRequestText(request);
    if (raw.response) return { response: raw.response };
    const body: unknown = JSON.parse(raw.text ?? "");
    const result = schema.safeParse(body);

    if (!result.success) {
      return {
        response: errorResponse(
          400,
          "VALIDATION_ERROR",
          result.error.issues.map((issue) => issue.message).join("; "),
        ),
      };
    }

    return { data: result.data };
  } catch {
    return {
      response: errorResponse(400, "INVALID_JSON", "Request body must be valid JSON"),
    };
  }
}

export function supabaseErrorResponse(error: { code?: string; message: string }) {
  const code = error.code;
  if (code === "PGRST116" || code === "P0002") return errorResponse(404, "NOT_FOUND", "Work order not found");
  if (code === "42501") return errorResponse(403, "FORBIDDEN", "Operation is not allowed");
  if (code === "23505" || code === "P0003") return errorResponse(409, "CONFLICT", "Request conflicts with an existing record");
  if (code === "P0001" || code === "23514") return errorResponse(409, "INVALID_OPERATION", "Operation violates the work-order lifecycle");
  if (code === "23503" || code === "22P02" || code === "22023") return errorResponse(400, "INVALID_REFERENCE", "Request contains invalid values or references");
  if (code === "PGRST202" || code === "42703") return errorResponse(503, "MIGRATION_REQUIRED", "Database setup must be completed before this operation");
  return errorResponse(503, "DATABASE_UNAVAILABLE", "Database operation is temporarily unavailable");
}
