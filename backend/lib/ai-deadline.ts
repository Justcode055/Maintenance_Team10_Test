import type { ClassificationResult } from "./ai-classifier.ts";

export const AI_DEADLINE_MS = 1500;

export function deadlineFallback(elapsedMs: number): ClassificationResult {
  return { fallbackToManual: true, decision_method: "Deterministic-Fallback", execution_time_ms: Math.round(elapsedMs * 100) / 100,
    reason: "NFR_TIMEOUT: Category suggestion exceeded its time budget" };
}

// The signal also lets a future remote model cancel its underlying request.
export async function classifyWithinDeadline(
  operation: (signal: AbortSignal) => Promise<ClassificationResult>, budgetMs = AI_DEADLINE_MS,
): Promise<ClassificationResult> {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new RangeError("A positive deadline is required");
  const start = performance.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)).then((result) => performance.now() - start >= budgetMs ? deadlineFallback(performance.now() - start) : result),
      new Promise<ClassificationResult>((resolve) => { timer = setTimeout(() => { controller.abort(); resolve(deadlineFallback(performance.now() - start)); }, budgetMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
