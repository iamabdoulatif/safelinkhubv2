# Fiabiliser la restauration HotSpot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurer fidèlement les données HotSpot d'une sauvegarde SafeLinkHub sur un nouveau MikroTik, sans jamais transmettre de références internes de la source vers les tickets, profils, pools IP ou files de la cible.

**Architecture:** Le moteur lit d'abord le serveur HotSpot cible réellement actif et son pool IP, puis construit une résolution pure `référence source -> nom cible`. Les profils sont synchronisés avec leurs règles métier, mais leurs liaisons locales sont explicitement réconciliées sur la cible avant tout ticket. Les tickets, y compris ceux qui existent déjà, sont ensuite réécrits depuis la source avec uniquement le profil et le serveur résolus. Une relecture de contrôle conditionne les schedulers et la reprise des sessions.

**Tech Stack:** Next.js App Router, TypeScript, RouterOS API, Drizzle/Neon pour le suivi de job, `node:test` exécuté avec `tsx`.

---

## Principes non négociables

- La restauration ne modifie ni bridge, interfaces, radios, IP, pools, DHCP, NAT, firewall, tunnel, conteneur ni portail de la cible.
- Le serveur HotSpot cible doit être unique, activé et posséder un `address-pool` non vide. Sinon le pré-vol est bloqué ; l'option historique `force` ne peut pas contourner ce blocage métier.
- Un `profile`, `server`, `address-pool` ou `parent-queue` sous forme d'ID RouterOS de la source (par exemple `*12`) ne doit jamais être envoyé à la cible.
- Le comportement d'un forfait provient de la source. Ses liaisons à la topologie proviennent de la cible : chaque profil restauré reçoit le pool du serveur cible ; son `parent-queue` existant est conservé seulement s'il est une valeur locale nommée, sinon il devient `none` et l'adaptation est signalée.
- Les cookies réels ne sont pas insérables via l'API RouterOS. Le flux logique ne promet donc que des sessions temporaires vérifiées ; la continuité de cookies reste soumise au mode binaire compatible et à la même réconciliation post-redémarrage.

## File structure

- Create: `src/lib/mikrotik/hotspot-restore-reconciliation.ts` — règles pures de pré-vol, traduction de références et construction des écritures sûres.
- Create: `src/lib/mikrotik/hotspot-restore-reconciliation.test.ts` — matrice de tests rouge/vert de ces règles sans routeur réel.
- Modify: `src/lib/mikrotik/router-preflight.ts` — expose le serveur HotSpot cible et son pool dans le scan, et bloque une cible ambiguë ou sans pool.
- Modify: `src/lib/mikrotik/router-preflight.test.ts` — couvre le nouveau contrat de planification si le scan est représenté dans les fixtures.
- Modify: `src/lib/mikrotik/router-backup.ts` — orchestre le pré-vol, la synchronisation de profils, la réconciliation de leurs liaisons locales, la restauration source-prioritaire des tickets et la post-vérification.
- Modify: `src/lib/mikrotik/router-backup.test.ts` — couvre l'ordre, l'idempotence et les correctifs pour les tickets déjà présents.
- Modify: `src/app/admin/router/backups/BackupsManager.tsx` — rend lisible la phase et les erreurs de liaison HotSpot dans le rapport de restauration.
- Modify: `src/app/admin/router/backups/restore-topology-model.ts` et `src/app/admin/router/backups/restore-topology-model.test.ts` si le plan doit afficher l'état « serveur/pool cible validé ».

## Task 1: Modéliser les liaisons HotSpot de la cible et les références source

**Files:**

