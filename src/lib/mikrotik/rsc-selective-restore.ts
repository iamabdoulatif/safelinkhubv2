/**
 * Transfert SÉLECTIF d'une sauvegarde RouterOS vers un autre routeur.
 *
 * POURQUOI NE PAS TOUT RESTAURER. Le nouveau routeur est déjà configuré par
 * SafeLinkHub : son tunnel WireGuard, ses clés, son bridge, son adressage, son
 * portail captif et son pare-feu lui appartiennent. Reposer la configuration
 * complète de l'ancien écraserait tout cela — au mieux le routeur sort du parc,
 * au pire il prend l'adresse de tunnel d'un autre et deux équipements se
 * disputent la même place.
 *
 * Et l'ancien routeur n'a pas la même architecture : une sauvegarde de RB951
 * (mipsbe) porte `/interface wireless`, que les cartes ARM n'ont pas, et un
 * bridge DOCKERS qui n'a rien à faire là.
 *
 * CE QUI SE TRANSFÈRE — et seulement cela :
 *   - les profils hotspot, avec leur `on-login` VERBATIM : c'est lui qui écrit
 *     la date d'expiration dans le commentaire du ticket ET la ligne de recette
 *     que MikHmon lit (`:put (",remc,100,5h,100,,Enable,")` = prix 100, durée
 *     5h). Le réécrire casserait l'expiration ou les rapports ;
 *   - les tickets, avec leur commentaire d'expiration ;
 *   - les schedulers de balayage, un par profil, qui suppriment les tickets
 *     échus ;
 *   - le pool d'adresses, RÉÉCRIT sur le sous-réseau du nouveau routeur ;
 *   - l'historique de recettes, que MikHmon range dans `/system script` sous
 *     `comment=mikhmon` — sans lui, le revenu journalier et mensuel repart de
 *     zéro sur le nouvel équipement.
 *
 * Tout le reste est écarté. La liste des sections retenues est donc une
 * ALLOWLIST : une section inconnue d'une version future de RouterOS ne se
 * glissera pas dans le transfert par défaut.
 */

/** Une commande RouterOS, sa section et ses arguments, ligne recollée. */
export type CommandeRsc = {
  /** Chemin du menu, ex. « /ip hotspot user profile ». */
  section: string;
  /** Verbe, ex. « add » ou « set ». */
  verbe: string;
  /** Le reste de la ligne, continuations recollées. */
  arguments: string;
};

/**
 * Les sections transférées. Rien d'autre ne passe.
 *
 * L'ordre compte à l'import : un profil référence un pool, un ticket
 * référence un profil. RouterOS refuse une référence vers ce qui n'existe pas
 * encore.
 */
export const SECTIONS_TRANSFEREES = [
  "/ip pool",
  "/ip hotspot user profile",
  "/ip hotspot user",
  "/system scheduler",
  "/system script",
] as const;

/**
 * Recolle les continuations de ligne d'un export RouterOS.
 *
 * RouterOS coupe ses lignes à 78 colonnes avec une barre oblique inverse en
 * fin de ligne, et — c'est le piège — remplace parfois l'espace de coupure par
 * `\_` sur la ligne suivante. Un découpage naïf sur les retours à la ligne
 * casserait au milieu d'un `on-login`, et le script transféré serait tronqué
 * sans que rien ne le signale avant le premier ticket qui n'expire pas.
 */
export function recollerLignes(rsc: string): string[] {
  const lignes: string[] = [];
  let courante = "";
  for (const brute of rsc.split(/\r?\n/)) {
    if (brute.startsWith("#")) continue; // en-tête d'export
    const suite = courante.length > 0;
    // `\_` en tête de continuation = une espace mangée par la coupure.
    const morceau = suite ? brute.replace(/^\s*\\_/, " ").replace(/^\s+/, "") : brute;
    if (morceau.endsWith("\\")) {
      courante += morceau.slice(0, -1);
      continue;
    }
    courante += morceau;
    if (courante.trim()) lignes.push(courante.trim());
    courante = "";
  }
  if (courante.trim()) lignes.push(courante.trim());
  return lignes;
}

