# Reprise sécurisée des accès VPN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au Superadmin de retrouver/transmettre les accès VPN et à un client de remplacer un MikroTik endommagé en conservant ses services payés, leurs ports et leurs dates.

**Architecture:** Ajouter une reprise persistée entre un routeur source et un routeur de remplacement. Le remplacement reçoit toujours une nouvelle clé WireGuard/OpenVPN ; le callback connecté transfère les forwards existants, révoque l'ancien pair et termine la reprise de façon idempotente. Une page Superadmin dédiée révèle les identifiants uniquement via Server Action et journalise les actions sans secret.

**Tech Stack:** Next.js App Router 16 Server Components/Actions, Drizzle + PostgreSQL Neon HTTP, RouterOS, relais iptables/nginx, React/Tailwind/Lucide.

---

### Task 1: Schéma et migration additive

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `scripts/add-vpn-recovery.sql`

- [ ] Ajouter `routerReplacements` et `vpnAccessAudits`, avec références organisation/routeur/utilisateur, états et horodatages. Les audits ne contiennent aucune donnée secrète.
- [ ] Ajouter les index SQL et la migration PostgreSQL idempotente avec `create table if not exists` et `create index if not exists`.
- [ ] Vérifier `git diff --check`.

### Task 2: Domaine pur de reprise et tests rouges

**Files:**
- Create: `src/lib/mikrotik/router-replacement.ts`
- Create: `src/lib/mikrotik/router-replacement.test.ts`

- [ ] Écrire d'abord les tests des transitions `pending → installing → completed`, du refus d'une seconde reprise, de l'absence de transfert avant connexion et de la conservation de `publicPort`, `billingPeriod` et `expiresAt`.
- [ ] Exécuter `node_modules/.bin/tsx --test src/lib/mikrotik/router-replacement.test.ts` et constater l'échec attendu du module absent.
- [ ] Implémenter les fonctions pures `canStartReplacement`, `replacementTransferRows` et `nextReplacementStatus` avec transitions explicites.
- [ ] Relancer le test et obtenir le vert.

### Task 3: Relay et finalisation idempotente

**Files:**
- Modify: `src/lib/mikrotik/relay.ts`
- Modify: `src/lib/mikrotik/router-replacement.ts`
- Modify: `src/app/api/router/v1/[slug]/scripts/install-vpn/installed/route.ts`
- Modify: `src/app/api/router/v1/[slug]/scripts/install-openvpn/installed/route.ts`

- [ ] Ajouter `rebindPortForwards(oldTunnelIp, newTunnelIp, rows)`. Le shell insère les nouvelles règles aux mêmes ports avant de retirer les anciennes, utilise `iptables -C` pour être idempotent et sauvegarde netfilter-persistent.
- [ ] Tester les lignes raw DNAT et les marqueurs TLS WebFig/MikHmon sans attribuer de nouveau port.
- [ ] Implémenter `finalizeRouterReplacement(replacementRouterId)`: claim conditionnel, lecture des forwards source, rebind relay, transfert `routerId/tunnelIp`, révocation du pair source, marquage `replaced`, héritage limité Auto-Setup et statut `completed`.
- [ ] Appeler le finaliseur après synchronisation dans les deux callbacks. Une relance d'un callback terminé doit rester sans effet ; une erreur conserve `installing` et un message non sensible.

### Task 4: Actions et scripts de remplacement

**Files:**
- Modify: `src/lib/mikrotik/actions.ts`
- Create: `src/lib/mikrotik/replacement-actions.ts`
- Create: `src/lib/mikrotik/replacement-actions.test.ts`
- Modify: `src/lib/billing/auto-setup-authorization-service.ts`

- [ ] Écrire puis faire échouer les tests de permissions: propriétaire de l'organisation seulement, superadmin global, une reprise active maximum, ancien routeur `replaced` refusé.
- [ ] Ajouter `startRouterReplacement(routerId, replacementName)`: vérifier session/organisation, créer le nouveau routeur avec le même tunnel/shard, générer un jeton hashé de deux heures et retourner uniquement la commande temporaire.
- [ ] Ajouter `cancelRouterReplacement(id)` pour annuler `pending`/`installing` sans toucher au routeur source ni aux forwards.
- [ ] Faire hériter l'Auto-Setup payé uniquement à la chaîne de remplacement, sans nouvelle autorisation et sans droit réutilisable sur l'ancien routeur.
- [ ] Obtenir le vert sur les tests d'actions et de domaine.

### Task 5: Coffre Superadmin et audit des révélations

**Files:**
- Create: `src/lib/billing/vpn-access-inventory.ts`
- Create: `src/lib/billing/vpn-access-actions.ts`
- Create: `src/app/admin/vpn-access/page.tsx`
- Create: `src/app/admin/vpn-access/VpnAccessInventory.tsx`
- Create: `src/lib/billing/vpn-access-inventory.test.ts`

- [ ] Écrire les tests qui vérifient le regroupement par routeur/service et l'absence de `passwordEncrypted` dans la sortie d'inventaire.
- [ ] Lister les forwards actifs avec organisation, routeur, expiration et dernière autorisation de paiement correspondante. Refuser toute session autre que Superadmin.
- [ ] Implémenter `revealVpnCredentials(routerId)` côté serveur: déchiffrer uniquement après vérification Superadmin, journaliser `revealed`, ne pas persister le secret. Ajouter l'audit `copied`/`whatsapp_prepared`.
- [ ] Créer une table responsive avec filtres, badges, mot de passe masqué, copie et WhatsApp pré-rempli. Ne jamais mettre le secret dans les props initiales du Server Component.
- [ ] Obtenir le vert sur l'inventaire.

### Task 6: Intégration dans les menus existants

**Files:**
- Modify: `src/components/AdminSidebar.tsx`
- Modify: `src/app/admin/remote-access/page.tsx`
- Create: `src/app/admin/remote-access/RouterReplacementSection.tsx`
- Modify: `src/app/admin/remote-access/RemoteAccessSidebar.tsx`

- [ ] Ajouter « Accès VPN clients » sous Superadmin avec l'icône et l'état actif cohérents.
- [ ] Ajouter dans « Accès distant » une carte « Remplacer ce routeur » avec état, services transférables, nom, commande temporaire, expiration et annulation.
- [ ] Afficher « préparation MikHmon requise » tant que le conteneur n'est pas détecté ; conserver les URLs/ports après finalisation.
- [ ] Refaire les vérifications de session et d'organisation côté serveur, indépendamment de l'UI.

### Task 7: Vérification, migration, commit et déploiement

**Files:**
- Modify: aucun fichier fonctionnel supplémentaire ; appliquer `scripts/add-vpn-recovery.sql` sur la production.

- [ ] Exécuter `rg --files src -g '*.test.ts' | sort | xargs node_modules/.bin/tsx --test`.
- [ ] Exécuter `npm run build && npm run lint && git diff --check`.
- [ ] Appliquer `node --env-file=.env.local scripts/run-sql.mjs scripts/add-vpn-recovery.sql`.
- [ ] Commiter `feat: ajoute la reprise sécurisée des accès VPN` puis pousser `main`.
- [ ] RSync vers un staging Hostinger excluant `.git`, `.next`, `node_modules`, `.env*` et `.codex`, puis exécuter `/root/deploy-slh.sh` sous son verrou.
- [ ] Vérifier l'image suivante de `slh-app`, `RestartCount=0`, la redirection d'une session absente vers `/admin/vpn-access` et la page `/admin/remote-access` publique/authentifiée.
