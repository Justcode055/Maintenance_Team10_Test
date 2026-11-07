export function percentile(values, fraction) {
  if (!values.length) return null;
  if (fraction <= 0 || fraction > 1) throw new RangeError('Percentile must be in (0, 1]');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

export function summarize(values, budgetMs, expectedCount) {
  const round = (value) => value === null ? null : Math.round(value * 100) / 100;
  const p95 = percentile(values, 0.95);
  return { samples: values.length, expectedSamples: expectedCount, p50Ms: round(percentile(values, 0.5)), p95Ms: round(p95), p99Ms: round(percentile(values, 0.99)),
    minMs: values.length ? round(Math.min(...values)) : null, maxMs: values.length ? round(Math.max(...values)) : null,
    budgetMs, passed: values.length === expectedCount && p95 !== null && p95 < budgetMs };
}

export function parseServerTiming(value) {
  const result = {};
  for (const item of (value ?? '').split(',')) {
    const match = item.trim().match(/^(auth|database);dur=(\d+(?:\.\d+)?)$/);
    if (match) result[match[1]] = Number(match[2]);
  }
  return result;
}
