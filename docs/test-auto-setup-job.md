# Procédure de test — auto-setup en job asynchrone (PR #6)

Branche `feat/ui-harmonisation`. Objectif : valider sur un **vrai routeur de test**
ce que le banc local sans base n'a pas pu montrer — progression réelle des 9
étapes, reprise après rechargement, verrou par routeur, serveur redémarré,
chemin d'erreur, réparation depuis le bandeau d'audit — puis vérifier en
production après fusion.

> ⛔ **Ne lancez PAS le workflow « Build & deploy » à la main sur la branche.**
> `workflow_dispatch` construit l'image sous l'étiquette `:latest`, et le VPS
> tire `latest` toutes les 2 min (`slh-pull-deploy.timer`) : la branche partirait
> en production sans revue. Il n'existe pas de préproduction.

Deux temps :

1. **Avant fusion** — la branche tourne sur votre poste, branchée sur la base et
   le relais de production, et configure un routeur de test.
2. **Après fusion** — une installation réelle via `https://safelinkhub.io`, qui
   seule traverse Cloudflare (la coupure à 100 s que ce changement supprime).

---

## 0. Prérequis

| Élément | Valeur |
| --- | --- |
| Routeur de test | `[ROUTEUR-DE-TEST]` — **jamais un routeur client** : l'auto-setup reconfigure le hotspot et redémarre le boîtier |
| Accès physique | Oui, pour débrancher l'alimentation au test T5 |
| Compte | **Superadmin** (exempté de paiement : aucune facturation pendant les essais) |
| Second compte | Un compte **non superadmin** sans autorisation d'auto-setup, pour T8 |
| Poste | Node 22, dépôt à jour, `git switch feat/ui-harmonisation` |

Relevez l'identifiant du routeur de test :

```sql
select id, name, status, tunnel_ip, last_sync_at
from routers where name ilike '%[ROUTEUR-DE-TEST]%';
```

**Sauvegardez-le d'abord** : `/admin/router/backups` → Sauvegarder. En cas de
problème, on restaure cette sauvegarde.

---

## 1. Lancer la branche en local, branchée sur la production

### 1.1 Récupérer les variables (sur le VPS)

```bash
ssh root@31.97.153.83 'docker exec slh-app printenv | grep -E "^(DATABASE_URL|AUTH_SECRET|WG_RELAY_HOST|WG_RELAY_SSH_USER|WG_RELAY_SSH_KEY_B64|WG_RELAY_PUBLIC_HOST|RELAY_BASE_DOMAIN)="'
```

### 1.2 Joindre la base

La base tourne dans le conteneur `slh-postgres` sur le VPS. Si son port n'est pas
publié sur l'hôte, ouvrez un tunnel SSH vers l'IP du conteneur :

```bash
ssh root@31.97.153.83 'docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}" slh-postgres'
```

```bash
ssh -N -L 5433:<IP_CONTENEUR>:5432 root@31.97.153.83
```

Dans `DATABASE_URL`, remplacez l'hôte et le port par `localhost:5433`.

### 1.3 `.env.local` (à la racine du dépôt)

```dotenv
DATABASE_URL=postgres://neondb_owner:<mdp>@localhost:5433/neondb
AUTH_SECRET=<copié du VPS>
WG_RELAY_HOST=<copié>
WG_RELAY_SSH_USER=<copié>
WG_RELAY_SSH_KEY_B64=<copié>
WG_RELAY_PUBLIC_HOST=<copié>
RELAY_BASE_DOMAIN=<copié>
# OBLIGATOIRE : sans elle, les chemins qui écrivent l'URL de l'app sur le
# routeur (walled-garden…) y poseraient localhost — incident du 16/07.
NEXT_PUBLIC_APP_URL=https://safelinkhub.io
```

> ⚠️ Ce fichier contient les secrets de production. Il est ignoré par git ;
> **supprimez-le à la fin des tests** (étape 4).

