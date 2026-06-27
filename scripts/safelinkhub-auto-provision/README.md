# safelinkhub-auto-provision

Script Node.js autonome et idempotent qui reproduit en intégralité la configuration manuelle WinBox d'un routeur MikroTik SafeLinkHub — bridges, hotspot, DHCP/DNS/NAT, hardening, et le conteneur Docker MikHmon — via l'API RouterOS (`routeros-client`, port 8729/API-SSL par défaut).

> Ce script est **autonome** (dossier `scripts/safelinkhub-auto-provision/`, dépendances propres) — il n'est pas importé par l'application Next.js SafeLinkHub et n'affecte pas son build. Pour une intégration dans l'app elle-même (compatible avec le tunnel relay WireGuard/OpenVPN), voir [`src/lib/mikrotik/provisioner.ts`](../../src/lib/mikrotik/provisioner.ts).

## Pré-requis

- Node.js 18+
- Le routeur doit être joignable en TCP direct (API-SSL 8729, ou API 8728) depuis la machine qui exécute le script — pas de support du tunnel relay ici.
- Pour l'étape conteneur MikHmon : le package RouterOS `container` doit être installé et activé (System → Packages), et l'appareil doit supporter RouterOS Container (arm/arm64/tile — pas mipsbe/mmips/smips).

## Installation

```bash
cd scripts/safelinkhub-auto-provision
npm install
cp .env.example .env
# éditez .env : au minimum MIKROTIK_HOST, MIKROTIK_USERNAME, MIKROTIK_PASSWORD
```

## Utilisation

### En ligne de commande

```bash
npm start
# ou directement :
node safelinkhub-auto-provision.js
```

Le script lit `.env` (via `dotenv`), applique toute la configuration dans l'ordre critique documenté ci-dessous, puis imprime un rapport JSON sur stdout et quitte avec le code `0` (succès) ou `1` (au moins une erreur).

### Depuis un autre script Node.js

```javascript
const { SafeLinkHubMikroTikProvisioner } = require("./safelinkhub-auto-provision");

const provisioner = new SafeLinkHubMikroTikProvisioner({
  host: "192.168.88.1",
  port: 8729,
  username: "admin",
  password: "motdepasse",
  overrides: {
    ssid: "MON WIFI",
    identity: "HSPT-MONSITE",
    dnsName: "monsite.ci",
  },
});

const report = await provisioner.run();
console.log(report.success, report.steps.container);
```

## Idempotence

Chaque étape qui crée un objet nommé (bridge, pool, profil hotspot, règle NAT, job scheduler...) fait d'abord un `.find()` avant d'`.add()` — relancer le script plusieurs fois sur un routeur déjà configuré ne crée rien en double et ne provoque aucune erreur (notamment le job `CLEAN_JOB`, qui plantait dans la procédure manuelle d'origine avec `failure: item with this name already exists`). Les étapes de type `set` (renommage WAN, WiFi, horloge, identité, hardening) sont naturellement idempotentes.

## Ordre d'exécution

L'ordre est important — certaines étapes dépendent d'objets créés par les précédentes :

1. `connect` — connexion API-SSL
2. `setupDisk` — slot tmpfs
3. `setupBridges` — **HOTSPOT** et **CONTAINERS** doivent exister avant les ports de bridge
4. `renameWAN` — `ether1` → `E1-WAN-FAI`
5. `setupWiFi` — SSID sur les deux radios
6. `createVETH` — **MIKHMON** doit exister avant le conteneur
7. `setupInterfaceLists` — listes WAN/LAN + membres
8. `assignBridgePorts` — nécessite les bridges (étape 3)
9. `setupIPAddresses` — nécessite les interfaces (étapes 3, 6)
10. `setupCloudDDNS`
11. `setupDHCPClient`
12. `setupIPPool`
13. `setupDHCPServer`
14. `setupDNS`
15. `setupFirewallFilter`
16. `setupFirewallMangle`
17. `setupFirewallNAT`
18. `setupHotspotProfile`
19. `setupHotspot`
20. `setupHotspotUsers`
21. `hardenServices` — désactive SSH/Telnet/API-SSL, déplace WebFig sur le port 85
22. `setupClock`
23. `setupIdentity`
24. `setupNTP`
25. `setupScheduler` — job `CLEAN_JOB`
26. `setupUserGroup` — groupe API scopé pour le SaaS
27. `setupExportScript` — script de sauvegarde manuel
28. `setupContainer` — **dernier** : nécessite VETH (6) + bridge CONTAINERS (3) + IP (9)
29. `disconnect`

Seules `connect`, `setupBridges` et `createVETH` sont critiques (une erreur y interrompt tout le script) — toutes les autres étapes loggent leur erreur et le script continue.

## Étape conteneur MikHmon — détail

`setupContainer()` :

1. Vérifie que le package `container` est installé et activé (`/system package`) — si absent ou désactivé, l'étape est marquée `skipped` avec la raison, sans faire échouer le script.
2. Configure le registry Docker (`/container/config`).
3. Cherche un conteneur nommé `mikhmon-sf-v1:latest` :
   - absent → le crée avec `remote-image=latif225/mikhmon-sf-v1:latest`, `interface=MIKHMON`, `start-on-boot=yes` ;
   - présent mais arrêté → démarre.
4. Attend 30 secondes (le temps que RouterOS tire l'image Docker en arrière-plan), puis relit le statut et le reporte (`running: true/false`). Un statut autre que `running` n'est pas une erreur fatale — `start-on-boot=yes` garantit que le conteneur démarrera de toute façon au prochain reboot même si l'image met plus de 30s à se télécharger sur un lien WAN lent.

## Rapport JSON

```json
{
  "success": true,
  "host": "192.168.88.1",
  "identity": "HSPT-DUBONHEUR",
  "steps": {
    "bridges": { "status": "ok", "created": ["CONTAINERS", "HOTSPOT"], "durationMs": 120 },
    "wifi": { "status": "ok", "ssid": "DU BONHEUR WIFI", "radios": ["wifi1", "wifi2"], "durationMs": 340 },
    "veth": { "status": "ok", "name": "MIKHMON", "ip": "11.11.11.11/28", "durationMs": 90 },
    "hotspot": { "status": "ok", "name": "hotspot1", "durationMs": 80 },
    "container": { "status": "ok", "name": "mikhmon-sf-v1:latest", "running": true, "durationMs": 30150 }
  },
  "errors": [],
  "durationMs": 45000
}
```

`success` est `false` dès que `errors` contient au moins une entrée.

## Paramètres configurables

Tous les champs de `DEFAULT_CONFIG` dans `safelinkhub-auto-provision.js` peuvent être surchargés via `.env` (voir `.env.example` pour la liste complète des variables `MIKROTIK_*`) ou via `overrides` au constructeur si vous importez la classe directement.
