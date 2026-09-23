/**
 * Photo produit d'un MikroTik d'après son board-name RouterOS, pour les
 * écrans qui montrent un routeur (liste du parc, sauvegardes, restauration).
 * Les photos vivent dans public/mikrotik ; null ⇒ l'appelant affiche une
 * silhouette générique.
 */
export function deviceImage(model: string | null | undefined): string | null {
  // board-name RouterOS : « L009UiGS-2HaxD », « RB4011iGS+5HacQ2HnD », « hAP ax lite »
  // (L41G-2axD), « hAP ax lite LTE6 » (L41G-2axD&FG621-EA), « hAP ax^2 » (C52iG…),
  // « hAP ax^3 » (C53UiG…). L'ordre compte : LTE6 avant ax lite, ax lite avant ax².
  const m = (model ?? "").toLowerCase();
  if (m.includes("l009")) return "/mikrotik/l009.webp";
  if (m.includes("4011")) return "/mikrotik/rb4011.webp";
  if (m.includes("5009")) return "/mikrotik/rb5009.webp";
  if (/rb260|css106/.test(m)) return "/mikrotik/rb260gs.webp";
  if (/l41g|ax[ -]?lite/.test(m)) return /lte6|fg621/.test(m) ? "/mikrotik/hap-ax-lite-lte6.webp" : "/mikrotik/hap-ax-lite.webp";
  if (/be[ -]?lite/.test(m)) return "/mikrotik/hap-be-lite.webp";
  if (/be\^?3|be3/.test(m)) return "/mikrotik/hap-be3-media.webp";
  if (/c52|ax\^?2\b/.test(m)) return "/mikrotik/hap-ax2.webp";
  if (/c53|ax\^?3\b/.test(m)) return "/mikrotik/hap-ax3.webp";
  if (m.includes("chateau") || m.includes("chato")) return "/mikrotik/chato.webp";
  return null;
}

