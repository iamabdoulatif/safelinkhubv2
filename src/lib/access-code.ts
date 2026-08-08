import { randomInt } from "node:crypto";

/**
 * Génération des codes d'accès WiFi (tickets portail, lots de vouchers, codes
 * de roaming, identifiants d'agent).
 *
 * POURQUOI `crypto` ET PAS `Math.random()` : ce code est à la fois l'identifiant
 * ET le mot de passe du compte hotspot créé sur le routeur
 * (`/ip/hotspot/user/add =name=<code> =password=<code>`). C'est donc un secret
 * vendu au client, pas un identifiant décoratif. `Math.random()` de V8
 * (xorshift128+) n'est pas cryptographique : observer une suite de sorties d'un
 * même processus permet d'en reconstituer l'état interne, et donc de prédire
 * les tirages voisins. Le conteneur applicatif étant un processus qui vit des
 * jours, un acheteur pouvait en principe dériver les codes délivrés à d'autres
 * clients payants. `randomInt` tire d'une source cryptographique et applique un
 * échantillonnage par rejet — pas de biais de modulo sur un alphabet de 36.
 *
 * L'ALPHABET ET LA LONGUEUR NE CHANGENT PAS : minuscules + chiffres, 6
 * caractères. Ce sont les contraintes des identifiants hotspot RouterOS, et les
 * codes déjà vendus doivent rester valides. Seule la SOURCE d'aléa change.
 *
 * Ce module remplace quatre implémentations identiques qui vivaient dans
 * portal/fulfill.ts, vouchers/actions.ts, roaming/actions.ts et agents/actions.ts
 * — la duplication est précisément ce qui avait laissé passer le défaut.
 */
export const ACCESS_CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

export const ACCESS_CODE_DEFAULT_LENGTH = 6;

export function randomAccessCode(length = ACCESS_CODE_DEFAULT_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ACCESS_CODE_CHARS[randomInt(0, ACCESS_CODE_CHARS.length)];
  }
  return code;
}