/** Découpe un export en commandes, chacune rattachée à sa section. */
export function analyserRsc(rsc: string): CommandeRsc[] {
  const commandes: CommandeRsc[] = [];
  let section = "";
  for (const ligne of recollerLignes(rsc)) {
    if (ligne.startsWith("/")) {
      section = ligne;
      continue;
    }
    const m = ligne.match(/^(add|set|remove)\s+([\s\S]*)$/);
    if (m && section) {
      commandes.push({ section, verbe: m[1], arguments: m[2] });
    }
  }
  return commandes;
}

/** Valeur d'un argument `clé=valeur`, guillemets compris. */
export function lireArgument(args: string, cle: string): string | null {
  const m = args.match(new RegExp(`(?:^|\\s)${cle}=("([^"]*)"|\\S+)`));
  if (!m) return null;
  return m[2] ?? m[1];
}

/** Remplace un argument, ou l'ajoute s'il manque. */
export function ecrireArgument(args: string, cle: string, valeur: string): string {
  const echappe = /[\s"]/.test(valeur) ? `"${valeur.replace(/"/g, '\\"')}"` : valeur;
  const motif = new RegExp(`((?:^|\\s))${cle}=("[^"]*"|\\S+)`);
  return motif.test(args)
    ? args.replace(motif, `$1${cle}=${echappe}`)
    : `${args} ${cle}=${echappe}`;
}

export type CibleRouteur = {
  /** Nom du pool sur le NOUVEAU routeur. */
  poolName: string;
  /** Plage d'adresses du nouveau routeur, ex. « 10.5.50.10-10.5.53.254 ». */
  poolRanges: string;
  /** Nom du serveur hotspot sur le nouveau routeur. */
  hotspotServer: string;
  /**
   * Bridge que ce serveur hotspot dessert sur le nouveau routeur.
   *
   * ON NE RECOPIE PAS LE BRIDGE DE L'ANCIEN. Il porte son nom, ses ports
   * (ether2..5, wlan1 sur un RB951) et son adressage — des ports qui n'existent
   * pas forcément sur la carte d'accueil, et un bridge que son auto-setup a
   * déjà créé. En ajouter un second laisserait le hotspot desservir le mauvais,
   * et les clients n'obtiendraient plus d'adresse.
   *
   * Le bridge d'accueil est donc LU et ANNONCÉ : l'exploitant voit où les
   * tickets vont atterrir, sans qu'on touche à son réseau.
   */
  hotspotBridge: string;
};

export type PlanTransfert = {
  /** Les commandes retenues, dans l'ordre d'import. */
  commandes: CommandeRsc[];
  /** Compte par section, pour l'écran de confirmation. */
  resume: { section: string; retenues: number }[];
  /** Sections vues dans la sauvegarde et volontairement écartées. */
  ecartees: string[];
};

/**
 * Un fichier `.backup` peut-il être transféré sélectivement ? Non.
 *
 * C'est un format BINAIRE propriétaire : RouterOS ne sait le relire qu'en le
 * restaurant en bloc, et n'offre aucune restauration partielle. Il faudrait
 * donc écraser toute la configuration du routeur d'accueil — son tunnel, ses
 * clés, son adressage — c'est-à-dire précisément ce que ce transfert existe
 * pour éviter.
 *
 * On le détecte à sa signature plutôt qu'à son extension : un fichier renommé
 * en `.rsc` produirait sinon un plan vide, sans que rien ne l'explique.
 */
export function estSauvegardeBinaire(contenu: Buffer | Uint8Array): boolean {
  const octets = Buffer.from(contenu.subarray(0, 512));
  // Un export texte commence par « # » (l'en-tête de date) ou par « / ».
  const texte = octets.toString("utf8");
  if (/^[#/]/.test(texte.trimStart())) return false;
  // Un octet nul ne survient jamais dans un export RouterOS.
  return octets.includes(0);
}

export const MESSAGE_BACKUP_BINAIRE =
  "Un fichier .backup est un format binaire que RouterOS ne sait restaurer qu'en BLOC : " +
  "il écraserait le tunnel, les clés et l'adressage du routeur d'accueil. " +
  "Sur l'ancien routeur, produisez un export texte — /export file=transfert — " +
  "puis déposez le .rsc obtenu ici.";

/** Une entrée de `/system script` est-elle une recette MikHmon ? */
export function estRecetteMikhmon(args: string): boolean {
  /* MikHmon range chaque vente là, avec `comment=mikhmon`. Les autres scripts
     — `export-all` posé par SafeLinkHub, les scripts de l'exploitant — ne
     doivent PAS suivre : ils portent des droits et un propriétaire qui n'ont
     pas de sens sur le nouvel équipement. */
  return lireArgument(args, "comment") === "mikhmon";
}

/**
 * Construit le transfert : ce qui passe, réécrit pour le nouveau routeur.
 */
export function planifierTransfert(rsc: string, cible: CibleRouteur): PlanTransfert {
  const toutes = analyserRsc(rsc);
  const retenues: CommandeRsc[] = [];
  const vues = new Set<string>();

  for (const section of SECTIONS_TRANSFEREES) {
    for (const c of toutes) {
      if (c.section !== section || c.verbe !== "add") continue;

      if (section === "/system script" && !estRecetteMikhmon(c.arguments)) continue;

      let args = c.arguments;

      if (section === "/ip pool") {
        // Le pool est REBÂTI sur le sous-réseau du nouveau routeur : recopier
        // 10.10.8.1-10.10.11.254 sur une carte adressée ailleurs donnerait des
        // baux hors sujet, et le hotspot ne distribuerait plus rien.
        args = ecrireArgument(args, "name", cible.poolName);
        args = ecrireArgument(args, "ranges", cible.poolRanges);
      }
      if (section === "/ip hotspot user profile") {
        args = ecrireArgument(args, "address-pool", cible.poolName);
      }
      if (section === "/ip hotspot user") {
        // Un ticket sans profil est le compte `admin` de l'ancien routeur : il
        // n'a rien à faire ici, et écraserait un compte du nouveau.
        if (!lireArgument(args, "profile")) continue;
        args = ecrireArgument(args, "server", cible.hotspotServer);
      }

      retenues.push({ ...c, arguments: args });
    }
  }

  for (const c of toutes) vues.add(c.section);
  const gardees = new Set<string>(SECTIONS_TRANSFEREES);

  return {
    commandes: retenues,
    resume: SECTIONS_TRANSFEREES.map((s) => ({
      section: s,
      retenues: retenues.filter((c) => c.section === s).length,
    })),
    ecartees: [...vues].filter((s) => !gardees.has(s)).sort(),
  };
}

/** Le script `.rsc` à importer sur le nouveau routeur. */
export function rendreTransfert(plan: PlanTransfert): string {
  const lignes: string[] = [
    "# Transfert sélectif SafeLinkHub — tickets, profils, schedulers, recettes.",
    "# La configuration réseau du routeur d'accueil n'est PAS touchée.",
  ];
  let sectionCourante = "";
  for (const c of plan.commandes) {
    if (c.section !== sectionCourante) {
      lignes.push(c.section);
      sectionCourante = c.section;
    }
    lignes.push(`${c.verbe} ${c.arguments}`);
  }
  return lignes.join("\n") + "\n";
}

/**
 * `clé=valeur` d'une ligne d'export → mots de l'API RouterOS.
 *
 * Les valeurs entre guillemets contiennent des espaces — un découpage naïf sur
 * les espaces couperait un `on-login` en son milieu, et le profil arriverait
 * avec un script tronqué qui n'expire plus rien, sans la moindre erreur.
 *
 * Vit ici, avec les autres fonctions pures : un module « use server » ne peut
 * exporter que des fonctions asynchrones, donc rien de ce qu'il contient ne se
 * teste directement.
 */
export function decouperArguments(args: string): string[] {
  const mots: string[] = [];
  const motif = /([a-z0-9-]+)=("((?:[^"\\]|\\.)*)"|\S+)/gi;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(args)) !== null) {
    const valeur = m[3] !== undefined ? m[3].replace(/\\(.)/g, "$1") : m[2];
    mots.push(`=${m[1]}=${valeur}`);
  }
  return mots;
}
