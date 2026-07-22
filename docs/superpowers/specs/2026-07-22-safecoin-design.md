# Safecoin (SC) — design produit et technique

## Objectif

Introduire Safecoin (SC), une unité de crédit interne à SafeLinkHub, pour
uniformiser le paiement des accès VPN, de l’Auto-Setup et des frais de service.
L’expérience doit rester cohérente avec la palette existante (papier, encre,
jaune SafeLinkHub, argile et accents de statut) et fonctionner aussi bien pour
un administrateur d’organisation que pour le superadmin.

## Décision de produit

- Taux de référence initial : **1 SC = 100 FCFA/XOF**.
- Le taux est fixe, interne au SaaS et configurable uniquement par le
  superadmin.
- Un SC n’est ni une monnaie légale, ni un actif spéculatif, ni un avoir
  retirable. Il sert uniquement à payer les services SafeLinkHub.
- Pas de transfert entre organisations en V1. Cela évite les erreurs de
  rapprochement, les abus et une promesse financière que le produit ne peut
  pas garantir.
- Les frais sont affichés avant confirmation et enregistrés dans le ledger.

## Conversion des prix existants

Le système conserve les prix en FCFA comme source de vérité commerciale, puis
affiche l’équivalent SC :

| Service | Prix FCFA | Prix SC à 100 FCFA/SC |
| --- | ---: | ---: |
| VPN — 1 mois | 500 | 5 SC |
| VPN — 3 mois | 1 300 | 13 SC |
| VPN — 6 mois | 2 700 | 27 SC |
| VPN — 12 mois | 5 800 | 58 SC |
| Auto-Setup avec conteneur | 15 000 | 150 SC |
| Auto-Setup sans conteneur | 10 000 | 100 SC |

Les conversions arrondissent toujours vers le haut au centième de SC si un
prix futur n’est pas un multiple exact de 100 FCFA. Les montants sont stockés
en centièmes de SC pour éviter les erreurs de flottants.

## Expérience utilisateur

### Portefeuille client (`/admin/billing`)

Ajouter une carte Safecoin en tête de l’actuel portefeuille FCFA :

- solde principal en `SC`, équivalent indicatif en FCFA/XOF ;
- bouton « Ajouter des SC » qui réutilise les passerelles déjà configurées ;
- aperçu des prochains coûts VPN et Auto-Setup en SC + FCFA ;
- ligne de frais distincte avant validation ;
- historique filtrable : recharge, VPN, Auto-Setup, frais, remboursement
  administratif et correction ;
- avertissement explicite « crédit interne, non retirable ».

L’ancien portefeuille FCFA reste visible pendant la transition. Les anciennes
transactions ne sont pas réécrites : elles restent la comptabilité historique
du portefeuille FCFA. Un encart de migration affiche leur équivalent SC à titre
informatif, sans créer artificiellement de nouveaux crédits.

### Station de contrôle superadmin (`/admin/safecoin`)

Nouvelle entrée dans la section Superadmin de la sidebar, avec une page dense
et orientée exploitation :

- bandeau de taux actif : `1 SC = 100 FCFA/XOF`, date de dernière modification
  et bouton de simulation ;
- KPI sur la période : SC émis, SC consommés, frais collectés, solde en
  circulation et organisations actives ;
- graphique quotidien SC émis / consommés / frais ;
- tableau des organisations avec recherche, filtre statut et solde SC ;
- détail d’une organisation : ledger, services consommés, frais et actions
  administratives ;
- export CSV des opérations selon les filtres ;
- panneau « règles de frais » avec prévisualisation avant publication.

Le dashboard superadmin reçoit aussi une tuile compacte Safecoin (émission,
consommation et frais du mois) qui renvoie vers cette station.

## Modèle de données recommandé

Créer un ledger séparé plutôt que de modifier silencieusement
`wallet_transactions` :

1. `safecoin_settings` (singleton) : taux FCFA par SC, devise d’affichage,
   frais de recharge, frais VPN, frais Auto-Setup, version, auteur et dates.
2. `safecoin_accounts` : un compte par organisation, solde dérivé et statut.
3. `safecoin_ledger` : journal append-only en centièmes de SC, type d’opération,
   référence métier, montant FCFA de référence, frais, statut, acteur et date.
4. `safecoin_fee_rules` : règles versionnées par service et période ; aucune
   modification destructive d’une règle déjà utilisée.

Le solde est toujours recalculé par somme des écritures confirmées. Une clé
  d’idempotence unique sur chaque référence métier empêche les doubles débits
  lors d’un webhook ou d’un double clic.

Types d’écriture V1 : `topup`, `vpn_charge`, `auto_setup_charge`, `fee`,
`admin_credit`, `admin_debit`, `refund`, `reversal`.

## Paiements et sécurité

- Une recharge crée une écriture `pending` ; elle ne gonfle le solde qu’après
  webhook signé, comme le portefeuille actuel.
- Le pays et la méthode de paiement choisis sont conservés dans l’écriture.
- Toute écriture superadmin exige une justification visible dans l’audit.
- Aucun montant ou solde n’est accepté depuis le navigateur sans recalcul
  serveur.
- Les écritures confirmées sont immuables ; une correction crée une écriture
  inverse liée à l’originale.
- Les rôles non-superadmin ne voient que le compte de leur organisation.

## Migration et compatibilité

- Déployer le schéma et les paramètres par défaut avec une migration SQL
  idempotente.
- Ne pas convertir automatiquement les anciens soldes FCFA en SC. Afficher
  seulement un équivalent indicatif pour préserver la traçabilité.
- Pendant la phase de transition, les nouveaux débits VPN/Auto-Setup restent
  compatibles avec le portefeuille FCFA si le compte Safecoin est vide ; le
  choix de priorité (SC puis FCFA) est explicite dans le paramétrage de
  l’organisation.
- Les rapports affichent séparément FCFA historique et SC natif pour éviter de
  mélanger deux comptabilités.

## Alternatives évaluées

1. **Ajouter une colonne `currency` à `wallet_transactions`** — rapide, mais
   risque de mélanger les soldes et rend les écritures historiques ambiguës.
2. **Ledger Safecoin séparé (retenu)** — un peu plus de schéma, mais audit,
   idempotence, migration et rapports fiables.
3. **SC transférable entre organisations** — hors périmètre V1 : complexité
   réglementaire, anti-fraude et rapprochement beaucoup plus élevés.

## Plan de livraison

1. Migration et primitives serveur du ledger Safecoin.
2. Conversion tarifaire et débit atomique VPN/Auto-Setup.
3. Carte Safecoin et recharge sur `/admin/billing`.
4. Station superadmin, rapports, filtres et export CSV.
5. Tuile du dashboard, tests, contrôle visuel et déploiement progressif.

## Critères d’acceptation

- Un même webhook ne crédite jamais deux fois un compte.
- Un débit impossible laisse le solde inchangé et explique le motif à l’écran.
- Les montants VPN/Auto-Setup affichent SC et FCFA sans divergence.
- Le superadmin peut auditer, filtrer et exporter les opérations.
- Les clients ne peuvent ni retirer ni transférer des SC.
- Les anciennes transactions FCFA restent intactes et lisibles.
