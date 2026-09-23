# Provisionning Dual WAN Starlink (n8n)

Workflow `dualwan-workflow.json` — « SafeLinkHub - Provisionning Dual WAN
Starlink ». Complément futur de l'auto-setup (config UniWAN) : SafeLinkHub
envoie un webhook, n8n sauvegarde, pré-vérifie, génère la config PCC +
failover pour le bon cas, l'applique, vérifie, et rappelle la plateforme.

Le nœud « Générer la config » est le miroir exact de `dualwan-generator.js`
(le test `test/n8n-dualwan-generator.test.mjs` l'exécute hors n8n et refuse
toute dérive entre les deux fichiers).

## Flux

```
Webhook (POST /webhook/slh-dualwan-starlink, Header Auth)
  → Valider la demande            Code : champs, cas, mode, défauts
  → Mode simulation ?             If   : dry_run → saute directement à la pré-vérification
  → Sauvegarde /export            SSH  : /export file=backup-slh-dualwan-avant-<horodatage>
  → Contrôle sauvegarde           Code : le .rsc existe sur le routeur, sinon stop
  → Pré-vérification              SSH  : version, interfaces, ports du bridge, dhcp-client,
                                         nat, mangle, routes, tables, filter, address-list, dns
  → Générer la config             Code : modèles → ratio → seaux → script, DÉDUPLIQUÉ
  → Quelque chose à appliquer ?   If   : to_apply > 0
      oui → Appliquer             SSH  : le script, une commande par ligne
          → Contrôle application  Code : RouterOS a-t-il refusé une ligne ?
      non ─┐
  → Vérification post-application SSH  : 2 DHCP bound, 4 routes, PCC, NAT, connexions/mark
  → Bilan                         Code : checks → status ok | error
  → Notifier SafeLinkHub          HTTP : POST callback_url (Bearer)

Toute sortie d'erreur (nœuds Code + SSH) ──→ Échec (Code) → Notifier l'échec (HTTP)
```

## Contrat du webhook

`POST https://<n8n>/webhook/slh-dualwan-starlink`, en-tête
`Authorization: Bearer <N8N_INTERNAL_TOKEN>` (même secret que la régulation).
Réponse immédiate (le résultat arrive par le callback).

