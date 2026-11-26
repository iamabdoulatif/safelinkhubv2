import assert from "node:assert/strict";
import { test } from "node:test";
import {
  androidIntentHref,
  paymentAppHref,
  waveLaunchHref,
  isAndroidCaptiveBrowser,
  isIOSCaptiveBrowser,
  isCaptiveBrowser,
  waveAppHref,
  waveQrHref,
} from "./browser-href";

const IOS_CNA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IOS_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_WV = "Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

test("isCaptiveBrowser : CNA iOS et WebView Android oui, Safari et desktop non", () => {
  assert.equal(isCaptiveBrowser(IOS_CNA), true);
  assert.equal(isCaptiveBrowser(ANDROID_WV), true);
  assert.equal(isCaptiveBrowser(IOS_SAFARI), false);
  assert.equal(isCaptiveBrowser(DESKTOP), false);
  assert.equal(isAndroidCaptiveBrowser(ANDROID_WV), true);
  assert.equal(isAndroidCaptiveBrowser(IOS_CNA), false);
  assert.equal(isIOSCaptiveBrowser(IOS_CNA), true);
  assert.equal(isIOSCaptiveBrowser(IOS_SAFARI), false);
});

test("iOS captif ne lance pas automatiquement le lien Wave depuis le CNA", () => {
  assert.equal(isIOSCaptiveBrowser(IOS_CNA), true);
});

test("waveLaunchHref conserve le lien QR direct au clic, y compris sur iOS captif", () => {
  assert.equal(
    waveLaunchHref("https://pay.wave.com/c/cos-abc?a=700&c=XOF", IOS_CNA, true),
    "https://qr.pay.wave.com/c/cos-abc?a=700&c=XOF",
  );
});

test("waveAppHref : schéma wave://capture pour pay.wave.com seulement", () => {
  const u = "https://pay.wave.com/c/cos-abc?a=1000&c=XOF";
  assert.equal(waveAppHref(u), `wave://capture/${u}`);
  assert.equal(waveAppHref("https://checkout.paystack.com/x"), null);
  assert.equal(waveAppHref("pas une url"), null);
});

test("waveQrHref : même checkout sur qr.pay.wave.com", () => {
  assert.equal(
    waveQrHref("https://pay.wave.com/c/cos-abc?a=1000&c=XOF"),
    "https://qr.pay.wave.com/c/cos-abc?a=1000&c=XOF",
  );
  assert.equal(waveQrHref("https://checkout.paystack.com/x"), null);
});

test("androidIntentHref : enrobe une https en intent:// avec fallback navigateur", () => {
  const https = "https://qr.pay.wave.com/c/cos-abc?a=1000&c=XOF";
  const out = androidIntentHref(https);
  assert.equal(
    out,
    `intent://qr.pay.wave.com/c/cos-abc?a=1000&c=XOF#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(https)};end`,
  );
  // Le package évite que CaptivePortalLogin traite le lien lui-même et
  // affiche l'écran Android « ouvrir une autre application ».
  assert.ok(out!.includes("package=com.android.chrome;"));
  // Le repli navigateur doit être encodé (sinon ses & cassent le lien intent).
  assert.ok(out!.includes("S.browser_fallback_url=https%3A%2F%2F"));
  assert.ok(!out!.includes("scheme=https;S.browser_fallback_url=https://"));
  // Pas https (ou URL invalide) → null, jamais d'intent bancal.
  assert.equal(androidIntentHref("wave://capture/x"), null);
  assert.equal(androidIntentHref("pas une url"), null);
});

test("paymentAppHref : Wave utilise toujours qr.pay.wave.com hors WebView Android", () => {
  assert.equal(
    paymentAppHref(
      "https://pay.wave.com/c/cos-abc?a=1000&c=XOF",
      "Mozilla/5.0 (Linux; Android 14) Chrome/130.0",
      false,
    ),
    "https://qr.pay.wave.com/c/cos-abc?a=1000&c=XOF",
  );
});

test("paymentAppHref : Orange sort de la WebView Android par intent HTTPS", () => {
  const checkout = "https://paiementpro.net/webservice/onlinepayment/processing_v2.php?sessionid=abc";
  assert.match(
    paymentAppHref(checkout, "Mozilla/5.0 (Linux; Android 14; wv) Version/4.0", true) ?? "",
    /^intent:\/\/paiementpro\.net\//,
  );
});
