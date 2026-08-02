import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { ocrLabelImage } from "@/lib/mikrotik/label-ocr";
import { parseMikrotikLabel } from "@/lib/mikrotik/label-parse";

// Scan de l'étiquette usine MikroTik : le navigateur envoie la photo (champ
// `image`), le serveur l'OCR via Textract puis renvoie les champs parsés
// (modèle, SN, user, MOT DE PASSE par défaut, clé WiFi, MACs). Réservé admin.
// L'image n'est pas persistée : OCR à la volée, puis jetée.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Textract synchrone plafonne ~5 Mo — on borne côté route (photos compressées).
const MAX_BYTES = 5_000_000;

export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return Response.json({ error: "Non authentifié." }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("image");
    if (value instanceof File) file = value;
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!file) return Response.json({ error: "Aucune image reçue." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: "Image trop lourde (max 5 Mo). Rapprochez-vous de l'étiquette." },
      { status: 413 },
    );
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = await ocrLabelImage(bytes);
    const label = parseMikrotikLabel(text);
    return Response.json({ label });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Échec de l'analyse de l'image." },
      { status: 500 },
    );
  }
}
