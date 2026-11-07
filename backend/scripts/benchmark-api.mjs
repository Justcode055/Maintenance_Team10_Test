import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize, percentile, parseServerTiming } from './performance-stats.mjs';

const backend = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(path.join(backend, '.env.local'))) process.loadEnvFile(path.join(backend, '.env.local'));
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const credentialsFile = option('--credentials-file', null);
if (credentialsFile) process.loadEnvFile(path.resolve(backend, '..', credentialsFile));
const samples = Number(option('--samples', '50'));
const warmup = Number(option('--warmup', '5'));
if (!args.includes('--allow-test-writes')) throw new Error('Pass --allow-test-writes: this benchmark creates labelled test requests and soft-archives only requests created by this run.');
if (!Number.isInteger(samples) || samples < 20 || samples > 200 || !Number.isInteger(warmup) || warmup < 1 || warmup > 20) throw new Error('Use 20–200 samples and 1–20 warm-up rounds.');
if (!existsSync(path.join(backend, '.next', 'BUILD_ID'))) throw new Error('Build the backend before running this benchmark.');
const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`Configure ${name} privately in backend/.env.local`); return value; };
const supabaseUrl = new URL(required('NEXT_PUBLIC_SUPABASE_URL'));
if (supabaseUrl.protocol !== 'https:' || supabaseUrl.username || supabaseUrl.password) throw new Error('Live Supabase must use HTTPS without embedded credentials.');
const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const credentials = ['REPORTER', 'STAFF'].map((role) => ({ role: role.toLowerCase(), email: required(`TEST_${role}_EMAIL`), password: required(`TEST_${role}_PASSWORD`) }));
const runId = randomUUID();
const metrics = new Map();
const cold = new Map();
const pendingCleanup = new Set();
const failures = [];
const label = option('--label', 'baseline');
const output = path.resolve(backend, '..', option('--output', path.join(backend, '..', 'performance', 'results', `${label}-${runId}.json`)));
const report = { runId, label, startedAt: new Date().toISOString(), mode: 'production-local-api-live-supabase', node: process.version,
  buildId: readFileSync(path.join(backend, '.next', 'BUILD_ID'), 'utf8').trim(),
  samplesPerEndpoint: samples, warmupRounds: warmup, concurrency: 1,
  scope: 'Authenticated successful responses; includes HTTP transport, Supabase user verification, database operations and response-body parsing. Login is setup only.',
  partnerDelivery: 'Inactive in this isolated backend process; A5 is not exercised.',
  limitations: ['Local production backend, not Vercel or ngrok latency.', 'Warm p95 is reported separately from first-observed route timings; neither establishes uptime.', 'Test requests are soft-archived; their audit history is retained.'],
};
try {
  report.gitRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: backend, encoding: 'utf8', windowsHide: true }).trim();
  report.workingTreeDirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: backend, encoding: 'utf8', windowsHide: true }).trim();
} catch { report.gitRevision = 'unavailable'; }