### 1.4 Démarrer

```bash
rm -rf .next && npm run dev
```

Dans les journaux de démarrage, vérifiez :

- `[migrate] base déjà à jour.` — cette PR n'ajoute aucune migration. **Si une
  migration s'applique, arrêtez tout** : la base de prod aurait changé depuis
  votre poste.
- Aucune erreur de connexion à la base.

Connectez-vous sur `http://localhost:3000/auth/login` avec le compte superadmin.

### 1.5 Suivre le job dans la base (second terminal)

```bash
ssh root@31.97.153.83
```

```bash
watch -n 2 "docker exec slh-postgres psql -U neondb_owner -d neondb -c \"select left(id::text,8) id, status, progress->>'phase' phase, progress->>'step' step, updated_at, finished_at, left(error,60) error from router_restore_jobs where target_router_id='<ID_ROUTEUR>' order by created_at desc limit 3\""
```

---

## 2. Scénarios (avant fusion, en local)

Cochez au fil de l'eau. En cas d'échec, notez l'heure, faites une capture et
dépliez « Journal technique ».

### T1 — Installation complète ✅ chemin nominal

1. Configuration routeur → `[ROUTEUR-DE-TEST]` → étapes 1 à 3 → **Lancer
   l'auto-setup complet**.
2. Pendant l'installation :
   - [ ] Les paramètres saisis s'affichent sous chaque étape (nom, passerelle,
     DNS, SSID, forfaits avec prix, portail, stockage MikHmon).
   - [ ] Le mot de passe du portail n'apparaît **nulle part**.
   - [ ] La barre avance segment par segment ; le libellé suit « Étape n sur 9 ·
     … » dans l'ordre : Connexion → Wi-Fi → Réseau → Serveur hotspot → Portail
     → NAT et pare-feu → MikHmon → Forfaits → Redémarrage (Wi-Fi et MikHmon
     absents si non applicables).
   - [ ] Le chrono tourne.
   - [ ] Dans la base, `step` suit la même progression, `updated_at` bouge au
     moins toutes les 30 s (battement de cœur, même pendant MikHmon).
   - [ ] Outils du navigateur → Réseau : chaque requête d'action répond en
     **moins de 2 s** (plus aucune requête longue).
3. À la fin :
   - [ ] En-tête « Configuration appliquée », durée affichée, 9 étapes cochées.
   - [ ] Base : `status = done`, `finished_at` rempli.
   - [ ] Les éventuels échecs non bloquants apparaissent en « N points à
     vérifier », le journal brut est replié.
   - [ ] Boutons « Ouvrir la fiche du routeur » et « Générer des tickets ».
   - [ ] Après ~1 min, le bandeau d'audit (« Réessayer » si besoin) passe au vert.
   - [ ] Un téléphone qui rejoint le SSID voit le portail captif avec les bons
     forfaits.

### T2 — Recharger la page en pleine installation

1. Relancez l'auto-setup (même routeur : pas de nouvelle facturation).
2. Vers l'étape 3 ou 4, appuyez sur **F5**.
   - [ ] L'écran revient sur l'étape 4 et reprend la progression **là où elle
     en est**.
   - [ ] Base : **une seule** ligne `running` pour ce routeur (pas de second job).
   - [ ] Fin normale, comme en T1.

### T3 — Verrou : une opération à la fois par routeur

1. Pendant une installation, dans un second onglet : `/admin/router/backups` →
   Sauvegarder `[ROUTEUR-DE-TEST]`.
   - [ ] Refus : « Une opération est déjà en cours sur ce routeur — attendez
     qu'elle finisse. »
   - [ ] L'installation n'est pas perturbée.

### T4 — Le serveur redémarre en pleine installation

Ne se teste qu'en local : c'est votre `npm run dev` qui porte le job.

