import type { RouterOSClient } from "./client";

/**
 * PRÉ-CONFIGURATION AUTOMATIQUE de la session MikHmon dans l'auto-setup.
 *
 * Sur ces boards, RouterOS 7.23.x REJETTE `=envlist=` : impossible de
 * pré-remplir la session par variables d'environnement. On écrit donc
 * DIRECTEMENT le `config.php` du conteneur (via /file), au format exact de
 * MikHmon (rétro-ingénierie de settings/settings.php de l'image mikhmon-sf-v1) :
 *
 *   $data['<session>'] = array(
 *     1  => '<session>!<ipMikrotik>',      // IP (plain)
 *     2  => '<session>@|@<user>',          // user (plain)
 *     3  => '<session>#|#<pass chiffré>',  // mot de passe (voir ci-dessous)
 *     4  => '<session>%<hotspot>',         // Nom du hotspot (Server Profile Name)
 *     5  => '<session>^<dns>',             // Nom DNS = IP passerelle du hotspot
 *     6  => '<session>&<devise>',          // fcfa
 *     7  => '<session>*<autoreload>',      // chargement auto (>=10)
 *     8  => '<session>(<iface>',           // interface de trafic
 *     9  => '<session>)<infolp hex>',      // pied d'info (hex, vide ici)
 *     10 => '<session>=<idle>',            // délai d'inactivité (disable)
 *     11 => '<session>@!@<livereport>',    // rapport en direct (enable)
 *   );
 *
 * MOT DE PASSE : MikHmon `encrypt()` fait de l'AES-256-GCM avec une clé PROPRE
 * au conteneur (secret.key.php / env), qu'on ne peut pas connaître ni fixer.
 * Mais son `decrypt()` retombe sur le chiffre LEGACY (clé fixe « 128 ») pour
 * toute chaîne sans préfixe « v2: ». On chiffre donc le mot de passe en legacy
 * (reproductible, sans secret conteneur) → MikHmon le déchiffre via ce repli.
 */

/** Chiffre legacy MikHmon (clé fixe 128 → « 812 » cyclique sur i%3). Portable. */
export function mikhmonLegacyEncrypt(input: string): string {
  // PHP: substr("128", ($i%3)-1, 1) => i%3=0→"8", 1→"1", 2→"2".
  const K = [56, 49, 50]; // ord('8'), ord('1'), ord('2')
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    bytes.push((input.charCodeAt(i) + K[i % 3]) & 0xff); // PHP chr() wrappe mod 256
  }
  return Buffer.from(bytes).toString("base64");
}

/** Hex (unpack("H*")) d'une chaîne — pour le champ infolp. */
function toHex(s: string): string {
  return Buffer.from(s, "utf8").toString("hex");
}

export type MikhmonSessionValues = {
  ip: string;
  user: string;
  pass: string;
  hotspot: string;
  dns: string;
  currency: string;
  autoload: number;
  iface: number;
  infolp: string;
  idle: string; // "disable" ou minutes
  livereport: string; // "enable" | "disable"
};

