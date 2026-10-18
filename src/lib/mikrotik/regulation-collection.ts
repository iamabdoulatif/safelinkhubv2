/** A read must finish before n8n's 60s HTTP timeout, including late handshakes. */
export async function withCollectionDeadline<C extends {close(): void}, T>(
  connect: () => Promise<C>, collect: (client: C) => Promise<T>, budgetMs = 45000,
): Promise<T> {
  let client: C | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = () => Object.assign(new Error('Collecte interrompue : délai de réponse dépassé.'), {code:'FUP_COLLECTION_TIMEOUT'});
  try {
    return await Promise.race([
      (async () => {
        const connected = await connect();
        if (expired) { connected.close(); throw timeout(); }
        client = connected;
        return collect(connected);
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(timeout()); }, budgetMs); }),
    ]);
  } finally { clearTimeout(timer); client?.close(); }
}

/** Never return database statements, credentials, stacks or opaque objects. */
export function collectionFailure(error: unknown): {code:string;error:string;retryable:true} {
  let current = error;
  for (let depth=0; depth<5 && current && typeof current==='object'; depth++) {
    const e = current as {code?:unknown;cause?:unknown};
    if (e.code === '55P03') return {code:'FUP_COLLECTION_BUSY',error:'Application FUP en cours : collecte reportée au prochain passage.',retryable:true};
    if (e.code === 'FUP_COLLECTION_TIMEOUT') return {code:e.code,error:'Collecte interrompue après 45 secondes ; vérifier la disponibilité de l’API et du tunnel.',retryable:true};
    current=e.cause;
  }
  return {code:'FUP_COLLECTION_FAILED',error:'Lecture des compteurs impossible. Vérifier l’API MikroTik, le tunnel et les journaux du serveur.',retryable:true};
}
