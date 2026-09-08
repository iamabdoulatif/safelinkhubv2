/**
 * Renouvellement du mot de passe du compte API après un changement de
 * propriétaire.
 *
 * LE TUNNEL, LUI, N'EST PAS REFAIT — et n'a pas à l'être : il vit sur la ligne
 * `routers` (`tunnel_ip`, `wg_peer_public_key`, `connection_method`), qui suit
 * le routeur d'une organisation à l'autre. Le relais n'a qu'un seul `wg0` et un
 * seul pool `10.66.0.0/24` partagés par tout le parc : un peer neuf ne serait
 * qu'une autre adresse du même pool, et l'ancien propriétaire n'a jamais tenu
 * la clé privée du peer — elle vit sur le routeur et sur le relais, jamais en
 * base. Le poser à distance obligerait en plus à réécrire la clé WireGuard PAR
 * le tunnel qu'on remplace : si la nouvelle ne remonte pas, la carte devient
 * injoignable et c'est un déplacement.
 *
 * Le compte `safelinkhub-api` est le seul secret que l'ancien propriétaire a pu
 * lire — il était admin RouterOS de la carte. Le renouveler se fait PAR le
 * tunnel existant, et un échec laisse le routeur joignable.
 *
 * L'ORDRE compte : on n'écrit JAMAIS deux fois sur le routeur. Après la pose,
 * on demande à la carte lequel des deux mots de passe l'ouvre, et la base
 * recopie ce verdict. Une écriture de rattrapage sur une session qui vient
 * peut-être de tomber ferait exactement ce qu'on cherche à éviter : une base
 * qui ne dit plus la vérité, donc un routeur injoignable.
 */

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "./crypto";
import { connectToRouter } from "./router-sync";

export type RotationVerdict = { ok: true } | { ok: false; error: string };

export type RotationDeps = {
  /** Écrit le mot de passe sur le compte API du routeur. */
  poser: (motDePasse: string) => Promise<void>;
  /** Ce mot de passe ouvre-t-il encore une session ? */
  ouvre: (motDePasse: string) => Promise<boolean>;
  /** Recopie en base ce que le routeur vient de confirmer. */
  enregistrer: (motDePasse: string) => Promise<void>;
};

/** Décision pure : quel mot de passe la base doit garder, et que dire au
 *  superadmin. Testable sans routeur ni base. */
export async function rotateApiPassword(
  deps: RotationDeps,
  { ancien, nouveau }: { ancien: string; nouveau: string },
): Promise<RotationVerdict> {
  try {
    await deps.poser(nouveau);
  } catch (err) {
    // Rien n'a été écrit : l'ancien reste valable des deux côtés, la base est
    // déjà juste. Le transfert tient, seul le renouvellement a échoué.
    return { ok: false, error: `mot de passe API non renouvelé (${message(err)})` };
  }

  if (await deps.ouvre(nouveau)) {
    await deps.enregistrer(nouveau);
    return { ok: true };
  }

  if (await deps.ouvre(ancien)) {
    return {
      ok: false,
      error: "mot de passe API non renouvelé — le routeur a gardé l'ancien",
    };
  }

  /* Aucun des deux n'ouvre : bien plus probablement le tunnel qui a lâché entre
     les deux essais qu'un routeur qui aurait accepté un troisième mot de passe.
     On garde celui qu'on VIENT d'écrire — c'est le seul pari qui laisse le
     routeur joignable si la pose avait bien pris. */
  await deps.enregistrer(nouveau);
  return {
    ok: false,
    error: "mot de passe API renouvelé mais non vérifié — contrôlez la connexion au routeur",
  };
}

/** Le même, branché sur un vrai routeur. */
export async function rotateRouterApiPassword(routerId: string): Promise<RotationVerdict> {
  const db = getDb();
  const [routeur] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  const compteApi = routeur?.username;
  if (!routeur || !compteApi || !routeur.passwordEncrypted || !routeur.host) {
    return { ok: false, error: "mot de passe API non renouvelé (routeur sans identifiants)" };
  }

  const ancien = decryptSecret(routeur.passwordEncrypted);
  const nouveau = randomBytes(18).toString("base64url");

  /* On repasse par connectToRouter — donc par le tunnel du relais — plutôt que
     de rouvrir un socket à la main : c'est lui qui sait qu'un routeur en `vpn`
     ne s'atteint pas comme un routeur en direct. */
  const ouvrir = (motDePasse: string) =>
    connectToRouter({ ...routeur, passwordEncrypted: encryptSecret(motDePasse) });

  return rotateApiPassword(
    {
      poser: async (motDePasse) => {
        const client = await ouvrir(ancien);
        try {
          const [compte] = await client.talk(["/user/print", `?name=${compteApi}`]);
          if (!compte?.[".id"]) throw new Error(`compte ${compteApi} absent du routeur`);
          await client.talk([
            "/user/set",
            `=numbers=${compte[".id"]}`,
            `=password=${motDePasse}`,
          ]);
        } finally {
          client.close();
        }
      },
      ouvre: async (motDePasse) => {
        try {
          const client = await ouvrir(motDePasse);
          client.close();
          return true;
        } catch {
          return false;
        }
      },
      enregistrer: async (motDePasse) => {
        await db
          .update(routers)
          .set({ passwordEncrypted: encryptSecret(motDePasse) })
          .where(eq(routers.id, routerId));
      },
    },
    { ancien, nouveau },
  );
}

function message(err: unknown) {
  return err instanceof Error ? err.message : "erreur inconnue";
}
