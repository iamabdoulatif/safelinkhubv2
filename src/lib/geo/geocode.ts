/**
 * Géocodage — Nominatim (OpenStreetMap).
 *
 * POURQUOI CELUI-LÀ : aucune clé, aucune facturation, et c'est le seul service
 * gratuit qui couvre correctement les quartiers d'Abidjan. Google Maps exige
 * une clé facturable et un compte de facturation actif ; pour remplir quatre
 * champs d'adresse à l'enregistrement d'un routeur, ce serait un abonnement
 * pour rien.
 *
 * APPELÉ DEPUIS LE SERVEUR, jamais du navigateur : la politique d'usage de
 * Nominatim exige un `User-Agent` qui identifie l'application et joignable en
 * cas d'abus. Depuis un navigateur, l'en-tête serait celui du visiteur — et
 * l'IP de chaque opérateur prendrait la limite de débit pour notre compte.
 *
 * Rien n'est mis en cache ici : un opérateur enregistre un routeur, pas mille.
 * ponytail: pas de cache ni de file d'attente, à ajouter si le parc grossit au
 * point de frôler la limite d'une requête par seconde.
 */

const BASE = "https://nominatim.openstreetmap.org";
const UA = "SafeLinkHub/1.0 (https://safelinkhub.io; contact@safelinkhub.io)";

export type GeoAddress = {
  street: string;
  neighbourhood: string;
  commune: string;
  country: string;
};

export type GeoPlace = GeoAddress & {
  latitude: number;
  longitude: number;
  /** Libellé complet renvoyé par Nominatim, pour l'affichage du choix. */
  label: string;
};

/** Réponse Nominatim, réduite à ce qu'on lit. */
type NominatimPlace = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: Record<string, string | undefined>;
};

/**
 * Range l'adresse Nominatim dans les quatre lignes qu'on affiche.
 *
 * Nominatim ne garantit AUCUNE de ses clés, et le découpage administratif
 * ivoirien n'y entre pas proprement. Relevé sur le service réel :
 *
 *   330 Rue Nicolas Amenin → { road, neighbourhood: "Quartier La Paix",
 *                              suburb: "Banco nord", city: "Abidjan" }
 *   Angré, Cocody          → { road, quarter: "Cité Sicogi 1001 logements",
 *                              suburb: "Angré", city: "Abidjan" }
 *
 * La COMMUNE (Attécoubé, Cocody) n'apparaît dans aucune clé — seulement dans
 * le libellé complet. On prend donc les deux échelons les plus fins et
 * DISJOINTS : le quartier au niveau `neighbourhood`/`quarter`, la commune au
 * niveau `suburb` juste au-dessus. « Angré » situe mieux un technicien
 * qu'« Abidjan », qui compte six millions d'habitants. Les quatre champs
 * restent modifiables : c'est un pré-remplissage, pas une vérité.
 */
export function parseAddress(address: Record<string, string | undefined> = {}): GeoAddress {
  const first = (...keys: string[]) => {
    for (const key of keys) {
      const value = address[key]?.trim();
      if (value) return value;
    }
    return "";
  };

  const numero = first("house_number");
  const rue = first("road", "pedestrian", "footway", "residential");

  return {
    // « 330 Rue Nicolas Amenin » plutôt que deux champs : c'est ainsi qu'une
    // adresse se lit et se dicte à un technicien.
    street: [numero, rue].filter(Boolean).join(" "),
    neighbourhood: first("neighbourhood", "quarter", "city_block", "residential"),
    commune: first("suburb", "city_district", "municipality", "town", "village", "city", "county"),
    country: first("country"),
  };
}

function toPlace(raw: NominatimPlace): GeoPlace | null {
  const latitude = Number(raw.lat);
  const longitude = Number(raw.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    label: raw.display_name?.trim() || "",
    ...parseAddress(raw.address),
  };
}

async function ask(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    // Le service est lent par moments ; au-delà, l'opérateur saisit à la main.
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  return response.json();
}

/** Cherche une adresse libre (« rue nicolas amenin abidjan »). */
export async function searchPlaces(query: string, limit = 5): Promise<GeoPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const data = await ask("/search", {
    q: trimmed,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    "accept-language": "fr",
  });
  if (!Array.isArray(data)) return [];
  return data.map((raw) => toPlace(raw as NominatimPlace)).filter((p): p is GeoPlace => p !== null);
}

/** Retrouve l'adresse d'un point — le chemin du bouton « ma position ». */
export async function reverseGeocode(latitude: number, longitude: number): Promise<GeoPlace | null> {
  if (!isValidCoordinate(latitude, longitude)) return null;
  const data = await ask("/reverse", {
    lat: String(latitude),
    lon: String(longitude),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18",
    "accept-language": "fr",
  });
  const place = toPlace((data ?? {}) as NominatimPlace);
  // Le point demandé fait autorité : Nominatim renvoie celui de l'objet
  // trouvé (le centre de la rue), qui peut être à 50 m du routeur.
  return place ? { ...place, latitude, longitude } : null;
}

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    // 0,0 est au large du Ghana : c'est la signature d'un champ vide, pas d'un
    // routeur. Le refuser évite d'enregistrer une zone dans l'Atlantique.
    !(latitude === 0 && longitude === 0)
  );
}
