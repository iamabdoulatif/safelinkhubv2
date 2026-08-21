import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRelayNginxConfig } from "./relay-nginx";

describe("relay nginx cloud MikHmon hosts", () => {
  it("sert une instance cloud active avec son sous-domaine HTTPS et un upstream loopback", () => {
    const config = buildRelayNginxConfig({
      webForwards: [],
      cloudInstances: [
        {
          domain: "rb951-korhogo-14174000.mikhmon.safelinkhub.io",
          localPort: 20_000,
          status: "active",
        },
      ],
    });

    assert.match(
      config,
      /listen 443 ssl;[\s\S]*server_name rb951-korhogo-14174000\.mikhmon\.safelinkhub\.io;[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:20000;/,
    );
  });

  it("ignore les instances arrêtées et refuse un domaine dangereux", () => {
    const config = buildRelayNginxConfig({
      webForwards: [],
      cloudInstances: [{ domain: "stopped.mikhmon.safelinkhub.io", localPort: 20_001, status: "stopped" }],
    });
    assert.doesNotMatch(config, /stopped\.mikhmon/);
    assert.throws(() =>
      buildRelayNginxConfig({
        webForwards: [],
        cloudInstances: [{ domain: "../../etc", localPort: 20_000, status: "active" }],
      }),
    );
  });
});
