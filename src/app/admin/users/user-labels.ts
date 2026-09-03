/**
 * Ce qu'on AFFICHE d'un utilisateur, une fois retiré ce qui se répète.
 *
 * Une information vraie pour tout le monde n'informe personne : « Admin » sur
 * 38 lignes sur 40, « Organisation de Latif Bamba » en face de Latif Bamba,
 * « Par défaut » sur la moitié du registre. Chacune de ces trois mentions
 * occupait de la place et coûtait une lecture, sans jamais rien apprendre.
 */
import type { UserControlRow } from "./users-control-center";

/** Aplatit accents et casse pour comparer deux noms écrits à la main. */
function plat(valeur: string) {
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

/**
 * Nom d'organisation utile, ou chaîne vide.
 *
 * À l'inscription, l'organisation est créée sous « Organisation de <nom> » :
 * la colonne répétait donc mot pour mot le nom déjà lu à gauche, tronqué en
 * plus (« Organisation de ZIE ADAMA… »). On retire le préfixe, et si ce qui
 * reste EST la personne, on n'affiche rien.
 */
export function orgDisplayName(orgName: string, personName: string): string {
  const sansPrefixe = orgName.replace(/^organisation\s+de\s+/i, "").trim();
  if (!sansPrefixe) return "";
  return plat(sansPrefixe) === plat(personName) ? "" : sansPrefixe;
}

/**
 * État de l'accès en UN mot. Le libellé complet portait la date
 * (« Gratuit jusqu'au 01 oct. 2026 ») : dans une pastille, il passait à la
 * ligne et disait deux fois ce que l'échéance relative dit mieux juste à côté.
 * La date exacte reste dans le tiroir.
 */
export function quotaShortLabel(category: UserControlRow["quotaCategory"]): string {
  if (category === "unlimited") return "Illimité";
  if (category === "paid") return "VPN payant";
  if (category === "free") return "Gratuit";
  // « Par défaut » = aucun accès accordé. L'absence se lit très bien en
  // n'écrivant rien ; l'écrire aurait rempli la moitié des lignes.
  return "";
}

/** N'affiche un rôle que lorsqu'il SORT de l'ordinaire. */
export function roleBadge(role: string): string {
  return role === "superadmin" ? "Superadmin" : "";
}
