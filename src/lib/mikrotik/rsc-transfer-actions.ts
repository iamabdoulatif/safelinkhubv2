"use server";

/**
 * Applique un transfert sélectif `.rsc` sur un routeur d'accueil.
 *
 * La décision de CE QUI passe vit dans rsc-selective-restore.ts, en fonctions
 * pures ; ce module ne fait que lire le routeur d'accueil, appeler le
 * planificateur, puis exécuter. Toute la logique testable est de l'autre côté.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { connectToRouter } from "./router-sync";
import {
  planifierTransfert,
  type CibleRouteur,
  type PlanTransfert,
  decouperArguments,
} from "./rsc-selective-restore";

type Sentence = Record<string, string>;

/**
 * Lit sur le routeur d'accueil ce à quoi le transfert doit s'adapter.
 *
 * ON LIT PLUTÔT QUE DE SUPPOSER : le pool et le serveur hotspot du routeur
 * d'accueil viennent de SON auto-setup, avec son propre sous-réseau. Deviner
 * « POOL-HOTSPOT » et « hotspot1 » marcherait sur la plupart des cartes et
 * échouerait en silence sur celles qui ont été configurées autrement — les
 * profils pointeraient un pool inexistant, et le hotspot cesserait
 * d'attribuer des adresses.
 */
async function lireCible(client: Awaited<ReturnType<typeof connectToRouter>>): Promise<
  { ok: true; cible: CibleRouteur } | { ok: false; erreur: string }
> {
  const pools: Sentence[] = await client.talk(["/ip/pool/print"]).catch(() => []);
  const serveurs: Sentence[] = await client.talk(["/ip/hotspot/print"]).catch(() => []);

  const pool = pools.find((p) => (p.name ?? "").toUpperCase().includes("HOTSPOT")) ?? pools[0];
  const serveur = serveurs[0];

  if (!pool?.name || !pool.ranges) {
    return {
      ok: false,
      erreur:
        "Le routeur d'accueil n'a aucun pool d'adresses : lancez d'abord son auto-setup, le transfert s'y adaptera ensuite.",
    };
  }
  if (!serveur?.name) {
    return {
      ok: false,
      erreur:
        "Le routeur d'accueil n'a aucun serveur hotspot : lancez d'abord son auto-setup.",
    };
  }
  return {
    ok: true,
    cible: {
      poolName: pool.name,
      poolRanges: pool.ranges,
      hotspotServer: serveur.name,
      /* Le bridge que le hotspot d'accueil dessert déjà. On l'ANNONCE sans y
         toucher : c'est là que les tickets transférés atterriront. */
      hotspotBridge: serveur.interface ?? "(inconnu)",
    },
  };
}

/** Ce que l'écran affiche AVANT d'écrire quoi que ce soit. */
export async function planifierTransfertRsc(routerId: string, rsc: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [routeur] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!routeur || (routeur.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }

  let client;
  try {
    client = await connectToRouter(routeur);
    const cible = await lireCible(client);
    if (!cible.ok) return { error: cible.erreur };
    const plan = planifierTransfert(rsc, cible.cible);
    return {
      success: true as const,
      cible: cible.cible,
      resume: plan.resume,
      ecartees: plan.ecartees,
      total: plan.commandes.length,
    };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Connexion au routeur impossible." };
  } finally {
    client?.close();
  }
}

/**
 * Exécute le transfert, commande par commande.
 *
 * PAS DE `/import` : celui-ci demande d'écrire un fichier sur le routeur, et
 * s'arrête à la PREMIÈRE erreur en laissant la moitié du travail fait, sans
 * dire laquelle. En passant par l'API, chaque commande est isolée : une ligne
 * refusée est nommée et le reste continue, ce qui compte pour soixante
 * tickets dont un seul peut porter un caractère que RouterOS n'accepte plus.
 */
export async function appliquerTransfertRsc(routerId: string, rsc: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [routeur] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!routeur || (routeur.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }

  let client;
  try {
    client = await connectToRouter(routeur, 60_000);
    const cible = await lireCible(client);
    if (!cible.ok) return { error: cible.erreur };

    const plan: PlanTransfert = planifierTransfert(rsc, cible.cible);
    const echecs: { commande: string; raison: string }[] = [];
    let posees = 0;

    for (const c of plan.commandes) {
      /* `/ip pool` est le seul cas où l'on RÈGLE au lieu d'ajouter : le pool
         du routeur d'accueil existe déjà et sert son hotspot. En ajouter un
         second du même nom serait refusé, et le supprimer couperait les
         clients connectés. */
      const chemin = c.section.trim().replace(/\s+/g, "/");
      if (c.section === "/ip pool") {
        posees += 1; // déjà en place, adapté par construction
        continue;
      }
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

    return {
      success: true as const,
      posees,
      echecs,
      resume: plan.resume,
      cible: cible.cible,
    };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Transfert impossible." };
  } finally {
    client?.close();
  }
}
