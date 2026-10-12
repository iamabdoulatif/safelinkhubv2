import assert from "node:assert/strict";
import { test } from "node:test";
import { browserHref, isCaptiveBrowser, waveAppHref } from "./browser-href";

const URL_ = "https://safelinkhub.io/portal/pay?orderId=abc&slug=yahya";
const IOS_CNA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IOS_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_WV = "Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

test("browserHref : iOS passe par x-safari-https", () => {
  assert.equal(browserHref(URL_, IOS_CNA), "x-safari-https://safelinkhub.io/portal/pay?orderId=abc&slug=yahya");
});

test("browserHref : Android passe par intent:// en gardant la query", () => {
  assert.equal(
    browserHref(URL_, ANDROID_WV),
    "intent://safelinkhub.io/portal/pay?orderId=abc&slug=yahya#Intent;scheme=https;end",
  );
});

test("browserHref : navigateur classique = URL inchangée", () => {
  assert.equal(browserHref(URL_, DESKTOP), URL_);
});

test("isCaptiveBrowser : CNA iOS et WebView Android oui, Safari et desktop non", () => {
  assert.equal(isCaptiveBrowser(IOS_CNA), true);
  assert.equal(isCaptiveBrowser(ANDROID_WV), true);
  assert.equal(isCaptiveBrowser(IOS_SAFARI), false);
  assert.equal(isCaptiveBrowser(DESKTOP), false);
});

test("waveAppHref : schéma wave://capture pour pay.wave.com seulement", () => {
  const u = "https://pay.wave.com/c/cos-abc?a=1000&c=XOF";
  assert.equal(waveAppHref(u), `wave://capture/${u}`);
  assert.equal(waveAppHref("https://checkout.paystack.com/x"), null);
  assert.equal(waveAppHref("pas une url"), null);
});
