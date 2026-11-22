import { test } from "node:test";
import assert from "node:assert/strict";
import { autopilotCallAllowed } from "./guard";

test("autopilotCallAllowed : secret requis, refus de tout appel passé par le proxy", () => {
  process.env.AUTOPILOT_INTERNAL_TOKEN = "s3cret";
  const req = (h: Record<string, string>) => new Request("http://slh-app:3000/api/internal/autopilot/routers", { headers: h });
  assert.equal(autopilotCallAllowed(req({ authorization: "Bearer s3cret" })), true);
  assert.equal(autopilotCallAllowed(req({ authorization: "Bearer nope" })), false);
  assert.equal(autopilotCallAllowed(req({ authorization: "Bearer s3cret", "x-forwarded-for": "172.19.0.3" })), true, "posé par Next.js lui-même");
  assert.equal(autopilotCallAllowed(req({ authorization: "Bearer s3cret", "x-real-ip": "1.2.3.4" })), false);
  assert.equal(autopilotCallAllowed(req({ authorization: "Bearer s3cret", "x-forwarded-server": "traefik" })), false);
  delete process.env.AUTOPILOT_INTERNAL_TOKEN;
  assert.equal(autopilotCallAllowed(req({ authorization: "Bearer undefined" })), false);
});
