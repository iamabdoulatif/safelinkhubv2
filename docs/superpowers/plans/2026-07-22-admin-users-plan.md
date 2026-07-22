# Refonte Admin Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réorganiser la station `/admin/users` pour rendre la supervision des comptes, des quotas et des passes temporaires plus aérée et plus rapide à parcourir.

**Architecture:** Conserver les données et actions actuelles. Recomposer uniquement le composant client `UsersControlCenter` avec une hiérarchie en cinq zones, un résumé superadmin repliable et des primitives visuelles locales cohérentes avec les tokens SafeLinkHub.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, lucide-react, tests `node:test`.

---

### Task 1: Recomposer l’en-tête et les métriques

**Files:**
- Modify: `src/app/admin/users/UsersControlCenter.tsx`

- [x] **Step 1: Remplacer le bloc d’en-tête et la grille métrique**

Garder les deux actions existantes, mais placer le titre dans une colonne plus large et les indicateurs dans une bande `border-y` avec des séparateurs internes. Utiliser `font-display` pour le titre et réserver `bg-brand` à l’indicateur « à surveiller ».

- [x] **Step 2: Vérifier le rendu TypeScript**

Run: `npx tsc --noEmit --pretty false`
Expected: exit code 0.

### Task 2: Replier le bloc de passes temporaires pour le superadmin

**Files:**
- Modify: `src/app/admin/users/UsersControlCenter.tsx`

- [x] **Step 1: Encapsuler `TemporaryAccessPasses` dans un `<details>`**

Afficher par défaut un résumé avec l’icône cadeau, le titre, le texte « promo, parrainage, récompense ou intervention » et le nombre de passes. Déplacer le composant complet dans `details` avec `open={false}` et ne pas modifier ses propriétés ni ses actions.

- [x] **Step 2: Vérifier l’accessibilité native**

Utiliser un `<summary>` réellement cliquable, sans bouton imbriqué, avec un texte explicite et une indication visuelle d’ouverture.

### Task 3: Clarifier la barre de recherche, les filtres et le tableau

**Files:**
- Modify: `src/app/admin/users/UsersControlCenter.tsx`

- [x] **Step 1: Donner à la recherche une priorité visuelle unique**

Mettre le champ sur une ligne pleine largeur, puis placer compteur, réinitialisation et segments de filtre dans une seconde ligne responsive. Les filtres existants et leurs compteurs restent inchangés.

- [x] **Step 2: Alléger le tableau**

Augmenter légèrement le padding vertical, réduire les bordures concurrentes, aligner quota/actions, garder le scroll horizontal et conserver la version mobile existante.

### Task 4: Vérifier la refonte

**Files:**
- Test: `src/app/admin/users/users-control-center.test.ts`

- [x] **Step 1: Exécuter les tests existants**

Run: `node --import tsx --test src/app/admin/users/users-control-center.test.ts`
Expected: all tests pass.

- [x] **Step 2: Exécuter lint, typecheck et build**

Run: `npm run lint -- --no-cache && npx tsc --noEmit --pretty false && npm run build`
Expected: exit code 0 with no ESLint errors.

- [x] **Step 3: Committer la refonte**

```bash
git add src/app/admin/users/UsersControlCenter.tsx
git commit -m "refactor: aerer la station utilisateurs"
```
