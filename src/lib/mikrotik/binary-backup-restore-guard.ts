/**
 * Une sauvegarde `.backup` RouterOS est un clone binaire complet : elle ne doit
 * jamais servir à migrer un autre routeur. La confirmation est vérifiée côté
 * serveur pour qu'un appel direct à la Server Action ne puisse pas contourner
 * le garde-fou de l'interface.
 */
export function binaryBackupRestoreGuard(sameDeviceAndRouterOsConfirmed: boolean) {
  if (sameDeviceAndRouterOsConfirmed) return { ok: true as const };

  return {
    ok: false as const,
    error:
      "Restauration binaire bloquée : confirmez qu'il s'agit du MÊME routeur physique et de la MÊME version RouterOS. Pour migrer les tickets vers un autre MikroTik, utilisez une sauvegarde SafeLinkHub (logique).",
  };
}

/** Toute annulation ou nouvelle cible exige un acquittement frais. */
export function resetBinaryBackupRestoreConfirmation() {
  return {
    confirming: false,
    sameDeviceAndRouterOsConfirmed: false,
  };
}
