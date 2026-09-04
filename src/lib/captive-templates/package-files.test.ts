import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  autoParameterizePortalFiles,
  renderPackageFile,
  type PackageFile,
} from "./package-files";

const GOLD_LIKE_LOGIN: PackageFile = {
  path: "login.html",
  encoding: "utf8",
  content: `<html><body>
  <div class="brand-title">$(hostname)</div>
  <div class="promo-banner">
    <span class="promo-banner-label">Forfait dès</span>
    <span class="promo-banner-price">100 FCFA</span>
  </div>
  <div class="plans-grid">
    <div class="plan-card"><div class="plan-name">05 Heures</div><div class="plan-price"><span class="currency">F</span>100</div></div>
    <div class="plan-card"><div class="plan-name">01 Jour</div><div class="plan-price"><span class="currency">F</span>200</div></div>
  </div>
  <div class="footer"><a href="tel:+1234567890">Appelez-nous</a></div>
</body></html>`,
};

describe("autoParameterizePortalFiles", () => {
  it("swaps hostname, hardcoded plans, promo price and tel links for placeholders", () => {
    const { files, substitutions } = autoParameterizePortalFiles([GOLD_LIKE_LOGIN]);
    const html = files[0].content;

    assert.ok(html.includes("{{SSID}}"));
    assert.ok(!html.includes("$(hostname)"));
    assert.ok(html.includes("{{PLANS_HTML}}"));
    assert.ok(!html.includes("05 Heures"), "hardcoded plan cards must be gone");
    assert.ok(html.includes("{{MIN_PLAN_PRICE}}"));
    assert.ok(html.includes('href="{{SUPPORT_PHONE_TEL}}"'));
    // The grid wrapper itself must survive (only its contents are replaced).
    assert.ok(html.includes('<div class="plans-grid">'));
    assert.equal(substitutions.length, 4);
  });

  it("leaves non-HTML and binary files untouched", () => {
    const css: PackageFile = { path: "css/style.css", encoding: "utf8", content: ".plan-card{}" };
    const img: PackageFile = { path: "img/x.png", encoding: "base64", content: "aGk=" };
    const { files } = autoParameterizePortalFiles([css, img]);
    assert.deepEqual(files, [css, img]);
  });

  it("does not re-replace files that already carry placeholders", () => {
    const authored: PackageFile = {
      path: "login.html",
      encoding: "utf8",
      content: '<div class="plans-grid">{{PLANS_HTML}}<div class="plan-card"></div></div>',
    };
    const { files } = autoParameterizePortalFiles([authored]);
    assert.equal(files[0].content, authored.content);
  });
});