1. Lancez l'installation ; vers l'étape 4, **Ctrl+C** sur `npm run dev`.
2. Attendez **2 min 30**, relancez `npm run dev`, puis rechargez la page.
   - [ ] Message : « Le serveur a redémarré pendant l'installation. Relancez-la… »
   - [ ] Base : la ligne est restée `running`, `updated_at` figé.
3. Relancez l'auto-setup.
   - [ ] Nouveau job, fin normale ; le routeur est cohérent (bandeau d'audit
     vert).
   - [ ] Aucune nouvelle facturation. Si vous testez avec le compte non
     superadmin, vérifiez aussi que `wallet_transactions` n'a pas de second
     débit.

### T5 — Chemin d'erreur

1. **Débranchez l'alimentation** du routeur de test.
2. Lancez l'auto-setup.
   - [ ] Échec rapide à « Connexion et vérifications » : pastille rouge,
     en-tête « L'installation s'est arrêtée », cause affichée.
   - [ ] Base : `status = error`.
   - [ ] Le bloc « Que faire » propose « Retour à la configuration ».
3. Rebranchez, attendez la poignée de main WireGuard, relancez : succès (T1).

### T6 — « Continuer l'auto-setup » depuis le bandeau d'audit

1. Sur le routeur, supprimez à la main un élément posé par l'auto-setup (ex. un
   profil voucher), puis relisez l'audit.
2. Cliquez « Continuer l'auto-setup ».
   - [ ] Base : un job `autosetup` apparaît et se termine.
   - [ ] Le routeur ne redémarre **pas** (réparation = `reboot: false`).
   - [ ] L'audit repasse au vert, l'élément supprimé est revenu.

### T7 — Porte de paiement (compte non superadmin)

1. Connecté avec le compte non autorisé, allez jusqu'à l'étape 4.
   - [ ] État « Paiement en attente de confirmation » avec les paramètres
     affichés et la mention « Rien n'a encore été modifié sur le routeur ».
   - [ ] Base : **aucun** job créé.

### T8 — Parcours visuel de `/admin` (161 fichiers touchés)

À 1440 px puis 390 px (outils du navigateur → mode appareil) :

- [ ] Tableau de bord : 4 grandes tuiles, puis 4 compactes, toutes cliquables.
- [ ] Routeurs : tableau, menu « … », boîte de suppression.
- [ ] Un formulaire (Forfaits → nouveau) : champs, erreurs.
- [ ] Facturation : fenêtres de recharge (ombre sobre, plus d'ombre décalée).
- [ ] Accès distant : tiroir latéral.
- [ ] Au **clavier** (Tab), chaque élément montre l'anneau encre 2 px ; aucun
  champ ne devient vert au focus.
- [ ] Aucun texte sous 12 px, aucune page qui défile horizontalement à 390 px.

---

## 3. Après fusion (production)

La fusion déclenche la CI (`verify` → `build` → `deploy`, ~4 min).

1. Sur le VPS :

   ```bash
   docker logs slh-app 2>&1 | grep '\[migrate\]'
   ```

   - [ ] `base déjà à jour`.
2. Rejouez **T1** sur `https://safelinkhub.io` avec le routeur de test.
   - [ ] Une installation qui dure **plus de 100 s** se termine normalement
     (c'était la coupure Cloudflare 524).
3. Rejouez **T2** (F5 en cours d'installation).

**Retour arrière** si quelque chose casse :

```bash
/root/slh-rollback.sh --list
```

```bash
/root/slh-rollback.sh
```

Le job d'un conteneur remplacé en pleine installation restera `running` puis
périmé au bout de 2 min ; relancer l'auto-setup suffit.

---

## 4. Ménage

- [ ] Supprimez `.env.local` (secrets de production).
- [ ] Fermez le tunnel SSH vers la base.
- [ ] Si le routeur de test doit retrouver son état d'avant : restaurez la
  sauvegarde de l'étape 0.
- [ ] Reportez le résultat dans la PR #6 (cases cochées, captures d'écran des
  échecs).
