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

  const boundMac = (user["mac-address"] ?? "").trim();
  await client.talk(["/ip/hotspot/user/remove", `=.id=${user[".id"]}`]);
  if (boundMac && boundMac !== "00:00:00:00:00:00") {
    const companion = await findHotspotUser(client, boundMac);
    if (companion?.[".id"]) {
      await client.talk(["/ip/hotspot/user/remove", `=.id=${companion[".id"]}`]).catch(() => {});
    }
  }
  return true;
}
