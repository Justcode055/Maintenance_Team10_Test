import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarize, parseServerTiming } from '../scripts/performance-stats.mjs';
test('p95 uses nearest rank and leaves source samples intact', () => {
  const values = Array.from({ length: 50 }, (_, index) => 50 - index);
  assert.equal(percentile(values, 0.95), 48);
  assert.equal(values[0], 50);
});
test('missing samples and p95 at the strict limit cannot pass', () => {
  assert.equal(summarize([10, 20], 300, 50).passed, false);
  assert.equal(summarize([300, 300], 300, 2).passed, false);
  assert.equal(summarize([], 300, 50).passed, false);
  assert.equal(summarize([299, 100], 300, 2).passed, true);
});
test('component timing accepts only the documented numeric duration fields', () => {
  assert.deepEqual(parseServerTiming('auth;dur=41.25, database;dur=82.5'), { auth: 41.25, database: 82.5 });
  assert.deepEqual(parseServerTiming(null), {});
  assert.deepEqual(parseServerTiming('token;dur=20, auth;dur=NaN'), {});
});
