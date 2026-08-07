/**
 * Reconnaissance d'un fichier de sauvegarde BINAIRE RouterOS (`/system backup
 * save`), par opposition au snapshot LOGIQUE JSON de router-backup.ts. Sert à
 * valider un fichier UPLOADÉ avant de le pousser sur un routeur : on refuse tout
 * ce qui n'est pas un vrai `.backup` (un `.rsc`, une image, un fichier corrompu)
 * plutôt que de risquer un `/system backup load` sur un blob arbitraire.
 *
 * Tout est heuristique sur les premiers octets — le format binaire RouterOS
 * n'est pas documenté ; on se limite à ce qui est stable et observable.
 */

/**
 * Magic d'en-tête d'une sauvegarde RouterOS : l'entier 32 bits little-endian
 * 0xB1A1AC88, soit les 4 octets 0x88 0xAC 0xA1 0xB1 en tête de fichier.
 */
export const ROUTEROS_BACKUP_MAGIC = [0x88, 0xac, 0xa1, 0xb1] as const;

/** Taille plafond d'un backup accepté (garde-fou upload). 32 Mo couvre large. */
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;

/** Vrai si le buffer commence par le magic d'une sauvegarde RouterOS. */
export function isRouterOsBackup(buf: Uint8Array): boolean {
  if (buf.length < ROUTEROS_BACKUP_MAGIC.length) return false;
  return ROUTEROS_BACKUP_MAGIC.every((b, i) => buf[i] === b);
}

/**
 * Heuristique de chiffrement : une sauvegarde NON chiffrée laisse les noms de
 * sections en clair juste après l'en-tête (« r5/version », « net/vrf »,
 * « misc/ », …). S'ils sont absents des premiers Ko, le contenu est
 * vraisemblablement chiffré (mot de passe requis à la restauration). Ce n'est
 * pas une preuve cryptographique — juste de quoi guider l'UI et prévenir tôt.
 */
export function looksEncrypted(buf: Uint8Array): boolean {
  if (!isRouterOsBackup(buf)) return false;
  const head = buf.subarray(0, Math.min(buf.length, 4096));
  // Décodage latin1 sûr pour repérer des marqueurs ASCII sans dépendre de TextDecoder.
  let ascii = "";
  for (let i = 0; i < head.length; i++) ascii += String.fromCharCode(head[i]);
  const markers = ["r5/", "net/vrf", "misc/", "/version", "main"];
  return !markers.some((m) => ascii.includes(m));
}

export type RouterOsBackupInspection = {
  valid: boolean;
  encrypted: boolean;
  sizeBytes: number;
  /** Message d'erreur prêt pour l'UI si invalid. */
  error?: string;
};

/** Valide + inspecte un fichier uploadé en une passe (pour la server action). */
export function inspectRouterOsBackup(buf: Uint8Array): RouterOsBackupInspection {
  const sizeBytes = buf.length;
  if (sizeBytes === 0) {
    return { valid: false, encrypted: false, sizeBytes, error: "Fichier vide." };
  }
  if (sizeBytes > MAX_BACKUP_BYTES) {
    return {
      valid: false,
      encrypted: false,
      sizeBytes,
      error: `Fichier trop volumineux (${Math.round(sizeBytes / 1048576)} Mo, max ${MAX_BACKUP_BYTES / 1048576} Mo).`,
    };
  }
  if (!isRouterOsBackup(buf)) {
    return {
      valid: false,
      encrypted: false,
      sizeBytes,
      error:
        "Ce n'est pas une sauvegarde binaire RouterOS (en-tête invalide). Attendu : un fichier « .backup » produit par /system backup save — pas un export « .rsc » ni une autre pièce.",
    };
  }
  return { valid: true, encrypted: looksEncrypted(buf), sizeBytes };
}
