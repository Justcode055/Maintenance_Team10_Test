export const CATEGORY_REQUEST_DEADLINE_MS = 1500;

export type CategorySuggestion = {
  fallbackToManual: boolean; category_id?: string; category_name?: string; sla_hours?: number;
  confidence?: number; execution_time_ms?: number; reason?: string; detected_building?: { id: string; name: string };
};

export class CategoryRequestTimeout extends Error {
  constructor() { super("Category suggestion deadline exceeded"); this.name = "CategoryRequestTimeout"; }
}

// Covers the complete browser request, including authentication, transport and body parsing.
export async function requestCategorySuggestion(url: string, token: string, input: { title: string; description: string },
  options: { timeoutMs?: number; transport?: typeof fetch } = {}): Promise<{ data: CategorySuggestion }> {
  const timeoutMs = options.timeoutMs ?? CATEGORY_REQUEST_DEADLINE_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("A positive deadline is required");
  const transport = options.transport ?? fetch;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(async () => {
        const response = await transport(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input), signal: controller.signal });
        if (!response.ok) throw new Error("Category suggestions unavailable");
        const json = await response.json();
        if (!json?.data || typeof json.data.fallbackToManual !== "boolean") throw new Error("Invalid category suggestion");
        return json as { data: CategorySuggestion };
      }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { reject(new CategoryRequestTimeout()); controller.abort(); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