/** Contenu complet de config.php (en-tête + admin par défaut + la session). */
export function buildMikhmonConfigPhp(session: string, v: MikhmonSessionValues): string {
  // Les valeurs vont dans des littéraux PHP à guillemets simples : on retire tout
  // apostrophe pour ne pas casser le fichier (MikHmon fait pareil sur hotspotname).
  const q = (s: string | number) => String(s).replace(/'/g, "");
  const enc = mikhmonLegacyEncrypt(v.pass);
  const S = q(session);
  const entries = [
    `1=>'${S}!${q(v.ip)}'`,
    `2=>'${S}@|@${q(v.user)}'`,
    `3=>'${S}#|#${enc}'`,
    `4=>'${S}%${q(v.hotspot)}'`,
    `5=>'${S}^${q(v.dns)}'`,
    `6=>'${S}&${q(v.currency)}'`,
    `7=>'${S}*${q(v.autoload)}'`,
    `8=>'${S}(${q(v.iface)}'`,
    `9=>'${S})${q(toHex(v.infolp))}'`,
    `10=>'${S}=${q(v.idle)}'`,
    `11=>'${S}@!@${q(v.livereport)}'`,
  ];
  return [
    "<?php ",
    'if (isset($_SERVER["REQUEST_URI"]) && substr($_SERVER["REQUEST_URI"], -10) == "config.php") {',
    '  header("Location:./");',
    "  exit;",
    "}",
    "$data['mikhmon'] = array ('1'=>'mikhmon<|<mikhmon','2'=>'mikhmon>|>aWNlbA==');",
    `$data['${S}'] = array(${entries.join(",")});`,
    "",
  ].join("\n");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Écrit la session dans le config.php du conteneur (chemin dérivé du root-dir),
 * puis redémarre le conteneur pour que MikHmon relise le fichier (purge opcache).
 * containerId : .id du conteneur (pour le redémarrage) — optionnel.
 */
export async function writeMikhmonSession(
  client: RouterOSClient,
  containerRootDir: string,
  session: string,
  values: MikhmonSessionValues,
  containerId: string | undefined,
  opts: { timeoutMs?: number } = {},
): Promise<{ ok: boolean; error?: string }> {
  const t = opts.timeoutMs ?? 20000;
  const path = `${containerRootDir}/src/src/include/config.php`;
  const content = buildMikhmonConfigPhp(session, values);

  // /file/add crée le fichier dans la couche modifiable du conteneur (override
  // du config.php de l'image). S'il est déjà listé → /file/set.
  const added = await client
    .talk(["/file/add", `=name=${path}`, `=contents=${content}`], t)
    .then(() => true)
    .catch(() => false);
  if (!added) {
    const set = await client
      .talk(["/file/set", `=numbers=${path}`, `=contents=${content}`], t)
      .then(() => true)
      .catch((e) => e);
    if (set !== true) {
      return { ok: false, error: set instanceof Error ? set.message : "écriture config.php impossible" };
    }
  }

  // Redémarrage du conteneur pour relire config.php (opcache).
  if (containerId) {
    await client.talk(["/container/stop", `=numbers=${containerId}`], t).catch(() => {});
    await sleep(2500);
    await client.talk(["/container/start", `=numbers=${containerId}`], t).catch(() => {});
  }
  return { ok: true };
}


/* ────────────────────────────────────────────────────────────────────────────
 * LA MÊME SESSION, MAIS ÉCRITE PAR LE SCRIPT D'INSTALLATION.
 *
 * Le script d'enrôlement recrée `safelinkhub-api` avec un mot de passe NEUF. Sur
 * une carte DÉJÀ en service qu'on ré-enrôle (routeur repris, ligne `routers`
 * refaite), le conteneur MikHmon garde l'ancien dans son config.php : RouterOS
 * refuse alors ses connexions — « login failure for user safelinkhub-api from
 * 11.11.11.11 via api » dans /log — et MikHmon n'affiche plus que « MikroTik Not
 * Connected » avec une page de tickets vide, pendant que le tunnel, le conteneur
 * et le portail vont parfaitement bien. Relevé sur HSPT-COUZA le 09/09/2026, et
 * sur KONGASSO-HTSPT une semaine plus tôt.
 *
 * Sur une carte NEUVE le bloc ne fait rien (ni conteneur ni hotspot) : c'est
 * l'auto-setup qui écrit la session ensuite, avec le même contenu.
 * ────────────────────────────────────────────────────────────────────────── */

/** Échappe une chaîne pour un littéral RouterOS `"..."` (`\`, `"`, `$`, saut de ligne). */
export function escapeRosLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/\n/g, "\\n");
}

const HOTSPOT_MARK = "@@SLH_HOTSPOT@@";
const DNS_MARK = "@@SLH_DNS@@";
/** Début de la ligne des identifiants MikHmon dans config.php. */
const ADMIN_KEY = "$data['mikhmon']";

/**
 * Bloc RouterOS à exécuter APRÈS la création du compte API.
 *
 * TROIS PRÉCAUTIONS, chacune payée par une panne observée :
 *
 * 1. `[:parse]` — sur mipsbe/mmips le menu `/container` n'existe pas, et une
 *    commande `/container` en clair ferait échouer l'`/import` ENTIER dès
 *    l'analyse, avant même le tunnel. Un échec d'exécution, lui, se rattrape.
 * 2. `:global` — le nom du hotspot et son adresse sont lus SUR LA CARTE (le
 *    serveur ne les connaît pas à l'enrôlement), et un `[:parse]` ne voit pas
 *    les variables locales de son appelant. Le config.php voyage donc en
 *    morceaux globaux, recollés autour des deux valeurs lues.
 * 3. La ligne `$data['mikhmon']` du fichier EXISTANT est recopiée telle quelle :
 *    c'est le mot de passe d'ouverture de MikHmon, que l'exploitant a pu
 *    changer (il est alors chiffré avec une clé propre au conteneur, qu'on ne
 *    sait pas reproduire). L'écraser par le défaut le mettrait dehors de son
 *    propre MikHmon. À défaut de fichier, le défaut s'applique.
 *
 * `/file set` d'abord, `/file add` en repli : les fichiers d'un « container
 * store » ne sont PAS énumérables (`/file find` ne les voit jamais), mais ils
 * s'adressent par chemin. Chercher avant d'écrire faisait donc toujours croire
 * à un fichier absent, et `/file add` répondait « file already exists ».
 */
