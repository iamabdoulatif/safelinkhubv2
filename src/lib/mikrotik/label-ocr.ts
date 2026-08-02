import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";

/**
 * OCR d'une photo d'étiquette MikroTik via AWS Textract (DetectDocumentText).
 * Serveur uniquement : les identifiants AWS ne quittent JAMAIS le serveur
 * (l'image transite navigateur → route SaaS → Textract).
 *
 * Config requise (env) :
 *   AWS_REGION               — ex. eu-west-1
 *   AWS_ACCESS_KEY_ID /      — ou un rôle IAM sur l'hôte (chaîne de creds SDK
 *   AWS_SECRET_ACCESS_KEY       standard : env, profil, rôle EC2…)
 *
 * DetectDocumentText (synchrone) accepte JPEG/PNG jusqu'à ~5 Mo — la route
 * appelante borne la taille.
 */

let cached: TextractClient | null = null;

function client(): TextractClient {
  const region = process.env.AWS_REGION;
  if (!region) throw new Error("AWS_REGION is not set (OCR étiquette indisponible)");
  // Creds résolues par la chaîne standard du SDK (env vars ou rôle IAM).
  cached ??= new TextractClient({ region });
  return cached;
}

/** Renvoie le texte OCR (lignes jointes par \n) d'une image d'étiquette. */
export async function ocrLabelImage(bytes: Uint8Array): Promise<string> {
  const out = await client().send(
    new DetectDocumentTextCommand({ Document: { Bytes: bytes } }),
  );
  return (out.Blocks ?? [])
    .filter((b) => b.BlockType === "LINE" && b.Text)
    .map((b) => b.Text as string)
    .join("\n");
}
