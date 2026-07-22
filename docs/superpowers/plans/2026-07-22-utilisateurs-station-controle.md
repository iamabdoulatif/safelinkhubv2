# Station de contrôle Utilisateurs — Plan d’implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** rendre `/admin/users` exploitable au quotidien pour retrouver, filtrer, exporter et ouvrir rapidement les utilisateurs et leurs organisations.

**Architecture:** conserver le chargement serveur existant et déplacer uniquement l’affichage interactif dans un composant client. Les filtres, compteurs et l’export CSV travailleront sur les lignes déjà autorisées par le serveur ; aucune donnée supplémentaire ni nouvelle table n’est nécessaire.

**Tech Stack:** Next.js App Router, React client component, Tailwind existant, Lucide, TypeScript.

---

### Task 1: Extraire la table interactive

**Files:**
- Create: `src/app/admin/users/UsersControlCenter.tsx`
- Modify: `src/app/admin/users/page.tsx`

- [ ] Passer au composant les utilisateurs déjà filtrés par session et par rôle.
- [ ] Ajouter recherche texte, filtres rôle/quota/expiration, compteurs et état vide.
- [ ] Garder le formulaire serveur `VpnQuotaForm` dans les lignes superadmin.

### Task 2: Actions rapides et export

**Files:**
- Modify: `src/app/admin/users/UsersControlCenter.tsx`

- [ ] Ajouter export CSV UTF-8 avec BOM, échappement des guillemets et colonnes nom/email/organisation/rôle/quota/inscription.
- [ ] Ajouter copie email avec confirmation visuelle.
- [ ] Ajouter liens vers `/admin/vpn-access` et `/admin/remote-access` pour le superadmin.
- [ ] Ajouter bouton de remise à zéro des filtres.

### Task 3: Vérification et livraison

**Files:**
- Test: `src/app/admin/users/users-control-center.test.ts`

- [ ] Tester les fonctions pures de filtrage, quota et génération CSV.
- [ ] Exécuter TypeScript, lint ciblé, tests, build Next.js.
- [ ] Committer, pousser sur `main`, publier via `/root/deploy-slh.sh`, puis vérifier le conteneur et les redirections publiques.
