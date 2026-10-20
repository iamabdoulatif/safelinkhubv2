import type { RouterOSClient } from "./client";

/** Local expiry scripts may remove an owned resource after our inventory. */
export async function cleanupFupResource(client: RouterOSClient, words: string[], timeout: number) {
  try {
    await client.talk(words, timeout);
  } catch (error) {
    if (!(error instanceof Error) || !/^no such item(?: \(4\))?$/.test(error.message)) throw error;
  }
}
