import { getSession } from "@/lib/auth/session";
import { isValidCoordinate, reverseGeocode, searchPlaces } from "@/lib/geo/geocode";

/**
 * Géocodage pour le formulaire d'enregistrement d'un routeur.
 *
 * RELAIS SERVEUR, et pas un appel direct depuis le navigateur : la politique
 * d'usage de Nominatim exige un User-Agent qui identifie l'application. Depuis
 * le navigateur, ce serait celui de l'opérateur, et son IP prendrait la limite
 * de débit pour notre compte.
 *
 * RÉSERVÉ AUX SESSIONS AUTHENTIFIÉES : ouvert, ce serait un proxy de géocodage
 * gratuit offert à n'importe qui, dont l'abus se paierait par le blocage de
 * notre User-Agent chez Nominatim.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const query = searchParams.get("q");

  try {
    if (lat !== null && lon !== null) {
      const latitude = Number(lat);
      const longitude = Number(lon);
      if (!isValidCoordinate(latitude, longitude)) {
        return Response.json({ error: "Coordonnées invalides." }, { status: 400 });
      }
      const place = await reverseGeocode(latitude, longitude);
      return Response.json({ places: place ? [place] : [] }, { headers: { "cache-control": "no-store" } });
    }

    if (query) {
      return Response.json(
        { places: await searchPlaces(query) },
        { headers: { "cache-control": "no-store" } },
      );
    }

    return Response.json({ error: "Indiquez une recherche ou des coordonnées." }, { status: 400 });
  } catch {
    /* Nominatim injoignable, lent ou en limite de débit : ce n'est pas une
       erreur du serveur, et l'opérateur garde la saisie manuelle. */
    return Response.json({ error: "Service de carte indisponible. Saisissez l'adresse à la main." }, { status: 200 });
  }
}
