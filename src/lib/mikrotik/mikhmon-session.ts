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
