/**
 * Coordonnées PUBLIQUES de SafeLinkHub — une seule source.
 *
 * Elles vivaient en trois copies : le numéro en dur dans la page contact, les
 * coordonnées GPS et l'adresse dans MapEmbed, la ville dans le dictionnaire du
 * pied de page. Trois endroits à corriger le jour d'un déménagement, et rien
 * pour signaler celui qu'on oublie.
 *
 * Ce qui reste dans les dictionnaires : les LIBELLÉS (« Téléphone »,
 * « Nous trouver »), qui se traduisent. Un numéro et une latitude, non.
 */

/** Composable d'un clic : `tel:` n'accepte ni espaces ni parenthèses. */
export const SITE_PHONE = "+2250505592052";
/** Forme lue par un humain. */
export const SITE_PHONE_DISPLAY = "+225 05 05 59 20 52";

export const SITE_GEO = { lat: 5.3453013, lng: -4.03603 } as const;
export const SITE_STREET = "330 Rue Nicolas Amenin, Attécoubé";
export const SITE_CITY = "Abidjan, Côte d'Ivoire";

/** Forme documentée par Google (« Maps URLs »), stable et sans clé d'API. */
export const SITE_MAP_URL = `https://www.google.com/maps/search/?api=1&query=${SITE_GEO.lat},${SITE_GEO.lng}`;
export const SITE_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${SITE_GEO.lat},${SITE_GEO.lng}`;

/** Réseaux publics, dans l'ordre d'affichage. */
export const SITE_SOCIALS = [
  { href: "https://www.youtube.com/@SafeLinkHub", label: "YouTube" },
  { href: "https://x.com/safelinkhub", label: "X" },
  { href: "https://linkedin.com/company/safelinkhub", label: "LinkedIn" },
  { href: "https://tiktok.com/@safelinkhub", label: "TikTok" },
] as const;
