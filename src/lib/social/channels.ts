// Canaux de diffusion — module SANS AUCUN IMPORT, importable depuis un
// composant client.
//
// Ces constantes vivaient dans share.ts, qui importe `getDb` et donc `pg`.
// Un composant client (BlogPostForm) qui n'en tirait qu'un libellé faisait
// entrer tout le pilote Postgres dans le bundle navigateur, et le build
// échouait sur « Can't resolve 'dns' ». Le type et le libellé sont donc
// séparés de tout ce qui touche la base.

export const SHARE_CHANNELS = ["telegram", "facebook"] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export const CHANNEL_LABEL: Record<ShareChannel, string> = {
  telegram: "Telegram",
  facebook: "Facebook",
};

// Pas de WhatsApp : l'API Groupes de Meta plafonne un groupe à 8 participants
// et exige un Official Business Account — inutilisable pour un groupe
// communautaire. La diffusion WhatsApp reste manuelle.
