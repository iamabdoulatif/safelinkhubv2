/* Textes de l'habillage, dans les deux langues.
 *
 * Ils ne vivent pas dans les dictionnaires comme le reste du site, et c'est
 * délibéré : le composant est monté par le LAYOUT RACINE, qui ignore la langue
 * de la route (les pages anglaises vivent sous /en, pas sous app/[lang]). Le
 * dictionnaire devrait donc être chargé DEUX fois côté client pour douze
 * libellés. La langue se déduit du chemin, exactement comme localeHref. */
export const UI = {
  fr: {
    open: "Ouvrir l'assistant SafeLinkHub",
    close: "Fermer l'assistant",
    title: "Assistant SafeLinkHub",
    subtitle: "Réponses sur le produit, les tarifs et la mise en route.",
    placeholder: "Posez votre question…",
    send: "Envoyer",
    transcript: "Conversation avec l'assistant",
    intro: "Bonjour ! Je réponds sur SafeLinkHub — offre, tarifs, matériel compatible, mise en route.",
    suggestions: [
      "Comment démarrer avec SafeLinkHub ?",
      "Quels routeurs sont compatibles ?",
      "Qu'est-ce que le Safecoin ?",
    ],
    disclaimer: "Assistant automatique. Pour un cas précis,",
    human: "écrivez à l'équipe",
    retry: "Réessayer",
    error: "L'assistant est indisponible pour le moment.",
  },
  en: {
    open: "Open the SafeLinkHub assistant",
    close: "Close the assistant",
    title: "SafeLinkHub assistant",
    subtitle: "Answers about the product, pricing and getting started.",
    placeholder: "Ask your question…",
    send: "Send",
    transcript: "Conversation with the assistant",
    intro: "Hi! I answer questions about SafeLinkHub — plans, pricing, supported hardware, getting started.",
    suggestions: [
      "How do I get started with SafeLinkHub?",
      "Which routers are supported?",
      "What is Safecoin?",
    ],
    disclaimer: "Automated assistant. For a specific case,",
    human: "write to the team",
    retry: "Retry",
    error: "The assistant is unavailable right now.",
  },
} as const;

export type AssistantUiLocale = keyof typeof UI;

