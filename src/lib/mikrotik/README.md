# MikroTikProvisioner

Provisionneur MikroTik autonome et idempotent, équivalent en classe de la procédure manuelle WinBox (renommage WAN, bridges HOTSPOT/DOCKERS, DHCP/DNS/NAT, durcissement des services). Chaque étape vérifie l'état du routeur (`print`/filtre) avant d'agir : relancer `run()` plusieurs fois sur un routeur déjà configuré ne crée rien en double et ne lève aucune erreur.

Fichier : [`provisioner.ts`](./provisioner.ts)

> Ce module est **distinct** du flux d'auto-setup réellement branché sur l'app (`provisionHotspotStack` dans [`container-setup.ts`](./container-setup.ts)), qui utilise des noms internes différents (`SAFELINKHUB-BRIDGE`, `MIKHMON`) pour rester compatible avec les routeurs déjà provisionnés en prod. `MikroTikProvisioner` peut néanmoins être branché dessus via `withClient(...)` si besoin un jour.

## Pourquoi pas `routeros-client` / `node-routeros`

Le brief d'origine suggérait ces librairies, mais une partie des routeurs ne sont joignables que via le tunnel SSH du relay WireGuard/OpenVPN (voir [`relay.ts`](./relay.ts)) — pas en connexion TCP directe. Le projet a donc son propre client API RouterOS minimaliste ([`client.ts`](./client.ts)), qui accepte aussi bien un `net.Socket` direct qu'un flux tunnelisé en SSH. `MikroTikProvisioner` s'appuie sur ce client pour rester compatible avec les deux cas.

## Installation

Aucune dépendance supplémentaire — `provisioner.ts` fait partie du code de l'app (TypeScript, Node.js via Next.js). Pas de `npm install` à faire.

## Utilisation

### 1. Connexion directe (routeur joignable en TCP, ex. API-SSL sur le port 8729)

```ts
import { MikroTikProvisioner } from "@/lib/mikrotik/provisioner";

const provisioner = new MikroTikProvisioner({
  host: "192.168.88.1",
  port: 8729,
  username: "admin",
  password: "monMotDePasse",

  // Tous les champs ci-dessous sont optionnels — valeurs par défaut listées plus bas.
  identity: "HSPT-WIFIVILLAGE",
  timezone: "Africa/Abidjan",
});

const summary = await provisioner.run();
console.log(JSON.stringify(summary, null, 2));
```

### 2. Connexion existante (ex. via le tunnel du relay, pour un routeur uniquement joignable en VPN)

```ts
import { RouterOSClient } from "@/lib/mikrotik/client";
import { openRouterTunnelWithRetry } from "@/lib/mikrotik/relay";
import { MikroTikProvisioner } from "@/lib/mikrotik/provisioner";

const tunnel = await openRouterTunnelWithRetry("10.66.0.5", 8728);
const client = new RouterOSClient();
await client.connectViaStream(tunnel.stream, "admin", "monMotDePasse");

const provisioner = MikroTikProvisioner.withClient(client, {
  identity: "HSPT-WIFIVILLAGE",
});

const summary = await provisioner.run(); // connect()/disconnect() deviennent des no-op
```

### 3. Étape par étape (sans `run()`)

```ts
const provisioner = new MikroTikProvisioner({ host, port, username, password });
await provisioner.connect();
await provisioner.renameWAN();
await provisioner.createVETH();
await provisioner.createBridges();
// ...
await provisioner.disconnect();
```

## Méthodes

