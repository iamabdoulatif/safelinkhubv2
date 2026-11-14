/**
 * Exécuteur d'un plan de transfert `.rsc`, commande par commande.
 *
 * Extrait de rsc-transfer-actions.ts pour être TESTABLE : ce dernier est un
 * module `"use server"` (chaque export y est une Server Action, donc ni un
 * helper synchrone ni une fonction prenant un client RouterOS non
 * sérialisable). La logique à risque — saut du pool d'accueil, capture nommée
 * des refus, comptage — vit donc ici, pilotée par le job de transfert.
 *
 * PAS DE `/import` : il demande d'écrire un fichier sur le routeur et s'arrête
 * à la PREMIÈRE erreur en laissant la moitié du travail fait, sans dire
 * laquelle. En passant par l'API, chaque commande est isolée : une ligne
 * refusée est nommée et le reste continue — ce qui compte quand un seul ticket
 * sur des milliers porte un caractère que RouterOS n'accepte plus.
 */
import { decouperArguments, type CommandeRsc } from "./rsc-selective-restore";

/** Le strict minimum dont l'exécuteur a besoin — un vrai client RouterOS le remplit. */
export type TalkClient = { talk: (mots: string[]) => Promise<unknown> };

export type EchecTransfert = { commande: string; raison: string };

export type BilanTransfert = { posees: number; echecs: EchecTransfert[] };

/**
 * Applique chaque commande du plan sur le routeur d'accueil.
 *
 * `onProgress` est appelé par paquets (tous les `batch`, et à la fin) plutôt
 * qu'à chaque commande : un UPDATE de suivi par ticket ferait des milliers
 * d'écritures en base pour un seul transfert.
 */
export async function executerPlan(
  client: TalkClient,
  commandes: CommandeRsc[],
  onProgress?: (posees: number) => void | Promise<void>,
  batch = 25,
): Promise<BilanTransfert> {
  const echecs: EchecTransfert[] = [];
  let posees = 0;

  for (let i = 0; i < commandes.length; i++) {
    const c = commandes[i];
    if (c.section === "/ip pool") {
      /* Le pool d'accueil existe déjà et sert son hotspot ; le plan a adapté
         les profils dessus. En ajouter un second du même nom serait refusé, et
         le supprimer couperait les clients connectés — on ne le recrée pas. */
      posees += 1;
    } else {
      const chemin = c.section.trim().replace(/\s+/g, "/");
      const mots = [`${chemin}/add`, ...decouperArguments(c.arguments)];
      try {
        await client.talk(mots);
        posees += 1;
      } catch (cause) {
        echecs.push({
          commande: `${c.section} ${c.arguments.slice(0, 60)}…`,
          raison: cause instanceof Error ? cause.message : "refusé par RouterOS",
        });
      }
    }

    if (onProgress && (i % batch === 0 || i === commandes.length - 1)) {
      await onProgress(posees);
    }
  }

  return { posees, echecs };
}
