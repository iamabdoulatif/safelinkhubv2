/**
 * Parseur de l'étiquette usine MikroTik (le « guide » collé sur l'appareil /
 * la notice). À partir du texte OCR brut, extrait les champs utiles pour lier
 * un routeur : modèle, numéro de série, identifiant, MOT DE PASSE PAR DÉFAUT,
 * clé WiFi, adresses MAC.
 *
 * Exemple d'étiquette (hAP ax lite) :
 *   hAP ax lite
 *   ID: L41G-2axD
 *   E01: D0:EA:11:0C:0D:34
 *   W01: D0:EA:11:0C:0D:38
 *   SN: HM20B4WW6JV
 *   User: admin
 *   Password: NULEMHXATW
 *   Wifi key: 2A72FRJ9XQ
 *
 * Fonction PURE : pas d'I/O, pas d'OCR ici (l'OCR se fait côté route serveur).
 * L'appelant DOIT laisser l'utilisateur vérifier les valeurs avant
 * enregistrement — l'OCR peut confondre O/0, I/1/l sur un mot de passe.
 */

export type MikrotikLabel = {
  model: string | null;
  serial: string | null;
  username: string | null;
  password: string | null;
  wifiKey: string | null;
  macs: string[];
};

/** Première capture d'un motif sur l'ensemble du texte, nettoyée. */
function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1] ? m[1].trim() : null;
}

// Libellés de champ connus — servent à écarter ces lignes du candidat « modèle ».
const FIELD_LINE =
  /^\s*(id|e\d+|w\d+|sn|s\/n|user|password|wi[\s-]?fi|mac|manufacturer|mikrotik)\b/i;

function extractModel(lines: string[]): string | null {
  // Le modèle est en général la 1ʳᵉ ligne « libre » (ex. "hAP ax lite"), juste
  // avant "ID:". On prend la ligne non vide qui n'est pas un libellé connu.
  const idIndex = lines.findIndex((l) => /^\s*id\s*[:.]/i.test(l));
  if (idIndex > 0) {
    for (let i = idIndex - 1; i >= 0; i--) {
      const candidate = lines[i].trim();
      if (candidate && !FIELD_LINE.test(candidate)) return candidate;
    }
  }
  for (const l of lines) {
    const candidate = l.trim();
    if (candidate && !FIELD_LINE.test(candidate)) return candidate;
  }
  return null;
}

export function parseMikrotikLabel(ocrText: string): MikrotikLabel {
  const text = ocrText ?? "";
  const lines = text.split(/\r?\n/);

  // Valeurs = suite de caractères alphanumériques (les codes MikroTik sont en
  // MAJ + chiffres) ; l'identifiant tolère . _ - (ex. "admin").
  const serial = firstMatch(text, /\bS\s*\/?\s*N\s*[:.]?\s*([A-Za-z0-9]{5,})/i);
  const password = firstMatch(text, /\bpassw[o0]rd\s*[:.]?\s*([A-Za-z0-9]{5,})/i);
  const wifiKey = firstMatch(text, /\bwi[\s-]?fi\s*key\s*[:.]?\s*([A-Za-z0-9]{5,})/i);
  const username = firstMatch(text, /\buser\s*(?:name)?\s*[:.]?\s*([A-Za-z0-9._-]{2,})/i);

  const macs = [
    ...new Set(
      (text.match(/\b[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}\b/g) ?? []).map((m) => m.toUpperCase()),
    ),
  ];

  return {
    model: extractModel(lines),
    serial,
    username,
    password,
    wifiKey,
    macs,
  };
}