- Create: `src/lib/mikrotik/hotspot-restore-reconciliation.ts`
- Create: `src/lib/mikrotik/hotspot-restore-reconciliation.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent.**

  Construire des fixtures minimales contenant des profils source `{".id":"*1","name":"05-JOURS"}`, des tickets référant tantôt `*1`, tantôt `05-JOURS`, ainsi qu'un serveur cible `hotspot1` avec le pool `POOL-HOTSPOT`. Vérifier que :

  ```ts
  assert.deepEqual(preflight.tickets[0], {
    name: "5jyw82",
    profile: "05-JOURS",
    server: "hotspot1",
  });
  ```

  Ajouter les cas négatifs : profil source absent, ticket sans profil, deux serveurs actifs, aucun serveur actif, pool vide, et profil cible manquant après synchronisation. Tous doivent renvoyer des blocages nommés, jamais une écriture prête à envoyer.

- [ ] **Step 2: Lancer le test pour constater l'échec.**

  Run: `npm test -- src/lib/mikrotik/hotspot-restore-reconciliation.test.ts`

  Expected: échec d'import ou d'assertion car le module de réconciliation n'existe pas encore.

- [ ] **Step 3: Implémenter les fonctions pures minimales.**

  Définir des types sérialisables, sans client RouterOS :

  ```ts
  export type TargetHotspotBinding = { server: string; addressPool: string };
  export type ResolvedHotspotTicket = { name: string; profile: string; server: string; fields: Record<string, string> };
  export function prepareHotspotRestore(/* source + profils/serveurs cible */): {
    blockers: string[];
    tickets: ResolvedHotspotTicket[];
    profileBindings: { name: string; addressPool: string; parentQueue: string }[];
  };
  ```

  La fonction doit : indexer les noms et IDs source, accepter seulement les profils source réellement déclarés, convertir les tickets vers le nom de profil cible et vers le serveur cible, et préparer pour chaque profil non système `address-pool=POOL-HOTSPOT` (le nom lu sur la cible). Elle doit conserver un `parent-queue` cible nommé ; une valeur interne `*…`, vide ou non disponible devient `none` et est comptée comme adaptation. Elle ne doit pas lire ni modifier le réseau.

- [ ] **Step 4: Relancer les tests ciblés.**

  Run: `npm test -- src/lib/mikrotik/hotspot-restore-reconciliation.test.ts`

  Expected: succès ; les variantes ID/nom donnent la même écriture sûre et tous les cas ambigus sont bloqués.

- [ ] **Step 5: Committer le premier incrément testé.**

  ```bash
  git add src/lib/mikrotik/hotspot-restore-reconciliation.ts src/lib/mikrotik/hotspot-restore-reconciliation.test.ts
  git commit -m "feat(mikrotik): resolve hotspot restore references safely"
  ```

## Task 2: Rendre le pré-vol matériel conscient du serveur et du pool cible

**Files:**

- Modify: `src/lib/mikrotik/router-preflight.ts`
- Modify: `src/lib/mikrotik/router-preflight.test.ts`
- Modify: `src/app/admin/router/backups/restore-topology-model.ts`
- Modify: `src/app/admin/router/backups/restore-topology-model.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent.**

  Ajouter au scan mocké les HotSpot activés et vérifier que `buildRestorePlan` :

  - accepte exactement un serveur avec `address-pool` renseigné ;
  - bloque zéro ou plusieurs serveurs activés quand la sauvegarde porte des tickets ;
  - bloque un serveur sans pool ;
  - expose le nom du serveur et du pool validés dans le plan de restauration.

- [ ] **Step 2: Lancer les tests ciblés pour constater l'échec.**

  Run: `npm test -- src/lib/mikrotik/router-preflight.test.ts src/app/admin/router/backups/restore-topology-model.test.ts`

  Expected: le type `HardwareScan` ne porte pas encore la liaison HotSpot et les nouveaux tests échouent.

- [ ] **Step 3: Étendre le scan et le plan sans toucher à la configuration cible.**

  Dans `scanRouterHardware`, demander uniquement `.id,name,disabled,address-pool` sur `/ip/hotspot/print`, filtrer strictement `disabled !== "true"`, puis exposer les serveurs activés dans `HardwareScan`. Ajouter à `RestorePlan` une liaison optionnelle :

  ```ts
  hotspot: { server: string | null; addressPool: string | null; validated: boolean };
  ```

  `buildRestorePlan` ajoute un blocker explicite avant la moindre écriture pour les cas non résolus. L'UI de topologie affiche ce contrôle comme adaptation sûre ou blocage, sans révéler de secret ni d'adresse de gestion.

- [ ] **Step 4: Relancer les tests ciblés.**

  Run: `npm test -- src/lib/mikrotik/router-preflight.test.ts src/app/admin/router/backups/restore-topology-model.test.ts`

  Expected: succès et couverture des trois préconditions réseau.

