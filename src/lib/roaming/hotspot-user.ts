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
