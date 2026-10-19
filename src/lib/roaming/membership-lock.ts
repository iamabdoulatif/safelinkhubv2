import { getDb } from "@/lib/db";
/** Session lock spans router work; issuance takes the same key in its short reservation transaction. */
export async function acquireRoamingMembershipLock(groupId: string) {
  const client = await getDb().$client.connect();
  const key = `roaming-membership:${groupId}`;
  try {
    const result = await client.query(
      "select pg_try_advisory_lock(hashtextextended($1,0)) as locked",
      [key],
    );
    if (!result.rows[0]?.locked) {
      client.release();
      return null;
    }
    return async () => {
      try {
        await client.query(
          "select pg_advisory_unlock(hashtextextended($1,0))",
          [key],
        );
        client.release();
      } catch (error) {
        client.release(
          error instanceof Error ? error : new Error("Unlock failed"),
        );
      }
    };
  } catch (error) {
    client.release(error instanceof Error ? error : new Error("Lock failed"));
    throw error;
  }
}