| Champ | Requis | Défaut | Rôle |
|---|---|---|---|
| `router_id` | oui | | renvoyé tel quel dans la notification |
| `router_host` | oui | | hôte SSH. Depuis n8n cloud : **le relais** (IP publique du VPS) |
| `router_port` | non | `22` | port DNAT ssh du relais (3xxxx) |
| `router_user` / `router_pass` | oui | | compte RouterOS (`safelinkhub-api` du parc, policy ssh+read+write+ftp) |
| `site_name` | non | `""` | informatif |
| `mode` | oui | | `complet` (neuf/reset) ou `complement` (uniwan en place) |
| `cas` | oui | | `cas1` Standard V3+Mini 3:1 · `cas2` Standard V3×2 1:1 · `cas3` Mini×2 1:1 · `cas4` Mini+Standard V3 1:3 |
| `lan_interface` | complement | | ex. `bridge-LAN`, `HOTSPOT` → `in-interface=` des règles PCC (sinon `in-interface-list=LAN`) |
| `wan1_interface` / `wan2_interface` | non | `E1-WAN-FAI` / `E2-WAN-FAI` | noms cibles (complet) ou existants (complement) |
| `wan1_mbps` / `wan2_mbps` | non | selon le cas (400 / 150) | débits réels → ratio recalculé |
| `detach_wan2_from_bridge` | non | `false` | sort un port WAN encore dans le bridge (complet : les deux ; complement : WAN2 seul, accepté sous son nom d'usine `ether2` puis renommé) |
| `dry_run` | non | `false` | simulation : pré-vérification + génération + bilan, **rien d'écrit** (ni sauvegarde, ni application) ; `status: "dry_run"` |
| `callback_url` | non | `https://safelinkhub.io/api/v1/notifications` | |

Refus explicites (branche Échec, rien n'est appliqué) : champ manquant, cas ou
mode inconnu, interface LAN/WAN introuvable, port WAN encore dans le bridge,
règles PCC d'un autre ratio déjà en place, sauvegarde non confirmée.

### Exemples

```json
{ "router_id": "8f1c…", "router_host": "31.97.153.83", "router_port": 30022,
  "router_user": "safelinkhub-api", "router_pass": "…", "site_name": "HSPT-LAB",
  "mode": "complet", "cas": "cas1" }
```
```json
{ "router_id": "8f1c…", "router_host": "31.97.153.83", "router_port": 30022,
  "router_user": "safelinkhub-api", "router_pass": "…", "site_name": "HSPT-LAB",
  "mode": "complet", "cas": "cas2", "detach_wan2_from_bridge": true }
```
```json
{ "router_id": "8f1c…", "router_host": "31.97.153.83", "router_port": 30022,
  "router_user": "safelinkhub-api", "router_pass": "…", "site_name": "HSPT-LAB",
  "mode": "complet", "cas": "cas3" }
```
```json
{ "router_id": "2b77…", "router_host": "31.97.153.83", "router_port": 30041,
  "router_user": "safelinkhub-api", "router_pass": "…", "site_name": "HSPT-LEGRAND",
  "mode": "complement", "cas": "cas1", "lan_interface": "HOTSPOT" }
```

### Notification renvoyée (`POST callback_url`, Bearer)

```json
{ "router_id": "…", "cas": "cas1", "mode": "complet", "status": "ok",
  "details": { "plan": { "ratio": "3:1", "buckets": 4, "assign": ["WAN1","WAN1","WAN1","WAN2"], "routeros": "7.21" },
               "checks": { "dhcp_bound": true, "routes": true, "routes_active": true, "pcc": true, "mark_routing": true, "nat": true },
               "failed": [], "dhcp": [{ "interface": "E1-WAN-FAI", "bound": true, "address": "100.72.1.9/24" }, …],
               "connections": { "WAN1": 312, "WAN2": 97 }, "applied": ["…"], "skipped": ["…"], "script": "…" },
  "backup_file": "backup-slh-dualwan-avant-202609131112.rsc" }
```
En échec : `status: "error"`, `details.step` (nœud fautif), `details.message`
(message RouterOS brut), `stdout`/`stderr` de la commande SSH.

## Credentials n8n à créer

1. **Header Auth** « SafeLinkHub n8n (Bearer) » — déjà utilisée par la
   régulation. Nom `Authorization`, valeur `Bearer <N8N_INTERNAL_TOKEN>`.
   Sert dans les deux sens : authentifie le webhook entrant ET le callback.
2. **SSH Password** « Routeur SafeLinkHub (dynamique) » — les 4 champs en
   expression, résolus sur l'item d'entrée du nœud SSH :
   `Host = {{ $json.router_host }}` · `Port = {{ $json.router_port }}` ·
   `Username = {{ $json.router_user }}` · `Password = {{ $json.router_pass }}`.
   Aucun mot de passe en dur ; chaque nœud Code réémet ces champs pour que
   `$json` les porte devant chaque nœud SSH.

Après import : rattacher ces deux credentials (ids `REPLACE_ME`), activer.

État au 13/09/2026 : importé dans n8n cloud (inactif) —
<https://latif225.app.n8n.cloud/workflow/CnO9So4JFVG8U057>, webhook
`https://latif225.app.n8n.cloud/webhook/slh-dualwan-starlink`, credentials
rattachées (Bearer `2C1ovo0IxaBA2sbn`, SSH dynamique `QgxT5oQcpn9ABV0D`).
Données épinglées sur le Webhook : ASSOINDE-HOTSPOT (`s1.safelinkhub.io:37676`,
complement/cas1/`HOTSPOT`, `dry_run: true`) — exécution n° 380 réussie de bout
en bout depuis n8n cloud : SSH par le relais avec la credential dynamique OK
(pré-vérification 36 Ko en 2,5 s), générateur → refus attendu « E2-WAN-FAI
absente » (ether2 est encore un port du bridge HOTSPOT, avec un lien actif),
callback 404 (endpoint SafeLinkHub pas encore créé) sans casser l'exécution.
Simulation hors-ligne avec ether2 libéré : 19 commandes (voir plus bas).

## Intégration SaaS (15/09/2026)

Onglet « Configurer les services » de la page routeur → panneau « Dual WAN
Starlink (n8n) » ([DualWanPanel.tsx](../../src/app/admin/router/[id]/DualWanPanel.tsx)).

- `startDualWan` ([dualwan-actions.ts](../../src/lib/mikrotik/dualwan-actions.ts))
  : crée une ligne `router_dualwan_jobs` (migration `0010`), POSTe le webhook
  avec `router_host` = relais public du shard, `router_port` = le forward SSH
  **actif** du routeur (`router_port_forwards`, sinon refus : « activez l'accès
  distant SSH »), le compte RouterOS déchiffré, et
  `callback_url = <NEXT_PUBLIC_APP_URL>/api/internal/n8n/dualwan/<jobId>`.
- Callback ([route.ts](../../src/app/api/internal/n8n/dualwan/[jobId]/route.ts))
  : Bearer `N8N_INTERNAL_TOKEN`, vérifie `router_id`, écrit `status` + la
  notification brute dans `result`. Première notification gagnante (n8n peut
  rappeler deux fois : bilan puis branche Échec).
- Un `running` de plus de 10 min sans callback est affiché « Sans réponse » et
  n'empêche plus un nouveau lancement. Un seul job en cours par routeur.
- Env : `N8N_INTERNAL_TOKEN` (requis, déjà en place pour la régulation),
  `N8N_DUALWAN_WEBHOOK_URL` (optionnel, défaut = le webhook n8n cloud ci-dessus).
- Le workflow n8n doit être **activé** ; sinon le webhook répond 404 et le job
  passe tout de suite en erreur « Le workflow est-il activé ? ».

## Choix techniques (vérifiés sur HSPT-LEGRAND, RouterOS 7.21.1)

- **Application par le canal exec SSH, sans transfert de fichier.** Le nœud
  SSH n8n (node-ssh) préfixe TOUJOURS la commande par `cd '/' ; `. RouterOS
  avale `cd …` mais `cd / ; /system identity print` échoue
  (`/system: command not found`) alors que `cd / ; ⏎/system identity print`
  passe : **toutes les commandes SSH du workflow commencent par un saut de
  ligne** (le test le vérifie). Dans ce mode chaque ligne est une commande
  complète (`/ip firewall mangle` seul n'ouvre pas de contexte), d'où la
  forme « chemin complet par ligne » — importable telle quelle par `/import`.
- RouterOS continue après une ligne en erreur et renvoie **code 0** : les
  erreurs sont détectées en relisant la sortie (`failure:`, `input does not
  match`, `expected end of command`, …).
- **Idempotence** : la pré-vérification liste l'existant (`print terse`), le
  générateur saute chaque règle déjà présente (commentaire OU clé structurelle :
  `interface=`, `out-interface=`+masquerade, `new-routing-mark=`, table+gateway+
  distance…). Rejouer donne `to_apply = 0`. Des règles PCC d'un autre ratio
  font échouer le workflow plutôt que de s'empiler.
- Timeout : le nœud SSH n8n n'a pas de réglage de timeout (ssh2 : 20 s de
  readyTimeout) ; `retryOnFail` 2 essais / 5 s. `executionTimeout` 300 s.
- `saveDataSuccessExecution: none` : le mot de passe routeur transite dans les
  items ; en labo, passer à `all` le temps du debug puis remettre `none`.

## Écarts par rapport aux .rsc de référence (obligatoires sur RouterOS 7)

1. **`dst-address=` répété 4× dans une règle mangle est REFUSÉ** (« expected
   end of command » à la 2ᵉ occurrence, relevé sur 7.21). Les 3 blocs PCC tels
   qu'écrits ne peuvent pas être saisis. Même exclusion via
   `/ip firewall address-list slh-pcc-exclude` (192.168/16, 10/8,
   100.64/10 CGNAT Starlink, 172.16/12) + `dst-address-list=!slh-pcc-exclude`.
2. **`routing-mark=` n'existe plus sur `/ip route`** en v7 → `routing-table=`,
   et la table doit exister avant les routes ET la règle mark-routing
   (`input does not match any value of new-routing-mark`) →
   `/routing table add name=to-WAN1 fib` (idem WAN2), sautées si présentes.
   Sur v6 le générateur remet `routing-mark=` et n'ajoute pas de table.
3. Renommage par `[find default-name=ether1]` (fonctionne aussi au rejeu et si
   le port a déjà un autre nom) ; commentaires `Marquee` en ASCII partout.
4. **Routes/failover en passerelles récursives** (16/09/2026, relevé sur
   HTSPT-BETON 7.24) : la forme de référence `gateway=<interface>` +
   `check-gateway=ping` laisse les 4 routes `to-WAN*` INACTIVES sur un WAN
   Ethernet (rien à pinger) → PCC sans effet, tout passait par le main. Et
   pinger la box Starlink (192.168.1.1) ne dit rien de l'Internet derrière.
   Désormais : une route hôte par WAN (« Sonde WAN1 » 1.1.1.1/32, « Sonde
   WAN2 » 9.9.9.9/32, `scope=10`, passerelle = celle du bail DHCP, tenue à
   jour par le `script` du client DHCP), et 6 routes par défaut
   `gateway=1.1.1.1|9.9.9.9 check-gateway=ping` : « Main WAN1/2 » (table
   main, distances 1/2 — le DNS du hotspot et le tunnel basculent aussi) +
   « Marquee/Backup WAN1/2 ». Les routes par défaut des clients DHCP restent
   en secours lointain (distances 11/12). Une route déjà posée sous l'ancienne
   forme est migrée par `set` (repérage par commentaire).
5. `E2-WAN-FAI` (et `E1` en complet) rejoint `/interface list member list=WAN`
   — le durcissement raw/filter de l'auto-setup filtre `in-interface-list=WAN`.
6. PCC, seaux, marques, FastTrack, DNS : identiques (DNS relu par
   `:put [:tostr [/ip dns get servers]]`, `print` replie la liste en 7.24).
7. **PCC et hotspot ne cohabitent qu'avec trois gardes** (HSPT-FOUANGA,
   16/09/2026 : 385 connexions TCP en `syn-recv`, 0 établie, plus de pop-up de
   portail, 363 kbit/s vers 45 clients). Un paquet marqué est routé par la
   table `to-WANx`, qui n'a qu'une route par défaut — il n'y a PAS de repli
   vers `main` en v7, même pour une destination locale (conntrack : la requête
   DNS redirigée vers `10.0.0.1:64872` ressort masquée par le WAN2).
   - `mark-routing … in-interface=<LAN>` : sinon les RÉPONSES venant du WAN
     sont marquées et renvoyées au WAN au lieu du client.
   - `mark-connection … hotspot=auth` (si `chain=hotspot` existe dans le NAT) :
     les sondes HTTP des clients non connectés, redirigées vers la page de
     connexion, sortaient par le WAN → ni page ni pop-up. Le walled-garden
     passe alors par `main`.
   - `action=accept protocol=udp|tcp dst-port=53` en tête (`PCC DNS local`) :
     le DNS des clients connectés vers 1.1.1.1 est lui aussi redirigé sur le
     proxy local du hotspot.
   Diagnostic sans sniffer : `/ip firewall connection print detail`, compter
   `tcp-state=established` par `connection-mark` et les entrées
   `reply-src-port=6487x` avec le drapeau `S`. Le générateur migre les règles
   déjà posées (`set`), le retrait enlève aussi les deux règles DNS.

Point à surveiller en labo (pas modifié) : FastTrack court-circuite le mangle
pour les paquets suivants d'une connexion ; si `torch` sur E2 ne montre pas de
trafic alors que `connections.WAN2 > 0`, désactiver la règle « FastTrack ».

## Plan de test

### 1. cas1 complet sur un hAP ax2 de labo
1. Reset : `/system reset-configuration no-defaults=yes skip-backup=yes`,
   créer l'utilisateur `safelinkhub-api` (group full pour le labo), brancher
   Standard sur ether1, Mini sur ether2, rendre le port ssh joignable depuis
   n8n (relais ou IP publique).
2. Envoyer le payload cas1 complet. Attendu : callback `status: ok`, 4 PCC.
3. Sur le routeur :
   ```
   /file print where name~"backup-slh-dualwan-avant"
   /interface ethernet print where name~"WAN"
   /ip dhcp-client print            → 2 lignes, status bound, 2 adresses
   /routing table print             → to-WAN1, to-WAN2 (fib)
   /ip firewall mangle print        → 4 PCC (4/0..4/3) + 2 mark-routing
   /ip route print where comment~"Sonde|Main|Marquee|Backup"  → 2 sondes + 6 défauts, ≥ 3 actives (A)
   /ip firewall nat print where action=masquerade → NAT WAN1, NAT WAN2
   /ip firewall address-list print where list=slh-pcc-exclude → 4 entrées
   /ip dns print
   /ip firewall connection print count-only where connection-mark=WAN2
   /tool torch interface=E2-WAN-FAI   (trafic réel sur WAN2 avec des clients)
   ```
4. Failover : débrancher E1 → `/ip route print where routing-table=to-WAN1`
   montre « Backup WAN1 » actif ; rebrancher → retour en < 1 min
   (check-gateway=ping).
5. **Rejeu** du même payload : callback `status: ok`, `details.applied = []`,
   aucune règle doublée (`/ip firewall mangle print count-only` inchangé).
6. Erreur volontaire : payload avec `cas: "cas2"` sur ce routeur → échec
   « règle(s) PCC étrangère(s) au plan 1:1 », rien n'est modifié.

### 2. complement sur un uniwan existant
1. Sur le routeur uniwan (hotspot en place), préparer ether2 à la main :
   `/interface bridge port remove [find interface=ether2]` puis
   `/interface ethernet set [find default-name=ether2] name=E2-WAN-FAI`,
   brancher le 2ᵉ Starlink. Noter le bridge LAN (`/interface bridge print`).
2. D'abord envoyer le payload SANS l'étape 1 : attendu échec « E2-WAN-FAI
   absente / encore un port du bridge », hotspot intact.
3. Envoyer le payload complement (`lan_interface` = le bridge). Attendu :
   `applied` ne contient ni renommage, ni DHCP/NAT WAN1, ni FastTrack ;
   règles PCC en `in-interface=<bridge>`.
4. Vérifier que l'existant n'a pas bougé : `/ip hotspot print`,
   `/ip hotspot walled-garden print count-only`, `/ip dhcp-client print`
   (le client WAN1 garde ses options), `/ip firewall nat print` (règles
   hotspot en tête, NAT WAN2 ajouté en fin), `/ip dns print` (1.1.1.1,9.9.9.9
   — le hotspot exige `allow-remote-requests=yes`, conservé).
5. Rejeu → `applied = []`. Un client hotspot connecté :
   `/ip firewall connection print where connection-mark=WAN2` non vide.
6. Retour arrière si besoin : `/import file-name=backup-slh-dualwan-avant-<h>.rsc`
   après un reset, ou retrait manuel des objets commentés `PCC …`, `NAT WAN2`,
   `Marquee/Backup …`, tables `to-WAN*`, liste `slh-pcc-exclude`.
