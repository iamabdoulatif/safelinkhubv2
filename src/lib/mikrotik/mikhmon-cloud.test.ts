import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { provisionCloudMikhmon } from "./mikhmon-cloud";

describe("MikHmon cloud provisioning", () => {
  it("provisionne une instance cloud pour un RB951 sans toucher RouterOS", async () => {
    const commands: string[] = [];

    const instance = await provisionCloudMikhmon({
      router: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "RB951 Korhogo",
        tunnelIp: "10.66.0.23",
        username: "api",
        password: "secret",
        hotspotName: "KORHOGO-WIFI",
        dnsName: "korhogo.ci",
      },
      existing: null,
      usedPorts: [],
      baseDomain: "mikhmon.safelinkhub.io",
      run: async (command) => {
        commands.push(command);
        return "";
      },
    });

    assert.equal(instance.domain, "rb951-korhogo-14174000.mikhmon.safelinkhub.io");
    assert.equal(instance.localPort, 20_000);
    assert.ok(commands.some((command) => command.includes("docker run -d")));
    assert.ok(
      commands.every(
        (command) => !command.includes("/ip/firewall") && !command.includes("/container/"),
      ),
    );
  });

  it("reste idempotent lorsqu'une instance cloud active existe", async () => {
    const commands: string[] = [];

    const instance = await provisionCloudMikhmon({
      router: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "RB951 Korhogo",
        tunnelIp: "10.66.0.23",
        username: "api",
        password: "secret",
        hotspotName: "KORHOGO-WIFI",
        dnsName: "korhogo.ci",
      },
      existing: {
        domain: "rb951-korhogo-14174000.mikhmon.safelinkhub.io",
        containerName: "slh-mikhmon-123e4567e89b12d3a456426614174000",
        localPort: 20_000,
        status: "active",
      },
      usedPorts: [20_000],
      baseDomain: "mikhmon.safelinkhub.io",
      run: async (command) => {
        commands.push(command);
        return "";
      },
    });

    assert.equal(instance.localPort, 20_000);
    assert.deepEqual(commands, []);
  });
});
