import { spawn } from "node:child_process";

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probe() {
  const port = 3008;
  console.log(`Starting Next.js server on port ${port}...`);

  const server = spawn("node", ["./node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: "backend",
    shell: false,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      TEAM10_PARTNER_KEY: "test-partner-key-team10",
      TEAM12_WEBHOOK_SECRET: "test-webhook-secret-team12",
    },
    stdio: "pipe",
  });

  server.stdout.on("data", (d) => {
    const text = d.toString();
    if (text.includes("Ready") || text.includes("Local:") || text.includes("started server on")) {
      console.log(`[Next.js stdout] ${text.trim()}`);
    }
  });

  server.stderr.on("data", (d) => {
    // console.error(`[Next.js stderr] ${d.toString().trim()}`);
  });

  let ready = false;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 40; i++) {
    await wait(1000);
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      process.stdout.write(".");
    }
  }

  if (!ready) {
    server.kill();
    throw new Error("Server failed to become ready in 40 seconds");
  }

  console.log("\n\n=== Server is READY! Running Live Route Probes ===\n");
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name} ->`, err.message);
      failed++;
    }
  }

  try {
    // TEST 1: Health check rejects missing key with 401
    await test("GET /api/partner/health rejects missing key with 401", async () => {
      const res = await fetch(`${baseUrl}/partner/health`);
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      const body = await res.json();
      if (body.error?.code !== "INVALID_PARTNER_KEY") throw new Error(`Unexpected body: ${JSON.stringify(body)}`);
    });

    // TEST 2: Health check succeeds with valid X-Partner-Key
    await test("GET /api/partner/health returns 200 with valid X-Partner-Key", async () => {
      const res = await fetch(`${baseUrl}/partner/health`, {
        headers: { "X-Partner-Key": "test-partner-key-team10" },
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (body.status !== "ok") throw new Error(`Expected status: ok, got: ${JSON.stringify(body)}`);
    });

    // TEST 3: POST /api/partner/work-orders rejects invalid key with 401
    await test("POST /api/partner/work-orders rejects invalid key with 401", async () => {
      const res = await fetch(`${baseUrl}/partner/work-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Partner-Key": "wrong-key-value",
        },
        body: JSON.stringify({ title: "Test Title" }),
      });
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      const body = await res.json();
      if (body.error?.code !== "INVALID_PARTNER_KEY") throw new Error(`Unexpected error code: ${body.error?.code}`);
    });

    // TEST 4: POST /api/partner/work-orders validates schema (missing required title/description)
    await test("POST /api/partner/work-orders returns 400 for missing title/description", async () => {
      const res = await fetch(`${baseUrl}/partner/work-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Partner-Key": "test-partner-key-team10",
        },
        body: JSON.stringify({ category: "Electrical" }),
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      const body = await res.json();
      if (body.error?.code !== "VALIDATION_ERROR") throw new Error(`Expected VALIDATION_ERROR, got ${JSON.stringify(body)}`);
    });

    // TEST 5: GET /api/partner/work-orders validates query parameters
    await test("GET /api/partner/work-orders returns 400 when missing query parameters", async () => {
      const res = await fetch(`${baseUrl}/partner/work-orders`, {
        headers: { "X-Partner-Key": "test-partner-key-team10" },
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      const body = await res.json();
      if (body.error?.code !== "MISSING_QUERY_PARAM") throw new Error(`Expected MISSING_QUERY_PARAM, got ${JSON.stringify(body)}`);
    });

    // TEST 6: PATCH /api/partner/work-orders returns 400 when missing target ID
    await test("PATCH /api/partner/work-orders returns 400 when missing activity_id or work_order_id", async () => {
      const res = await fetch(`${baseUrl}/partner/work-orders`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Partner-Key": "test-partner-key-team10",
        },
        body: JSON.stringify({ location: "Studio 305" }),
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      const body = await res.json();
      if (body.error?.code !== "VALIDATION_ERROR") throw new Error(`Expected VALIDATION_ERROR, got ${JSON.stringify(body)}`);
    });

    // TEST 7: DELETE /api/partner/work-orders returns 400 when missing target query params
    await test("DELETE /api/partner/work-orders returns 400 when missing target query params", async () => {
      const res = await fetch(`${baseUrl}/partner/work-orders`, {
        method: "DELETE",
        headers: { "X-Partner-Key": "test-partner-key-team10" },
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      const body = await res.json();
      if (body.error?.code !== "MISSING_QUERY_PARAM") throw new Error(`Expected MISSING_QUERY_PARAM, got ${JSON.stringify(body)}`);
    });

  } finally {
    console.log("\nShutting down server on port " + port + "...");
    server.kill();
    // On Windows, child_process.spawn shell creates process hierarchy
    try {
      spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"]);
    } catch {}
  }

  console.log(`\n========================================`);
  console.log(`LIVE SERVER TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);
  if (failed > 0) process.exit(1);
}

probe().catch((err) => {
  console.error("Fatal probe runner error:", err);
  process.exit(1);
});
