# Utilisateurs — annuaire de gestion

Demande : appliquer la meilleure refonte UI/UX à /admin/users, en conservant la charte SafeLinkHub.

Approche retenue : un annuaire structuré, adapté à une gestion quotidienne plutôt qu'un assistant par étapes. En-tête compact, repères réduits, recherche et filtre de rôle regroupés avec les filtres VPN existants. Les rôles restent visibles sur chaque ligne. La liste se présente comme un registre aligné sur grand écran et des lignes lisibles sur téléphone, sans duplication des identités. Pagination de 20 résultats ; l'export porte sur tous les résultats filtrés.

Une fiche latérale native accessible permet de consulter les informations et d'utiliser les actions existantes. Elle reste adaptée au téléphone, ferme avec Échap, rend le fond inerte et restaure le focus. Les liens WhatsApp, la copie de l'e-mail, les réglages de quota et les passes temporaires sont conservés. Une erreur de copie est visible.

Ne modifier aucune permission, aucun périmètre de données et aucun réglage métier. Les données de supervision ciblées et l'exclusion des passes globaux en vue organisation restent inchangées. Les filtres et l'export opèrent uniquement sur les lignes autorisées déjà fournies à la page.