async function jsonRequest(url, init = {}) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => null);
  return { response, data };
}
async function login(account) {
  const { response, data } = await jsonRequest(new URL('/auth/v1/token?grant_type=password', supabaseUrl), { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }) });
  const role = data?.user?.app_metadata?.role;
  if (!response.ok || !data?.access_token || !['reporter', 'staff'].includes(role)) throw new Error(`The configured ${account.role} test account could not authenticate with a trusted maintenance role (HTTP ${response.status}).`);
  return { token: data.access_token, id: data.user.id, role };
}
async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
let server;
let base;
let staff;
let measured = false;
let createdCount = 0, archivedCount = 0;
let interrupted = false;
const requestStop = () => { interrupted = true; };
process.on('SIGINT', requestStop);
process.on('SIGTERM', requestStop);
async function api(name, route, actor, method = 'GET', body, expectedStatus = 200) {
  if (interrupted) throw new Error('Benchmark interrupted; attempting to soft-archive its test requests.');
  const start = performance.now();
  const { response, data } = await jsonRequest(`${base}${route}`, { method, headers: { Authorization: `Bearer ${actor.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const elapsed = performance.now() - start;
  if (!cold.has(name)) cold.set(name, elapsed);
  if (!metrics.has(name)) metrics.set(name, { values: [], auth: [], database: [], budgetMs: name === 'POST /ai/categorize' ? 1500 : 300 });
  if (response.status !== expectedStatus) throw new Error(`${name} returned HTTP ${response.status}; expected ${expectedStatus}. Failed responses are never counted as performance passes.`);
  if (measured) {
    const metric = metrics.get(name);
    metric.values.push(elapsed);
    const timing = parseServerTiming(response.headers.get('server-timing'));
    if (timing.auth !== undefined) metric.auth.push(timing.auth);
    if (timing.database !== undefined) metric.database.push(timing.database);
  }
  return data;
}

try {
  const sessions = await Promise.all(credentials.map(login));
  const reporter = sessions.find((session) => session.role === 'reporter');
  staff = sessions.find((session) => session.role === 'staff');
  if (!reporter || !staff || reporter.id === staff.id) throw new Error('Configure distinct accounts covering both trusted reporter and staff roles. No roles are automatically promoted.');
  const setupHeaders = { apikey: anonKey, Authorization: `Bearer ${reporter.token}` };
  const location = await jsonRequest(new URL('/rest/v1/locations?select=id&limit=1', supabaseUrl), { headers: setupHeaders });
  const category = await jsonRequest(new URL('/rest/v1/categories?select=id&limit=1', supabaseUrl), { headers: setupHeaders });
  if (!location.response.ok || !category.response.ok || !location.data?.[0]?.id || !category.data?.[0]?.id) throw new Error('The test reporter must be able to read at least one existing location and category.');
  const locationId = location.data[0].id, categoryId = category.data[0].id;
  const port = await availablePort();
  base = `http://127.0.0.1:${port}/api`;
  const require = createRequire(import.meta.url);
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: backend, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), TEAM12_WEBHOOK_SECRET: '' }, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true,
  });
  server.on('error', () => {});
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('The production backend exited during startup.');
    try { const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) }); await response.body?.cancel(); if (response.ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('The production backend did not become ready.');
  console.log(`NFR-01 benchmark: ${samples} measured rounds + ${warmup} warm-up rounds, live Supabase, one request at a time.`);
  for (let round = 0; round < warmup + samples; round++) {
    measured = round >= warmup;
    const created = await api('POST /work-orders', '/work-orders', reporter, 'POST', { title: `NFR-01 benchmark ${runId} ${round}`, description: 'Performance test only. The classroom light is flickering.', location_id: locationId, category_id: categoryId }, 201);
    if (!/^[0-9a-f-]{36}$/i.test(created?.id ?? '') || created.reporter_id !== reporter.id || created.status !== 'OPEN') throw new Error('The create response did not identify an OPEN request owned by the test reporter.');
    const id = created.id;
    pendingCleanup.add(id);
    createdCount++;
    await api('GET /work-orders (reporter)', '/work-orders', reporter);
    await api('GET /work-orders (staff)', '/work-orders', staff);
    await api('GET /work-orders (filtered)', `/work-orders?status=OPEN&location_id=${encodeURIComponent(locationId)}`, staff);
    await api('GET /work-orders/:id', `/work-orders/${id}`, reporter);
    await api('PATCH /work-orders/:id', `/work-orders/${id}`, staff, 'PATCH', { title: `NFR-01 benchmark ${runId} ${round} updated` });
    const assigned = await api('POST /work-orders/:id/assign', `/work-orders/${id}/assign`, staff, 'POST', { staff_id: staff.id });
    if (assigned?.status !== 'ASSIGNED') throw new Error('Assignment did not return ASSIGNED.');
    const started = await api('POST /work-orders/:id/in-progress', `/work-orders/${id}/in-progress`, staff, 'POST');
    if (started?.status !== 'IN_PROGRESS') throw new Error('Start did not return IN_PROGRESS.');
    const resolved = await api('POST /work-orders/:id/resolve', `/work-orders/${id}/resolve`, staff, 'POST', { resolution_notes: `NFR-01 benchmark ${runId}: test lifecycle completed; no physical repair performed.` });
    if (resolved?.status !== 'RESOLVED') throw new Error('Resolve did not return RESOLVED.');
    const closed = await api('POST /work-orders/:id/close', `/work-orders/${id}/close`, staff, 'POST');
    if (closed?.status !== 'CLOSED') throw new Error('Close did not return CLOSED.');
    const history = await api('GET /work-orders/:id/history', `/work-orders/${id}/history`, reporter);
    if (!Array.isArray(history?.data) || !history.data.some((event) => event.to_status === 'CLOSED')) throw new Error('History did not include the CLOSED transition.');
    const archived = await api('DELETE /work-orders/:id', `/work-orders/${id}`, staff, 'DELETE');
    if (!archived?.archived_at) throw new Error('Archive did not return an archive timestamp.');
    archivedCount++;
    pendingCleanup.delete(id);
    const suggestion = await api('POST /ai/categorize', '/ai/categorize', reporter, 'POST', { title: 'Flickering light', description: 'The classroom light bulb is flickering.' });
    if (typeof suggestion?.data?.fallbackToManual !== 'boolean') throw new Error('Classification returned an invalid result.');
    if (round < warmup || (round - warmup + 1) % 5 === 0) {
      console.log(round < warmup ? `Warm-up ${round + 1}/${warmup} complete.` : `Measured round ${round - warmup + 1}/${samples} complete.`);
      if (measured) {
        const checkpoint = { ...report, provisional: true, completedMeasuredRounds: round - warmup + 1, endpoints: Object.fromEntries([...metrics].map(([name, item]) => [name, summarize(item.values, item.budgetMs, samples)])) };
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output + '.partial', JSON.stringify(checkpoint, null, 2) + '\n');
      }
    }
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : 'Benchmark failed.');
} finally {
  measured = false;
  const cleanupFailures = [];
  for (const id of pendingCleanup) {
    try {
      const { response } = await jsonRequest(`${base}/work-orders/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${staff.token}` } });
      if (!response.ok) cleanupFailures.push(id);
      else archivedCount++;
    } catch { cleanupFailures.push(id); }
  }
  if (server && server.exitCode === null) { server.kill(); await Promise.race([new Promise((resolve) => server.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]); }
  report.finishedAt = new Date().toISOString();
  report.endpoints = Object.fromEntries([...metrics].map(([name, item]) => [name, { ...summarize(item.values, item.budgetMs, samples), firstObservedMs: Math.round((cold.get(name) ?? 0) * 100) / 100,
    components: { authP95Ms: percentile(item.auth, 0.95), databaseP95Ms: percentile(item.database, 0.95) } }]));
  report.failures = failures;
  report.cleanup = { createdRequests: createdCount, archivedRequests: archivedCount, remainingTestRequestIds: cleanupFailures, hardDeletes: 0 };
  report.passed = failures.length === 0 && cleanupFailures.length === 0 && metrics.size === 13 && Object.values(report.endpoints).every((value) => value.passed);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await rm(output + '.partial', { force: true });
  for (const [name, result] of Object.entries(report.endpoints)) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${name}: p95=${result.p95Ms ?? 'n/a'} ms, samples=${result.samples}/${samples}, target <${result.budgetMs} ms.`);
  for (const failure of failures) console.error(failure);
  console.log(`Report: ${output}`);
  process.exitCode = report.passed ? 0 : 1;
  process.off('SIGINT', requestStop);
  process.off('SIGTERM', requestStop);
}
