import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../../app/api/internal/n8n/regulation/routers/[id]/enforce/route";

test("FUP endpoint never executes a top-level dry run, even with execute requested", async () => {
  const before = process.env.N8N_INTERNAL_TOKEN;
  process.env.N8N_INTERNAL_TOKEN = "fup-test-token";
  try {
    for (const flag of ["dryRun", "observationOnly"]) {
      const response = await POST(new Request("https://example.test/enforce", { method: "POST",
        headers: { authorization: "Bearer fup-test-token", "content-type": "application/json" },
        body: JSON.stringify({ [flag]: true, execute: true }),
      }), { params: Promise.resolve({ id: "not-a-database-router" }) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).applied, false);
    }
  } finally { if (before === undefined) delete process.env.N8N_INTERNAL_TOKEN; else process.env.N8N_INTERNAL_TOKEN = before; }
});
