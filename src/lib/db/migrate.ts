/**
 * Applique les migrations en attente (migrations.ts) au démarrage du serveur.
 *
 * Ce SaaS n'avait AUCUN applicateur de migrations : `schema.ts` pouvait devancer
 * la base et casser toute page lisant la table modifiée (« column does not
 * exist »), le déploiement étant automatique sur push. Ceci ferme la faille :
 * le conteneur met la base à niveau avant de servir la moindre requête.
 *
 * Garanties :
 *   - SÉRIALISÉ entre instances par un verrou consultatif Postgres (deux
 *     conteneurs qui démarrent ensemble n'exécutent pas le même ALTER en même
 *     temps) ;
 *   - SUIVI : chaque migration est enregistrée dans `_slh_migrations`, jouée au
 *     plus une fois par base ;
 *   - TRANSACTIONNEL par migration : un échec annule cette migration entière ;
 *   - TOLÉRANT au démarrage : quelques tentatives de connexion (la base peut
 *     n'être pas encore prête à l'instant du boot du conteneur).
 *
 * En cas d'échec réel, l'appelant (instrumentation) arrête le process : le
 * conteneur sort en erreur et le déploiement revient en arrière plutôt que de
 * servir un schéma incohérent.
 */
import { Pool, type PoolClient } from "pg";
import { MIGRATIONS } from "./migrations";

/** Clé arbitraire mais STABLE du verrou consultatif (doit rester constante). */
const ADVISORY_LOCK_KEY = 0x5a1e_11b0; // "SafeLinkHub" en clin d'œil hexadécimal

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runPendingMigrations(
  opts: { connectAttempts?: number; connectDelayMs?: number } = {},
): Promise<{ applied: string[]; skipped: boolean }> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] DATABASE_URL absent — migrations ignorées (build ou environnement sans base).");
    return { applied: [], skipped: true };
  }

  const attempts = opts.connectAttempts ?? 10;
  const delayMs = opts.connectDelayMs ?? 3000;
  const pool = new Pool({ connectionString: url, max: 1 });

  try {
    // La base peut ne pas être joignable à la seconde exacte du démarrage.
    let client: PoolClient | null = null;
    for (let i = 1; i <= attempts; i++) {
      try {
        client = await pool.connect();
        break;
      } catch (err) {
        if (i === attempts) throw err;
        console.warn(`[migrate] base injoignable (tentative ${i}/${attempts}) — nouvel essai dans ${delayMs} ms.`);
        await sleep(delayMs);
      }
    }
    if (!client) throw new Error("connexion à la base impossible");

    try {
      await client.query(
        "create table if not exists _slh_migrations (id text primary key, applied_at timestamptz not null default now())",
      );
      // Sérialise les démarrages concurrents : un seul conteneur migre à la fois.
      await client.query("select pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
      try {
        const done = new Set<string>(
          (await client.query("select id from _slh_migrations")).rows.map((r: { id: string }) => r.id),
        );
        const applied: string[] = [];
        for (const m of MIGRATIONS) {
          if (done.has(m.id)) continue;
          await client.query("begin");
          try {
            await client.query(m.sql);
            await client.query("insert into _slh_migrations (id) values ($1) on conflict do nothing", [m.id]);
            await client.query("commit");
            applied.push(m.id);
          } catch (err) {
            await client.query("rollback").catch(() => {});
            throw new Error(`migration ${m.id} échouée : ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        return { applied, skipped: false };
      } finally {
        await client.query("select pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => {});
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end().catch(() => {});
  }
}
