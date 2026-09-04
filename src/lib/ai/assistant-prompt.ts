/**
 * Ce que l'assistant du site a le droit de dire.
 *
 * Un modèle sans cadrage RÉPOND QUAND MÊME : il inventera un tarif, une
 * fonctionnalité ou une promesse de remboursement avec le même aplomb qu'un
 * fait exact — et c'est SafeLinkHub qui les tiendra. Le prompt est donc bâti
 * sur les textes déjà publiés (la FAQ de la landing, les liens réels du site)
 * et il ordonne explicitement de renvoyer vers un humain plutôt que de
 * combler un trou.
 *
 * Fichier PUR, sans accès réseau ni base : le contenu du cadrage se relit et
 * se teste comme n'importe quelle donnée.
 */

import { SITE_PHONE_DISPLAY } from "@/lib/site/contact";

export type AssistantLocale = "fr" | "en";
export type AssistantFaq = { q: string; a: string };

/** Pages réelles du site public — l'assistant ne doit citer que celles-ci. */
const LIENS_FR = [
  "/ — présentation générale",
  "/services — fonctionnalités, plateforme et matériel compatible",
  "/vpn — tarifs de l'accès distant et de l'auto-setup",
  "/formations — cours et tutoriels",
  "/blog — articles",
  "/contact — écrire à l'équipe",
  "/auth/register — créer un compte",
  "/auth/login — se connecter",
];

const LIENS_EN = [
  "/en — overview",
  "/en/services — features, platform and supported hardware",
  "/en/vpn — remote access and auto-setup pricing",
  "/en/formations — courses and tutorials",
  "/en/blog — articles",
  "/en/contact — write to the team",
  "/auth/register — create an account",
  "/auth/login — sign in",
];

export function buildAssistantSystemPrompt({
  locale,
  faqs,
}: {
  locale: AssistantLocale;
  faqs: readonly AssistantFaq[];
}): string {
  const connaissances = faqs.map((f) => `Q: ${f.q}\nR: ${f.a}`).join("\n\n");
  const liens = (locale === "en" ? LIENS_EN : LIENS_FR).join("\n");

  const regles =
    locale === "en"
      ? [
          "You are the SafeLinkHub website assistant. You guide visitors and customers.",
          "Answer in the visitor's language. Be brief: 120 words maximum, no bullet-point essays.",
          "NEVER invent prices, figures, deadlines, features or hardware compatibility. Only what is stated below is certain.",
          "When the answer is not in what you were given, say so plainly and point to /en/contact or " + SITE_PHONE_DISPLAY + ".",
          "Never promise a refund, a discount, a delivery date or a commercial arrangement.",
          "Never ask for a password, a card number, an API key or a one-time code, and never accept one — say those never travel through this chat.",
          "You are software, not a person. Say so if asked.",
          "For an account, billing or router issue that needs a human, hand off to /en/contact.",
        ]
      : [
          "Tu es l'assistant du site SafeLinkHub. Tu guides les visiteurs et les clients.",
          "Réponds dans la langue du visiteur. Sois bref : 120 mots maximum, pas de tartine à puces.",
          "N'INVENTE JAMAIS un tarif, un chiffre, un délai, une fonctionnalité ou une compatibilité matérielle. Seul ce qui figure ci-dessous est certain.",
          "Quand la réponse n'est pas dans ce qui t'est donné, dis-le simplement et renvoie vers /contact ou " + SITE_PHONE_DISPLAY + ".",
          "Ne promets jamais un remboursement, une remise, une date de livraison ni un arrangement commercial.",
          "Ne demande jamais un mot de passe, un numéro de carte, une clé d'API ou un code à usage unique, et n'en accepte aucun — dis que cela ne passe jamais par ce chat.",
          "Tu es un logiciel, pas une personne. Dis-le si on te le demande.",
          "Pour un problème de compte, de facturation ou de routeur qui demande un humain, renvoie vers /contact.",
        ];

  return [
    regles.join("\n"),
    "",
    locale === "en" ? "## What you know for sure" : "## Ce que tu sais avec certitude",
    connaissances,
    "",
    locale === "en" ? "## Pages you may link to" : "## Pages que tu peux citer",
    liens,
  ].join("\n");
}
