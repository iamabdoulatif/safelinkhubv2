// Nouveau mot de passe du compte d'administration (celui de Winbox), demandé
// à l'utilisateur à la fin de la préparation : un routeur sorti d'usine ou
// préparé avec un mot de passe connu (étiquette, « admin123 »…) ne doit pas
// repartir chez le client avec. Appliqué puis VÉRIFIÉ par une reconnexion.
import type { Transport } from './configurator';

const WEAK = /^(admin|password|motdepasse|mikrotik|12345678|123456789|1234567890|azerty|qwerty|admin123|admin1234)$/i;

/** null si acceptable, sinon la raison du refus (affichée telle quelle). */
export function passwordProblem(next: string, current: string, username: string): string | null {
  if (next.length < 10) return 'Au moins 10 caractères.';
  if (next.length > 64) return '64 caractères au maximum.';
  if (/[\s"'\\$;]/.test(next)) return 'Évitez les espaces et les caractères " \' \\ $ ;';
  if (!/[a-zA-Z]/.test(next) || !/\d/.test(next)) return 'Mélangez lettres et chiffres.';
  if (WEAK.test(next) || next.toLowerCase().includes(username.toLowerCase())) return 'Mot de passe trop facile à deviner.';
  if (next === current) return 'Le nouveau mot de passe doit être différent de l’actuel.';
  return null;
}

/** Change le mot de passe de `username` puis vérifie la connexion avec le nouveau. */
export async function changeAdminPassword(
  transport: Transport,
  verify: (password: string) => Transport,
  username: string,
  next: string,
): Promise<void> {
  if (!transport.withClient) throw new Error('Transport sans session complète.');
  await transport.withClient(async client => {
    const users = await client.talk(['/user/print', `?name=${username}`]);
    if (!users[0]?.['.id']) throw new Error(`Compte « ${username} » introuvable sur le routeur.`);
    await client.talk(['/user/set', `=numbers=${users[0]['.id']}`, `=password=${next}`]);
  });
  // Preuve : une NOUVELLE connexion avec le nouveau mot de passe.
  const check = await verify(next).read('/system/identity/print').catch(() => null);
  if (!check) throw new Error('Mot de passe changé mais la reconnexion a échoué : réessayez avec le nouveau mot de passe dans Winbox avant de quitter.');
}