describe("renderPackageFile", () => {
  it("renders plans, min price and support phone into the placeholders", () => {
    const { files } = autoParameterizePortalFiles([GOLD_LIKE_LOGIN]);
    const body = renderPackageFile(files[0], {
      ssid: "MIRADOR-WIFI",
      supportPhone: "+225 07 08 09 10 11",
      plans: [
        { id: "pkg-3j", name: "3j", priceCents: 500, durationValue: 3, durationUnit: "Days" },
        { id: "pkg-1s", name: "1s", priceCents: 700, durationValue: 1, durationUnit: "Weeks" },
      ],
    }).toString("utf8");

    assert.ok(body.includes("MIRADOR-WIFI"));
    assert.ok(body.includes("03 Jours"));
    assert.ok(body.includes("01 Semaine"));
    assert.ok(body.includes('data-price-cents="500"'));
    assert.ok(body.includes('data-price="500 FCFA"'));
    assert.ok(body.includes("500 FCFA"), "min plan price rendered");
    assert.ok(body.includes('href="tel:+22507080910111"') || body.includes('href="tel:+2250708091011"'));
    assert.ok(!body.includes("{{"), "no unreplaced placeholder left");
  });

  it("renders the Yahya price-card family into {{PRICE_CARDS_HTML}} with a safe onclick arg", () => {
    const file: PackageFile = {
      path: "login.html",
      encoding: "utf8",
      content: '<div class="pricing-section">{{PRICE_CARDS_HTML}}</div>',
    };
    const body = renderPackageFile(file, {
      ssid: "X",
      plans: [
        { id: "pkg-1j", name: "Forfait 1 Jour", priceCents: 200, durationValue: 1, durationUnit: "Days" },
        { id: "pkg-hebdo", name: "L'Hebdo", priceCents: 700, durationValue: 1, durationUnit: "Weeks" },
      ],
    }).toString("utf8");

    assert.equal((body.match(/<div class="price-card">/g) ?? []).length, 2);
    assert.ok(body.includes("<h3>Forfait 01 Jour</h3>"));
    assert.ok(body.includes("<h3>Forfait 01 Semaine</h3>"));
    assert.ok(body.includes('<span class="price-amount">200 F</span>'));
    // a plan name with a single quote must not break the JS string literal
    assert.ok(body.includes("openPhoneModal('L\\'Hebdo')"));
    // every card gets a coloured badge class (base .price-duration-badge has no default background)
    assert.ok(!/price-duration-badge\s*"/.test(body), "each badge carries a colour class");
    assert.ok(!body.includes("{{"), "no unreplaced placeholder left");
  });

  it("injects the universal payment flow into login.html when appUrl is set", () => {
    const login: PackageFile = {
      path: "login.html",
      encoding: "utf8",
      content: '<html><body><button class="plan-btn" data-package-id="pkg-x">Acheter</button></body></html>',
    };
    const body = renderPackageFile(login, {
      ssid: "X",
      appUrl: "https://safelinkhub.io",
      slug: "demo-org",
      routerId: "router-1",
    }).toString("utf8");
    assert.ok(body.includes('window.SLH_PORTAL='), "config injected");
    assert.ok(body.includes('"slug":"demo-org"'), "slug in config");
    assert.ok(body.includes('"mac":"$(mac)"'), "mac placeholder kept for RouterOS");
    assert.ok(body.includes("/api/portal/"), "pay flow injected");
    // injected before </body>
    assert.ok(body.indexOf("SLH_PORTAL") < body.indexOf("</body>"), "injected inside body");
  });

  it("injects the country dial prefix + OTP flow, and emits valid JS", () => {
    const login: PackageFile = {
      path: "login.html",
      encoding: "utf8",
      content: '<html><body><button class="plan-btn" data-package-id="pkg-x">Acheter</button></body></html>',
    };
    const body = renderPackageFile(login, {
      ssid: "X",
      appUrl: "https://safelinkhub.io",
      slug: "demo-org",
      routerId: "router-1",
      countryIso2: "CI",
      dialCode: "+225",
    }).toString("utf8");

    // Country config threaded into SLH_PORTAL for the phone-prefix + OTP.
    assert.ok(body.includes('"dialCode":"+225"'), "dial code in config");
    assert.ok(body.includes('"iso2":"CI"'), "iso2 in config");
    assert.ok(body.includes("🇨🇮"), "computed flag in config");
    // OTP-first flow wired to the new endpoints and steps.
    assert.ok(body.includes("/otp/send"), "otp send endpoint referenced");
    assert.ok(body.includes("/otp/verify"), "otp verify endpoint referenced");
    assert.ok(body.includes('data-step="otp"'), "otp step present");

    // The injected script must parse as valid JS (guards the hand-written
    // template-literal string against stray backticks / ${ / unescaped quotes).
    const scripts = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const flow = scripts.find((s) => s.includes("/otp/send")) ?? "";
    assert.ok(flow.length > 0, "flow script extracted");
    assert.doesNotThrow(() => new Function(flow), "injected script is syntactically valid");
  });

  it("ramène en HTTP un formulaire de connexion que RouterOS a rendu en HTTPS", () => {
    // $(link-login-only) sort en https:// dès que le profil hotspot porte un
    // certificat : le mini-navigateur Android refuse alors la page (certificat
    // du routeur, pas du domaine du portail). Le script doit le corriger — et
    // ne toucher QUE l'hôte de la page, jamais safelinkhub.io.
    const login: PackageFile = {
      path: "login.html",
      encoding: "utf8",
      content: '<html><body><form action="https://yahya.ci/login"></form></body></html>',
    };
    const body = renderPackageFile(login, {
      ssid: "X",
      appUrl: "https://safelinkhub.io",
      slug: "demo-org",
      routerId: "router-1",
    }).toString("utf8");
    const scripts = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const flow = scripts.find((s) => s.includes("loginEnClair")) ?? "";
    assert.ok(flow.length > 0, "correctif injecté");
    assert.ok(flow.includes("location.host.toLowerCase()"), "limité à l'hôte de la page");
    assert.ok(
      flow.includes('addEventListener("submit", loginEnClair, true)'),
      "rejoué avant chaque envoi",
    );
    assert.doesNotThrow(() => new Function(flow), "script toujours syntaxiquement valide");
  });

  it("saute l'étape du code quand la passerelle SMS est décochée", () => {
    // /plans porte déjà l'état de la passerelle : la page n'a donc pas à
    // demander au serveur, au moment du clic, s'il pourra envoyer un SMS.
    const login: PackageFile = {
      path: "login.html",
      encoding: "utf8",
      content: '<html><body><button data-package-id="pkg-x">Acheter</button></body></html>',
    };
    const body = renderPackageFile(login, {
      ssid: "X",
      appUrl: "https://safelinkhub.io",
      slug: "demo-org",
      routerId: "router-1",
    }).toString("utf8");
    const scripts = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const flow = scripts.find((s) => s.includes("SMS_ON")) ?? "";
    assert.ok(flow.length > 0, "drapeau SMS injecté");
    // Vrai par défaut : sans réponse du serveur, on garde le parcours avec code.
    assert.ok(flow.includes("var SMS_ON = true;"), "prudent tant qu'on ne sait pas");
    assert.ok(flow.includes("d.smsEnabled === false"), "mis à jour par /plans");
    assert.ok(flow.includes("if(!SMS_ON){"), "l'étape du code est sautée");
    assert.doesNotThrow(() => new Function(flow), "script toujours syntaxiquement valide");
  });

  it("distingue un WiFi qui bloque d'une requête refusée (sonde image)", () => {
    // « Failed to fetch » recouvre deux causes opposées. Une image ne passe
    // pas par CORS : si elle arrive alors que le fetch a échoué, accuser le
    // walled-garden envoie chercher pendant des jours au mauvais endroit.
    const login: PackageFile = {
      path: "login.html",
      encoding: "utf8",
      content: '<html><body><button data-package-id="pkg-x">Acheter</button></body></html>',
    };
    const body = renderPackageFile(login, {
      ssid: "X",
      appUrl: "https://safelinkhub.io",
      slug: "demo-org",
      routerId: "router-1",
    }).toString("utf8");
    const scripts = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const flow = scripts.find((s) => s.includes("probeApp")) ?? "";
    assert.ok(flow.length > 0, "sonde injectée");
    assert.ok(flow.includes("/payment/visa.svg?sonde="), "aller-retour réel, hors cache");
    assert.ok(flow.includes("SONDE-OK"), "verdict lisible sur une photo d'écran");
    assert.doesNotThrow(() => new Function(flow), "script toujours syntaxiquement valide");
  });

  it("injects inline-plan rendering that fills an imported portal's #forfaits container", () => {
    // Portail importé façon Safelink_baraka : conteneur #forfaits + forfaits
    // codés en dur. Le script injecté doit contenir de quoi le remplir avec les
    // vrais forfaits du SaaS (renderInlinePlans + SLH_PLANS), et rester du JS valide.
    const login: PackageFile = {
      path: "login.html",
      encoding: "utf8",
      content:
        '<html><body><div id="forfaits" class="forfaits"></div><script>var PORTAL_CONFIG={forfaits:[{label:"01-JOUR",price:"200 Fcfa"}]};</script></body></html>',
    };
    const body = renderPackageFile(login, {
      ssid: "ABDOULATIF-WIFI",
      appUrl: "https://safelinkhub.io",
      slug: "demo-org",
      routerId: "router-1",
      plans: [
        { id: "pkg-1j", name: "1j", priceCents: 200, durationValue: 1, durationUnit: "Days" },
        { id: "pkg-1s", name: "1s", priceCents: 1000, durationValue: 1, durationUnit: "Weeks" },
      ],
    }).toString("utf8");

    // Les vrais forfaits du SaaS sont injectés (SLH_PLANS) avec leurs prix.
    assert.ok(body.includes('window.SLH_PLANS='), "SLH_PLANS injected");
    assert.ok(body.includes('"priceLabel":"200 FCFA"'), "live price in SLH_PLANS");
    // Le script sait cibler le conteneur du portail et poser des cartes achetables.
    assert.ok(body.includes("renderInlinePlans"), "inline-plan renderer injected");
    assert.ok(body.includes('getElementById("forfaits")'), "targets #forfaits container");
    assert.ok(body.includes("data-package-id"), "cards carry the purchase hook");
    // Prix LIVE : le portail fetch l'endpoint /plans au chargement (toujours à jour).
    assert.ok(body.includes("fetchLivePlans"), "live-plans fetcher injected");
    assert.ok(body.includes('/plans'), "live /plans endpoint referenced");

    // Le script injecté reste du JS syntaxiquement valide.
    const scripts = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const flow = scripts.find((s) => s.includes("renderInlinePlans")) ?? "";
    assert.ok(flow.length > 0, "flow script extracted");
    assert.doesNotThrow(() => new Function(flow), "injected script is syntactically valid");
  });

  it("renders a payDisabled plan as visible-but-inert (no data-package-id)", () => {
    const file: PackageFile = {
      path: "login.html",
      encoding: "utf8",
      content: '<div class="plans-grid">{{PLANS_HTML}}</div>',
    };
    const body = renderPackageFile(file, {
      ssid: "X",
      plans: [
        { id: "pkg-100", name: "06-HEURES", priceCents: 100, durationValue: 6, durationUnit: "Hours", payDisabled: true },
        { id: "pkg-300", name: "01-JOUR", priceCents: 300, durationValue: 1, durationUnit: "Days" },
      ],
    }).toString("utf8");

    // Le forfait payable porte le hook d'achat ; le désactivé NON.
    assert.ok(body.includes('data-package-id="pkg-300"'), "payable plan is buyable");
    assert.ok(!body.includes('data-package-id="pkg-100"'), "disabled plan has no purchase hook");
    // Mais il reste AFFICHÉ avec son prix.
    assert.ok(body.includes("100 FCFA"), "disabled plan still shown");
    assert.ok(body.includes("Auprès d'un vendeur") || body.includes("Aupr&#233;s"), "disabled plan labelled");
  });

  it("does not inject the payment flow without appUrl, nor into non-login files", () => {
    const login: PackageFile = {
      path: "login.html",
      encoding: "utf8",
      content: "<html><body>x</body></html>",
    };
    const noAppUrl = renderPackageFile(login, { ssid: "X" }).toString("utf8");
    assert.ok(!noAppUrl.includes("SLH_PORTAL"), "no injection without appUrl");

    const status: PackageFile = {
      path: "status.html",
      encoding: "utf8",
      content: "<html><body>status</body></html>",
    };
    const statusBody = renderPackageFile(status, {
      ssid: "X",
      appUrl: "https://safelinkhub.io",
      slug: "demo-org",
    }).toString("utf8");
    assert.ok(!statusBody.includes("SLH_PORTAL"), "only login.html gets the flow");
  });
});

