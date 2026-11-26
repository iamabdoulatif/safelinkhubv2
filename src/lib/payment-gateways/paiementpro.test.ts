import assert from "node:assert/strict";
import { test } from "node:test";
import {
  paiementProChannel,
  paiementProSession,
  usesProcessingShortcut,
  resolveOrangeDestination,
} from "./paiementpro";

function fakeFetch(hops: string[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const idx = hops.indexOf(String(input));
    const loc = idx >= 0 ? hops[idx + 1] : undefined;
    return {
      status: loc ? 302 : 200,
      headers: { get: (h: string) => (h.toLowerCase() === "location" ? (loc ?? null) : null) },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

test("paiementProChannel : canaux CI, rien ailleurs", () => {
  assert.equal(paiementProChannel("orange_money", "CI"), "OMCIV2");
  assert.equal(paiementProChannel("mtn_money", "CI"), "MOMOCI");
  assert.equal(paiementProChannel("moov_money", "CI"), "FLOOZ");
  assert.equal(paiementProChannel("wave", "CI"), null);
  assert.equal(paiementProChannel("orange_money", "SN"), null);
});

test("paiementProSession : sessionid des seules URL paiementpro.net", () => {
  assert.equal(
    paiementProSession("https://www.paiementpro.net/webservice/onlinepayment/processing_v2.php?sessionid=abc"),
    "abc",
  );
  assert.equal(paiementProSession("https://evil.example/?sessionid=abc"), null);
});

test("usesProcessingShortcut : Orange seulement (MTN/Moov cassent in-page)", () => {
  assert.equal(usesProcessingShortcut("orange_money"), true);
  assert.equal(usesProcessingShortcut("mtn_money"), false);
  assert.equal(usesProcessingShortcut("moov_money"), false);
});

test("resolveOrangeDestination : suit la redirection jusqu'à Orange, hors paiementpro.net", async () => {
  const hops = [
    "https://www.paiementpro.net/webservice/onlinepayment/processing_v2.php?sessionid=abc",
    "https://www.paiementpro.net/webservice/onlinepayment/redirect.php?x=1",
    "https://webpayment.orange-money.com/pay/abc",
  ];
  assert.equal(await resolveOrangeDestination(hops[0], fakeFetch(hops)), hops[2]);
});

test("resolveOrangeDestination : garde processing_v2 si pas de sortie de paiementpro.net", async () => {
  const url = "https://www.paiementpro.net/webservice/onlinepayment/processing_v2.php?sessionid=z";
  assert.equal(await resolveOrangeDestination(url, fakeFetch([url])), url);
});
