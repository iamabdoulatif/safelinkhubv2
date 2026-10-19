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
  const boundMac = (user?.["mac-address"] ?? "").trim();
  const macs = new Set([boundMac,...knownMacs].map(mac=>mac.trim()).filter(mac=>mac && mac!=="00:00:00:00:00:00" && mac!==username));
  const names = [username,...macs];
  // Errors remain errors: the SaaS must retain its row for a safe retry.
  // Remove sessions/cookies even when a previous attempt already removed a user.
  for (const name of names) {
    for (const kind of ["active","cookie"]) {
      const entries = await client.talk([`/ip/hotspot/${kind}/print`, `?user=${name}`]);
      for (const entry of entries) {
        if (entry[".id"]) await client.talk([`/ip/hotspot/${kind}/remove`, `=.id=${entry[".id"]}`]);
      }
    }
  }
  if (user?.[".id"]) await client.talk(["/ip/hotspot/user/remove",`=.id=${user[".id"]}`]);
  for (const mac of macs) {
    const companion = await findHotspotUser(client,mac);
    if (companion?.[".id"]) await client.talk(["/ip/hotspot/user/remove",`=.id=${companion[".id"]}`]);
  }
  return Boolean(user?.[".id"]);
}
