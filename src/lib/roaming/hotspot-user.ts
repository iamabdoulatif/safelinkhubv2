type HotspotUserClient = {
  talk(words: string[]): Promise<Record<string, string>[]>;
};

/**
 * Reads one RouterOS hotspot account. A transport/API error stays an error:
 * callers must never confuse an unverified router with an account that was
 * confirmed absent.
 */
export async function findHotspotUser(
  client: HotspotUserClient,
  name: string,
): Promise<Record<string, string> | null> {
  const rows = await client.talk(["/ip/hotspot/user/print", `?name=${name}`]);
  return rows[0] ?? null;
}

/**
 * Efface TOUTE trace d'un compte hotspot sur un routeur : sessions ouvertes,
 * la ligne du compte, puis le compagnon mac-cookie que RouterOS crée au
 * premier login (une seconde entrée nommée d'après la MAC). Oublier ce
 * compagnon laisse l'appareil se reconnecter tout seul — l'accès survit à une
 * révocation annoncée comme complète.
 *
 * Extrait de deleteRoamingAccount pour que le retrait d'une ZONE efface
 * exactement la même chose : deux copies de cette séquence finiraient par
 * diverger, et la divergence se paierait en accès laissés ouverts.
 *
 * Laisse remonter l'erreur de transport : l'appelant doit pouvoir distinguer
 * « supprimé » d'« injoignable, donc peut-être encore actif ».
 */
export async function purgeHotspotAccount(
  client: HotspotUserClient,
  username: string,
  knownMacs: readonly string[] = [],
): Promise<boolean> {
  const user = await findHotspotUser(client, username);
  if (!user?.[".id"]) return false;

  const active = await client
    .talk(["/ip/hotspot/active/print", `?user=${username}`])
    .catch(() => [] as Record<string, string>[]);
  for (const session of active) {
    if (session[".id"]) {
      await client.talk(["/ip/hotspot/active/remove", `=.id=${session[".id"]}`]).catch(() => {});
    }
  }

  // Le ticket ne porte plus de mac-address (elle rendait le code inutilisable
  // depuis une autre adresse) : les compagnons sont donc désignés par les MAC
  // connues en base, `mac-address` ne servant plus que de repli historique.
  const boundMac = (user["mac-address"] ?? "").trim();
  await client.talk(["/ip/hotspot/user/remove", `=.id=${user[".id"]}`]);
  const macs = new Set(
    [boundMac, ...knownMacs]
      .map((mac) => mac.trim())
      .filter((mac) => mac && mac !== "00:00:00:00:00:00"),
  );
  for (const mac of macs) {
    const companion = await findHotspotUser(client, mac).catch(() => null);
    if (companion?.[".id"]) {
      await client.talk(["/ip/hotspot/user/remove", `=.id=${companion[".id"]}`]).catch(() => {});
    }
  }
  return true;
}