| Méthode | Étape (prompt) | Description |
|---|---|---|
| `connect()` | — | Ouvre la connexion API RouterOS (no-op si `withClient`). |
| `renameWAN()` | 1.1 | Renomme `ether1` → `wanInterfaceName` (par défaut `E1-WAN-FAI`). Skip si déjà fait. |
| `createVETH()` | 1.2 | Crée l'interface `veth` pour le conteneur Docker/Mikhmon. |
| `createBridges()` | 2 | Crée les bridges `HOTSPOT` (LAN/WiFi) et `DOCKERS` (conteneur). |
| `createInterfaceLists()` | 3 | Crée les listes `WAN`/`LAN` et y rattache les bonnes interfaces. |
| `assignBridgePorts()` | 4 | Attache `ether2-5`, `wifi1-2` au bridge HOTSPOT, et le veth au bridge DOCKERS. |
| `configureIPAddresses()` | 5 | Adresse passerelle sur chaque bridge. |
| `configureDHCP()` | 6 | DHCP client sur le WAN, pool + serveur + réseau DHCP sur HOTSPOT. |
| `configureDNS()` | 7 | Serveurs DNS statiques + `allow-remote-requests`. |
| `configureNAT()` | 8 | Masquerade pour le réseau hotspot (et le réseau Docker). |
| `configureCloudDDNS()` | 9 | Active le DDNS du MikroTik Cloud. |
| `applyHardening()` | 10 | Désactive SSH/API-SSL, fixe timezone/identité/NTP, crée le job `CLEAN_JOB`. |
| `disconnect()` | — | Ferme la connexion (no-op si `withClient`). |
| `run()` | — | Exécute toutes les étapes dans l'ordre et retourne le récapitulatif JSON. |

Chaque méthode (sauf `connect`/`disconnect`/`run`) retourne `{ ok, skipped, message }` et empile son résultat dans le récapitulatif final.

## Résultat de `run()`

```json
{
  "success": true,
  "identity": "HSPT-WIFIVILLAGE",
  "steps": [
    { "step": "connect", "ok": true, "skipped": false, "message": "Connected to 192.168.88.1:8729" },
    { "step": "renameWAN", "ok": true, "skipped": false, "message": "ether1 renamed to E1-WAN-FAI" },
    { "step": "createVETH", "ok": true, "skipped": true, "message": "MKHMON already exists — skipped" },
    ...
    { "step": "disconnect", "ok": true, "skipped": false, "message": "Connection closed" }
  ]
}
```

`success` est `false` dès qu'au moins une étape a échoué (`ok: false`) — `skipped` ne compte jamais comme un échec.

## Configuration (valeurs par défaut)

| Champ | Défaut |
|---|---|
| `port` | `8729` (API-SSL) |
| `connectTimeoutMs` | `8000` |
| `wanInterfaceName` | `"E1-WAN-FAI"` |
| `vethName` | `"MKHMON"` |
| `vethAddress` | `"11.11.11.11/28"` |
| `vethGateway` | `"11.11.11.1"` |
| `hotspotBridgeName` | `"HOTSPOT"` |
| `dockerBridgeName` | `"DOCKERS"` |
| `hotspotBridgePorts` | `["ether2","ether3","ether4","ether5","wifi1","wifi2"]` |
| `hotspotAddress` | `"10.0.0.1"` |
| `hotspotPrefixBits` | `16` |
| `dhcpPoolName` | `"pool-hotspot"` |
| `dhcpPoolRanges` | `"10.0.0.2-10.0.255.254"` |
| `dhcpServerName` | `"dhcp-hotspot"` |
| `dnsServers` | `"208.67.222.222,8.8.8.8"` |
| `identity` | `"HSPT-WIFIVILLAGE"` |
| `timezone` | `"Africa/Abidjan"` |
| `ntpServers` | `["196.200.131.160","196.10.52.57"]` |
| `enableCloudDdns` | `true` |
| `disableSsh` | `true` |
| `disableApiSsl` | `true` |

## Notes

- **Idempotence** : chaque étape interroge RouterOS (`/.../print` avec filtre) avant de créer quoi que ce soit — y compris le job `CLEAN_JOB`, qui plantait dans la procédure manuelle d'origine avec `failure: item with this name already exists` faute de cette vérification.
- **Gestion d'erreurs** : chaque sous-opération est dans son propre `try/catch` ; une étape qui échoue partiellement continue les autres sous-opérations et remonte le détail dans `message`, plutôt que d'interrompre tout `run()`.
- **Sécurité** : `applyHardening()` désactive SSH et API-SSL par défaut, mais ne touche jamais à Winbox/API/WebFig — coupez-les vous-même seulement si vous êtes sûr de ne pas en avoir besoin pour gérer le routeur.