- [ ] **Step 5: Committer le deuxième incrément testé.**

  ```bash
  git add src/lib/mikrotik/router-preflight.ts src/lib/mikrotik/router-preflight.test.ts src/app/admin/router/backups/restore-topology-model.ts src/app/admin/router/backups/restore-topology-model.test.ts
  git commit -m "feat(mikrotik): preflight target hotspot pool"
  ```

## Task 3: Réconcilier les profils puis restaurer les tickets avec priorité source

**Files:**

- Modify: `src/lib/mikrotik/router-backup.ts`
- Modify: `src/lib/mikrotik/router-backup.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent.**

  Étendre les tests du moteur autour de ces séquences :

  1. un profil restauré contenant `address-pool=*1` est réécrit vers `POOL-HOTSPOT` avant tout `/ip/hotspot/user/add` ;
  2. un ticket nouveau référant `profile=*1,server=hotspot-source` devient `profile=05-JOURS,server=hotspot1` ;
  3. un ticket homonyme reçoit à nouveau mot de passe, profil, serveur, statut, commentaire et limites de la source ;
  4. une cible sans pool, ou un profil impossible à relire après synchronisation, ne déclenche aucune écriture de ticket, scheduler ou session ;
  5. après écriture, un profil dont le pool ne correspond pas et un ticket dont le profil/serveur ne correspond pas font échouer la restauration ;
  6. une relance identique n'introduit pas de divergence.

- [ ] **Step 2: Lancer le test ciblé pour constater l'échec.**

  Run: `npm test -- src/lib/mikrotik/router-backup.test.ts`

  Expected: les assertions montrent que `restoreNamed` laisse les tickets homonymes intacts et transmet encore des références source brutes.

- [ ] **Step 3: Intégrer la réconciliation au moteur.**

  Réorganiser `restoreBackupToRouter` dans cet ordre strict :

  ```text
  scan + pré-vol résolu
  → synchronisation des profils
  → relecture des profils cible + address-pool/parent-queue sûrs
  → résolution finale et écriture source-prioritaire des tickets
  → relecture de vérification profils/pool/tickets
  → schedulers puis sessions
  ```

  Remplacer l'appel générique `restoreNamed` des utilisateurs par une fonction dédiée qui utilise les `ResolvedHotspotTicket` préparés. Pour une ligne existante, utiliser son `.id` cible avec `/ip/hotspot/user/set`; pour une nouvelle, `/ip/hotspot/user/add`. Ne jamais inclure les champs `profile` ou `server` bruts du backup : ils sont écrasés par les valeurs résolues. Faire de `repairDanglingHotspotUserProfiles` une réparation de compatibilité postérieure, ou la remplacer par l'alignement source-prioritaire afin que les tickets `unknown` historiques soient aussi corrigés.

  Ajouter une fonction de vérification qui relit les profils et tickets concernés. Elle compare au minimum le profil, le serveur, le pool du profil et tous les champs de ticket effectivement envoyés. Au premier écart, retourner une erreur explicite et ne pas lancer schedulers ni reprise de session.

- [ ] **Step 4: Relancer les tests ciblés.**

  Run: `npm test -- src/lib/mikrotik/router-backup.test.ts src/lib/mikrotik/hotspot-restore-reconciliation.test.ts`

  Expected: succès ; les anciens tickets `unknown`, les références de pool orphelines et les tickets homonymes sont tous réalignés sans toucher aux objets réseau de la cible.

- [ ] **Step 5: Committer le troisième incrément testé.**

  ```bash
  git add src/lib/mikrotik/router-backup.ts src/lib/mikrotik/router-backup.test.ts
  git commit -m "fix(mikrotik): verify restored ticket target bindings"
  ```

## Task 4: Exposer l'état de liaison et empêcher les faux succès

**Files:**

- Modify: `src/lib/mikrotik/router-backup.ts`
- Modify: `src/lib/mikrotik/backup-actions.ts`
- Modify: `src/app/admin/router/backups/BackupsManager.tsx`
- Modify: tests concernés dans `src/lib/mikrotik/*.test.ts` et `src/app/admin/router/backups/*.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent.**

  Définir une phase `hotspotTargetBindings` et un rapport contenant les profils dont le pool a été lié, les `parent-queue` adaptés, les tickets vérifiés et les blocages. Vérifier côté modèle/UI qu'un job bloqué affiche l'erreur de liaison avant tout message « Restauration terminée ».

- [ ] **Step 2: Lancer les tests concernés pour constater l'échec.**

  Run: `npm test -- src/app/admin/router/backups/restore-topology-model.test.ts src/lib/mikrotik/router-backup.test.ts`

  Expected: phase ou libellé manquant dans le rapport.

- [ ] **Step 3: Implémenter le rapport de vérité.**

  Étendre `RestoreProgress`, la persistance du job et `SECTION_LABELS` avec un libellé clair (« liaisons serveur et pool des profils »). Faire remonter le détail des tickets bloquants depuis le pré-vol, plutôt qu'un succès partiel. Conserver la compatibilité de lecture des anciens jobs dont ce champ n'existe pas.

- [ ] **Step 4: Relancer les tests ciblés.**

  Run: `npm test -- src/app/admin/router/backups/restore-topology-model.test.ts src/lib/mikrotik/router-backup.test.ts`

  Expected: succès et aucun faux message de fin lorsqu'un post-contrôle échoue.

- [ ] **Step 5: Committer le quatrième incrément testé.**

  ```bash
  git add src/lib/mikrotik/router-backup.ts src/lib/mikrotik/backup-actions.ts src/app/admin/router/backups/BackupsManager.tsx src/app/admin/router/backups/restore-topology-model.ts src/app/admin/router/backups/restore-topology-model.test.ts
  git commit -m "feat(backups): report hotspot restore binding checks"
  ```

## Task 5: Vérification complète et livraison contrôlée

**Files:**

- Modify: fichiers effectivement ajustés par les étapes précédentes.

- [ ] **Step 1: Vérifier les diffs et les instructions du projet.**

  Run: `git diff --check && git status --short`

  Expected: aucun espace invalide ; seuls les fichiers de la fonctionnalité sont modifiés.

- [ ] **Step 2: Exécuter les preuves automatisées fraîches.**

  Run: `npm test && npm run typecheck && npm run lint && npm run build`

  Expected: toutes les suites passent. Toute alerte préexistante est distinguée d'une régression introduite.

- [ ] **Step 3: Vérifier manuellement le flux de simulation.**

  Sur une sauvegarde non destructive, lancer « Simuler » contre une cible avec un seul HotSpot et vérifier que le plan annonce le serveur et le pool cible. Vérifier séparément qu'une cible à pool vide est bloquée sans qu'aucun ticket ne soit écrit.

- [ ] **Step 4: Créer le commit de livraison.**

  Les commits des tâches 1 à 4 constituent la livraison. Vérifier avec `git status --short` que l'arbre est propre, puis ne créer aucun commit vide. Si une correction de vérification est nécessaire après la suite complète, ne préparer que les fichiers explicitement listés dans les tâches 1 à 4 et créer :

  ```bash
  git add src/lib/mikrotik/hotspot-restore-reconciliation.ts src/lib/mikrotik/hotspot-restore-reconciliation.test.ts src/lib/mikrotik/router-preflight.ts src/lib/mikrotik/router-preflight.test.ts src/lib/mikrotik/router-backup.ts src/lib/mikrotik/router-backup.test.ts src/lib/mikrotik/backup-actions.ts src/app/admin/router/backups/BackupsManager.tsx src/app/admin/router/backups/restore-topology-model.ts src/app/admin/router/backups/restore-topology-model.test.ts
  git commit -m "fix(mikrotik): make cross-router hotspot restores safe"
  ```

- [ ] **Step 5: Déployer uniquement avec l'accord déjà donné pour le VPS.**

  Transférer le commit validé vers le flux de déploiement VPS existant, vérifier une réponse HTTP 200 de `https://www.safelinkhub.io`, puis documenter le numéro de version et les résultats de vérification. Ne pas utiliser Vercel.

## Revue du plan

- La cause observée (`no address from ip pool`) est couverte par un pré-vol, une écriture de liaison explicite et une post-vérification.
- Les références internes `profile=*…` et `server` source sont traduites avant l'écriture de chaque ticket, y compris les tickets homonymes déjà présents.
- Les objets de topologie restent sur le routeur cible : seule la référence contenue dans un profil est adaptée vers sa ressource déjà active.
- Les sessions et schedulers sont volontairement après la vérification des tickets ; aucun accès temporaire n'est créé à partir d'un ticket douteux.
- Les tests isolent la logique sans nécessiter de routeur, puis couvrent l'orchestration et l'interface de suivi.
