# Régulation du trafic pilotée par n8n

n8n **décide**, la plateforme **sait** (seuils, état) et **agit** (routeur).
Le workflow n'a plus de constantes ni de `$getWorkflowStaticData`, et ne
connaît aucun identifiant MikroTik : tout passe par trois routes internes,
authentifiées par `Authorization: Bearer $N8N_INTERNAL_TOKEN`.

```
Schedule 15 min → GET /routers → boucle ┬→ POST /routers/:id/read → Code « Décision »
                                        │        → POST /routers/:id/apply → changé ? → Gmail
                                        └→ Fin
```

## Contrat `/api/internal/n8n/regulation`

### `GET /routers`
Routeurs dont la régulation est **activée** (table `router_regulation.enabled`).
```json
[{
  "routerId": "uuid", "name": "HSPT-FOUANGA", "online": true, "billingCycleDay": 1,
  "policy": { "softCapMb": 4718592, "hardCapMb": 5242880, "safety": 0.95,
              "dayCriticalRatio": 1.1, "blockLimit": "64k/64k",
              "abuseThresholdMb": 1024, "abuseBlockMinutes": 180, "abuseMaxOffenses": 3 },
  "state": { "decision": "ok", "previous": "ok", "limit": "0/0", "wanInterface": "E1-WAN-FAI",
             "counters": 0, "monthBytes": 0, "dayBytes": 0, "monthKey": "2026-09-01",
             "dayKey": "2026-09-12", "at": "…", "changedAt": null, "stats": {} } | null,
  "watch": { "<mac>": { "bytesOut": 0, "blockedUntil": 0, "offenseCount": 0, "permanent": false } }
}]
```

### `POST /routers/:id/read`
Relève le routeur par le tunnel. `503` si injoignable, `422` sans WAN.
```json
{ "at": "2026-09-12T10:00:00Z", "wanInterface": "E1-WAN-FAI", "counters": 123456789,
  "active": [{ "mac": "AA:…", "address": "10.0.0.5", "user": "1j1", "bytesOut": 0, "bytesIn": 0 }] }
```

### `POST /routers/:id/apply`
Corps = `apply` produit par le nœud Décision. L'état est **toujours** mémorisé,
puis la pose est tentée (`503` routeur injoignable → n8n réessaie au passage suivant).
```json
{ "limit": "0/0" | "1.20M/2.40M", 
  "blocks": [{ "address": "10.0.0.5", "user": "1j1", "minutes": 180, "comment": "…" }],
  "state": { …RegulationState }, "watch": { … },
  "events": [{ "kind": "decision|block|permanent_block", "payload": { … } }] }
→ { "applied": true, "queue": "removed|set|added", "blocked": 1 }
```
Côté routeur : file simple `slh-quota` (PCQ, mère des profils hotspot) ; listes
`slh-blocked-download` (timeout) / `slh-permanent-blocked` + règles drop en tête
du forward. `limit = 0/0` retire la file et détache les profils.

## Table `router_regulation` (migration `0009_router_regulation`)
Une ligne par routeur : `enabled`, seuils (`soft_cap_mb`, `hard_cap_mb`, `safety`,
`day_critical_ratio`, `block_limit`, `abuse_*`), `state` et `watch` (jsonb écrits
par n8n). `router_regulation_events` = journal (décisions, blocages) affiché à
l'écran.

## Mise en place
1. Sur le VPS : `N8N_INTERNAL_TOKEN=<aléatoire>` dans l'env de `slh-app`
   (`/root/slh-set-env.sh`), puis relance.
2. Dans n8n : credential *Header Auth* « SafeLinkHub n8n (Bearer) » —
   nom `Authorization`, valeur `Bearer <le même token>`.
3. Importer `regulation-workflow.json`, rattacher les credentials (Header Auth
   sur les 3 nœuds HTTP, Gmail), activer.
4. Dans SafeLinkHub, fiche routeur → onglet **Filtrage & régulation** →
   « Bridage automatique (n8n) » : saisir les seuils, activer.
