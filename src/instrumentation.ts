/**
 * Hook de démarrage Next.js : appelé UNE fois à l'initialisation du serveur, et
 * terminé avant qu'aucune requête ne soit servie (voir la doc du fichier
 * instrumentation). On s'en sert pour mettre la BASE à niveau avant que le
 * moindre chemin ne lise une table — sans cela, un déploiement dont le
 * `schema.ts` devance la base casse toutes les pages routeur.
 */
export async function register() {
  // Ne tourne que dans le runtime Node (jamais Edge, où `pg` n'existe pas).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runPendingMigrations } = await import("@/lib/db/migrate");
  try {
    const { applied, skipped } = await runPendingMigrations();
    if (skipped) return;
    if (applied.length > 0) console.info("[migrate] migrations appliquées :", applied.join(", "));
    else console.info("[migrate] base déjà à jour.");
  } catch (err) {
    // Schéma incohérent = pages cassées. On arrête le conteneur pour que le
    // déploiement revienne en arrière, plutôt que de servir du cassé.
    console.error("[migrate] ÉCHEC au démarrage — arrêt du process pour laisser le déploiement revenir en arrière.", err);
    process.exit(1);
  }
}
