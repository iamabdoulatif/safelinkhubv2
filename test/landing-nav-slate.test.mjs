import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/* Ce fichier gardait auparavant le « cadre scanner » animé de la nav Bitume.
 * Cette animation a été supprimée sur demande avec toutes les autres de la
 * partie publique ; le test garde désormais l'intention inverse. */

test("la navigation publique ne réintroduit aucune animation", async () => {
  const [nav, styles] = await Promise.all([
    read("src/components/landing/LandingNav.tsx"),
    read("src/app/globals.css"),
  ]);

  for (const dead of ["nav-scanner-link", "nav-mobile-panel", "nav-mobile-item"]) {
    assert.doesNotMatch(nav, new RegExp(`className[^\\n]*${dead}`), `${dead} ne doit pas revenir dans la nav`);
    assert.doesNotMatch(
      styles,
      new RegExp(`^\\.${dead}\\s*\\{`, "m"),
      `la règle .${dead} a été retirée avec l'animation`,
    );
  }

  // Le filet mouvement réduit reste en place pour le RESTE de l'application
  // (l'admin conserve ses transitions).
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("les classes .slate-* ne déclarent ni fond ni mise en page", async () => {
  // Régression vécue deux fois : une règle `.theme-slate .slate-card {…}` a une
  // spécificité de (0,2,0) et bat les utilitaires Tailwind (0,1,0).
  //   · `background` dans .slate-card → la carte mise en avant de la landing
  //     ressortait blanche malgré `bg-brand` ;
  //   · `display:inline-flex` dans .slate-btn → `hidden` était sans effet, et
  //     le bouton « Connexion » restait visible en mobile.
  // Ces propriétés doivent rester dans le balisage, jamais dans la classe.
  const styles = await read("src/app/globals.css");

  const bloc = (selecteur) => {
    const i = styles.indexOf(selecteur + " {");
    assert.ok(i > 0, `${selecteur} doit exister`);
    return styles.slice(i, styles.indexOf("}", i));
  };

  const card = bloc(".theme-slate .slate-card");
  assert.doesNotMatch(card, /(^|\s)background(-color)?\s*:/, ".slate-card ne doit pas imposer de fond");

  const btn = bloc(".theme-slate .slate-btn");
  for (const prop of ["display", "align-items", "justify-content", "gap"]) {
    assert.doesNotMatch(btn, new RegExp(`(^|\\s)${prop}\\s*:`), `.slate-btn ne doit pas imposer ${prop}`);
  }
});

test("tout le site public partage la même peau Slate", async () => {
  // La peau ne s'applique que sous un wrapper portant `theme-slate` : une page
  // publique qui l'oublie repart en Bitume sans que rien ne le signale.
  // `/` et `/en` ne portent plus la classe directement : leur composition est
  // partagée dans LandingPage, qui la porte pour les deux. C'est LUI qu'il faut
  // vérifier — l'assertion resterait vraie sur les pages sans rien garantir.
  const pages = [
    "src/components/landing/LandingPage.tsx",
    "src/app/blog/page.tsx",
    "src/app/blog/[slug]/page.tsx",
    "src/app/contact/page.tsx",
    "src/app/boutique/page.tsx",
    "src/components/auth/AuthShell.tsx",
  ];
  for (const page of pages) {
    assert.match(await read(page), /theme-slate/, `${page} doit porter la peau Slate`);
  }

  // Et les deux routes de la landing passent bien par cette composition —
  // sinon l'une d'elles pourrait perdre la peau sans que le test le voie.
  for (const route of ["src/app/page.tsx", "src/app/en/page.tsx"]) {
    assert.match(await read(route), /<LandingPage\b/, `${route} doit rendre LandingPage`);
  }
});

test("les formulaires d'authentification partagent leurs classes", async () => {
  // Les mêmes chaînes étaient recopiées dans six fichiers : au changement de
  // charte il fallait les modifier six fois, et rien n'empêchait d'en oublier.
  const forms = [
    "src/app/auth/login/LoginForm.tsx",
    "src/app/auth/register/RegisterForm.tsx",
    "src/app/auth/mot-de-passe-oublie/ForgotPasswordForm.tsx",
    "src/app/auth/reinitialiser/ResetPasswordForm.tsx",
    "src/app/auth/activation/ActivateForm.tsx",
    "src/components/auth/ResendActivationForm.tsx",
  ];
  for (const form of forms) {
    const src = await read(form);
    assert.match(src, /from "@\/components\/auth\/form-classes"/, `${form} doit importer les classes partagées`);
    assert.doesNotMatch(
      src,
      /^const (fieldClass|buttonClass|labelClass|inputClass) =/m,
      `${form} ne doit pas redéfinir localement une classe partagée`,
    );
  }
});