export function buildMikhmonResyncRos(session: string, user: string, pass: string): string {
  const config = buildMikhmonConfigPhp(session, {
    ip: "11.11.11.1", // passerelle DOCKERS : l'adresse que le conteneur joint
    user,
    pass,
    hotspot: HOTSPOT_MARK,
    dns: DNS_MARK,
    currency: "fcfa",
    autoload: 10,
    iface: 1,
    infolp: "",
    idle: "disable",
    livereport: "enable",
  });

  const lignes = config.split("\n");
  const iAdmin = lignes.findIndex((l) => l.startsWith(ADMIN_KEY));
  if (iAdmin < 0) throw new Error("config.php MikHmon : ligne des identifiants introuvable");
  const entete = lignes.slice(0, iAdmin).join("\n") + "\n";
  const admin = lignes[iAdmin];
  // La ligne de session reprend le saut de ligne qui la séparait des identifiants.
  const [s1, apresHotspot] = ("\n" + lignes.slice(iAdmin + 1).join("\n")).split(HOTSPOT_MARK);
  const [s2, s3] = apresHotspot.split(DNS_MARK);

  /* Le corps s'exécute via [:parse] : il est donc échappé une fois de plus que
     le reste du script. On l'assemble ici pour que ce soit la machine qui
     compte les antislashs, pas le lecteur — et aucune chaîne du corps ne
     contient de « $ », qui devrait sinon l'être deux fois (d'où slhCfgN). */
  const corps = [
    `:global slhCfgH; :global slhCfgA; :global slhCfgN;`,
    `:global slhCfg1; :global slhCfg2; :global slhCfg3;`,
    `:local c [/container find where name~"mikhmon" or root-dir~"mikhmon"];`,
    `:local p [/ip hotspot profile find where name!="default"];`,
    `:if (([:len $c] > 0) and ([:len $p] > 0)) do={`,
    `  :local rd [/container get [:pick $c 0] root-dir];`,
    `  :if ([:pick $rd 0 1] = "/") do={ :set rd [:pick $rd 1 [:len $rd]] };`,
    `  :local f ($rd . "/src/src/include/config.php");`,
    `  :local cur "";`,
    `  :do { :set cur [/file get $f contents] } on-error={};`,
    `  :local adm $slhCfgA;`,
    `  :local i [:find $cur $slhCfgN -1];`,
    `  :if ([:typeof $i] = "num") do={`,
    `    :local j [:find $cur ";" $i];`,
    `    :if ([:typeof $j] = "num") do={ :set adm [:pick $cur $i ($j + 1)] };`,
    `  };`,
    `  :local t ($slhCfgH . $adm . $slhCfg1 . [/ip hotspot profile get [:pick $p 0] name] . $slhCfg2 . [/ip hotspot profile get [:pick $p 0] hotspot-address] . $slhCfg3);`,
    `  :do { /file set $f contents=$t } on-error={ /file add name=$f contents=$t };`,
    `  /container stop [:pick $c 0];`,
    `  :delay 3s;`,
    `  /container start [:pick $c 0];`,
    `  :log info "SafeLinkHub resynced the MikHmon session with the new API password";`,
    `}`,
  ].join(" ");

  return [
    `:global slhCfgH "${escapeRosLiteral(entete)}"`,
    `:global slhCfgA "${escapeRosLiteral(admin)}"`,
    `:global slhCfgN "${escapeRosLiteral(ADMIN_KEY)}"`,
    `:global slhCfg1 "${escapeRosLiteral(s1)}"`,
    `:global slhCfg2 "${escapeRosLiteral(s2)}"`,
    `:global slhCfg3 "${escapeRosLiteral(s3)}"`,
    `:do {`,
    `  :local slhSession [:parse "${escapeRosLiteral(corps)}"]`,
    `  $slhSession`,
    `} on-error={ :log warning "SafeLinkHub could not resync the MikHmon session (no container package, or MikHmon not installed yet)" }`,
    `/system script environment remove [find name~"^slhCfg"]`,
  ].join("\n");
}
