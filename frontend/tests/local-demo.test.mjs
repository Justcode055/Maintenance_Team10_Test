import test from "node:test";
import assert from "node:assert/strict";
import { canUseLocalDemo } from "../lib/local-demo.ts";

test("password-free preview is restricted to development on loopback hosts", () => {
  const originalMode = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(canUseLocalDemo(host), true);
    for (const host of ["maintenanceteam10.vercel.app", "example.ngrok-free.dev", "192.168.1.5", "localhost.example.com"]) assert.equal(canUseLocalDemo(host), false);
    for (const mode of ["production", "test"]) {
      process.env.NODE_ENV = mode;
      assert.equal(canUseLocalDemo("localhost"), false);
      assert.equal(canUseLocalDemo("127.0.0.1"), false);
    }
  } finally {
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
  }
});
