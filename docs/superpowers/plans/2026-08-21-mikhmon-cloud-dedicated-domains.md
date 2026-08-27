# MikHmon Online cloud avec domaines dédiés — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à chaque MikroTik sans RouterOS Container un MikHmon Online isolé et accessible par son sous-domaine HTTPS, sans poser de conteneur ni de règle Docker sur le routeur.

**Architecture:** Le routeur mémorise sa capacité matérielle indépendante du choix d'installation. Pour un routeur sans conteneur, le service d'accès distant crée une instance MikHmon sur le VPS, liée au tunnel existant et servie par Nginx sous `<slug>.mikhmon.safelinkhub.io`. Les routeurs compatibles conservent sans régression leur conteneur local et leurs URLs de relais à port.

**Tech Stack:** Next.js 16 App Router et Server Actions, TypeScript, Drizzle/PostgreSQL, SSH2 vers le relais VPS, Docker, Nginx, React/Tailwind, Node test runner.

---

## Structure de fichiers

- `src/lib/db/schema.ts` — capacité persistée du routeur et instance cloud par routeur.
- `scripts/add-mikhmon-cloud-instances.sql` — migration PostgreSQL idempotente à appliquer avec `scripts/run-sql.mjs`.
- `src/lib/mikrotik/mikhmon-cloud-domain.ts` — règles pures de slug, domaine et allocation de ports loopback.
- `src/lib/mikrotik/mikhmon-cloud.ts` — provisioning/arrêt idempotents de l'instance Docker sur le relais.
- `src/lib/mikrotik/port-forward.ts` — branche cloud sans aucune commande RouterOS Docker/NAT.
- `src/lib/mikrotik/mikhmon-online.ts` — retourne le domaine cloud au lieu de sonder un conteneur local pour les routeurs legacy.
- `src/app/api/internal/relay-nginx/route.ts` — rend aussi les virtual hosts HTTPS des instances cloud actives.
- `src/app/admin/mikhmon-online/*` et les vues d'accès distant — affichent l'URL dédiée et l'origine cloud.
- `deploy/.env.example` et `deploy/README.md` — variables et opérations d'infrastructure explicites, sans automatiser le DNS de production.

## Task 1: Modèle persistant et identifiants de domaine purs

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `scripts/add-mikhmon-cloud-instances.sql`
- Create: `src/lib/mikrotik/mikhmon-cloud-domain.ts`
- Test: `src/lib/mikrotik/mikhmon-cloud-domain.test.ts`

- [ ] **Step 1: Écrire les tests rouges de domaine et de port**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cloudMikhmonDomain,
  cloudMikhmonPort,
  routerCloudSlug,
} from "./mikhmon-cloud-domain";

describe("MikHmon cloud domains", () => {
  it("fabrique un sous-domaine stable, sûr et non devinable", () => {
    assert.equal(routerCloudSlug("RB951 Korhogo", "123e4567-e89b-12d3-a456-426614174000"), "rb951-korhogo-42661417");
    assert.equal(cloudMikhmonDomain("rb951-korhogo-42661417", "mikhmon.safelinkhub.io"), "rb951-korhogo-42661417.mikhmon.safelinkhub.io");
  });

  it("refuse une base de domaine ou un slug dangereux", () => {
    assert.throws(() => cloudMikhmonDomain("../../etc", "mikhmon.safelinkhub.io"));
    assert.throws(() => cloudMikhmonDomain("rb951", "https://mikhmon.safelinkhub.io/path"));
  });

  it("attribue uniquement des ports loopback dans le pool cloud", () => {
    assert.equal(cloudMikhmonPort([]), 20000);
    assert.equal(cloudMikhmonPort([20000, 20001, 20003]), 20002);
  });
});
```

- [ ] **Step 2: Exécuter le test pour constater l'échec**

Run: `npx tsx --test src/lib/mikrotik/mikhmon-cloud-domain.test.ts`

Expected: échec d'import de `./mikhmon-cloud-domain`.

- [ ] **Step 3: Ajouter le schéma et la migration idempotente**

Dans `routers`, ajouter `supportsContainers: boolean("supports_containers")` nullable : `null` signifie « ancien routeur non encore détecté », jamais « routeur legacy ». Ajouter ensuite :

```ts
export const routerMikhmonCloudInstances = pgTable(
  "router_mikhmon_cloud_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routerId: uuid("router_id").notNull().references(() => routers.id, { onDelete: "cascade" }).unique(),
    domain: text("domain").notNull().unique(),
    containerName: text("container_name").notNull().unique(),
    localPort: integer("local_port").notNull().unique(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("router_mikhmon_cloud_instances_status_idx").on(t.status)],
);
```

Créer `scripts/add-mikhmon-cloud-instances.sql` avec `ALTER TABLE routers ADD COLUMN IF NOT EXISTS supports_containers boolean;`, la table, les index et les contraintes `UNIQUE` ci-dessus. Ne jamais déduire la capacité d'un ancien routeur depuis son modèle DB : elle est inconnue jusqu'à la prochaine détection.

- [ ] **Step 4: Implémenter les règles pures**

Créer `mikhmon-cloud-domain.ts` avec les constantes suivantes :

```ts
export const CLOUD_MIKHMON_PORT_START = 20000;
export const CLOUD_MIKHMON_PORT_END = 20999;

export function routerCloudSlug(name: string, routerId: string): string {
  const label = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "router";
  const suffix = routerId.replace(/-/g, "").slice(-8);
  return `${label}-${suffix}`;
}
```

Valider ensuite le slug avec `/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/`, la base avec `/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/`, et choisir le premier entier libre du pool. Lever une erreur explicite si les 1 000 ports sont consommés.

- [ ] **Step 5: Vérifier les tests et le typage**

Run: `npx tsx --test src/lib/mikrotik/mikhmon-cloud-domain.test.ts && npm run typecheck`

Expected: les trois tests passent et TypeScript ne retourne aucune erreur.

## Task 2: Détection séparée de la capacité et provisioning cloud isolé

**Files:**
- Modify: `src/lib/mikrotik/container-setup.ts`
- Modify: `src/app/admin/settings/router-setup/AutoSetupStep.tsx`
- Create: `src/lib/mikrotik/mikhmon-cloud.ts`
- Test: `src/lib/mikrotik/mikhmon-cloud.test.ts`

- [ ] **Step 1: Écrire les tests rouges du choix cloud/local**

Tester un adaptateur de commande injecté dans `mikhmon-cloud.ts` :

```ts
it("provisionne une instance cloud pour un RB951 sans toucher RouterOS", async () => {
  const commands: string[] = [];
  const instance = await ensureCloudMikhmonInstance({
    router: { id: "123e4567-e89b-12d3-a456-426614174000", name: "RB951 Korhogo", tunnelIp: "10.66.0.23", username: "api", password: "secret" },
    existing: null,
    usedPorts: [],
    baseDomain: "mikhmon.safelinkhub.io",
    run: async (command) => { commands.push(command); return ""; },
  });
  assert.equal(instance.domain, "rb951-korhogo-42661417.mikhmon.safelinkhub.io");
  assert.ok(commands.some((command) => command.includes("docker run -d")));
  assert.ok(commands.every((command) => !command.includes("/ip/firewall") && !command.includes("/container/")));
});
```

Ajouter un test d'idempotence (instance active existante : pas de second `docker run`) et un test de suppression (`docker rm -f <container>` suivi de suppression DB seulement après succès Docker).

- [ ] **Step 2: Exécuter le test pour constater l'échec**

Run: `npx tsx --test src/lib/mikrotik/mikhmon-cloud.test.ts`

Expected: échec d'import de `./mikhmon-cloud`.

- [ ] **Step 3: Persister la capacité matérielle sans confondre « ignorer » et « incompatible »**

Étendre `HotspotStackOptions` avec `routerSupportsContainers: boolean`. Dans `AutoSetupStep.tsx`, appeler `provisionHotspotStack` avec :

```ts
routerSupportsContainers: detected?.supportsContainers ?? false,
supportsContainers: mikhmonIncluded,
```

Conserver `supportsContainers` pour le comportement et la tarification existants de cette exécution. Dans l'`update(routers)` final de `container-setup.ts`, écrire `supportsContainers: opts.routerSupportsContainers`. Un appareil non encore détecté ne doit jamais être marqué automatiquement comme compatible.

- [ ] **Step 4: Implémenter le service cloud sur le relais**

Dans `mikhmon-cloud.ts`, exporter uniquement des fonctions async. Sélectionner l'instance existante, les ports occupés, puis exécuter via `runOnRelay` :

```sh
docker run -d --name <container> --restart unless-stopped \
  --publish 127.0.0.1:<localPort>:80 \
  --env MIKHMON_SESSION=SafeLinkHub \
  --env MIKHMON_MT_IP=<tunnelIp> \
  --env MIKHMON_MT_USER=<username> \
  --env MIKHMON_MT_PASS=<password> \
  --env MIKHMON_HOTSPOT_NAME=<hotspotName> \
  --env MIKHMON_DNS=<dnsName> \
  --env MIKHMON_CURRENCY=fcfa \
  latif225/mikhmon-sf-v1:latest
```

Construire chaque argument avec un échappement shell local à ce module ; ne jamais interpoler une valeur routeur brute. Le service doit exiger `MIKHMON_CLOUD_BASE_DOMAIN`, `router.tunnelIp`, `router.username` et le secret déchiffré, ne journaliser aucune de ces valeurs sensibles, et créer la ligne DB seulement après le succès Docker. `removeCloudMikhmonInstance` arrête/supprime Docker avant la ligne DB. Ajouter `reconfigureCloudMikhmonInstance` qui remplace de façon atomique l'instance lorsqu'un routeur change de tunnel ou d'identifiants.

- [ ] **Step 5: Vérifier les tests unitaires**

Run: `npx tsx --test src/lib/mikrotik/mikhmon-cloud.test.ts src/lib/mikrotik/mikhmon-cloud-domain.test.ts`

Expected: tests verts ; aucune commande simulée ne cible RouterOS.

## Task 3: Activation, désactivation et URL sans port

**Files:**
- Modify: `src/lib/mikrotik/port-forward.ts`
- Modify: `src/lib/mikrotik/mikhmon-online.ts`
- Modify: `src/app/admin/mikhmon-online/page.tsx`
- Modify: `src/app/admin/mikhmon-online/MikhmonOnlineList.tsx`
- Modify: `src/app/admin/remote-access/[id]/page.tsx`
- Modify: `src/lib/remote-access/control-center.ts`
- Modify: `src/app/admin/remote-access/DirectAccessSection.tsx`
- Test: `src/lib/mikrotik/mikhmon-online.test.ts`
- Test: `src/lib/remote-access/control-center.test.ts`

- [ ] **Step 1: Écrire les tests rouges de résolution d'URL**

Ajouter au test MikHmon une ligne cloud active et vérifier :

```ts
assert.deepEqual(
  resolveMikhmonAccess({ supportsContainers: false, cloudDomain: "rb951-korhogo-42661417.mikhmon.safelinkhub.io" }),
  { kind: "cloud", url: "https://rb951-korhogo-42661417.mikhmon.safelinkhub.io" },
);
```

Ajouter au contrôle d'accès un forward MikHmon avec `cloudDomain` et vérifier que `endpoint` est ce domaine HTTPS, jamais `https://sN.safelinkhub.io:<port>`.

- [ ] **Step 2: Exécuter les tests pour constater l'échec**

Run: `npx tsx --test src/lib/mikrotik/mikhmon-online.test.ts src/lib/remote-access/control-center.test.ts`

Expected: `resolveMikhmonAccess` est absent et le DTO ne reconnaît pas `cloudDomain`.

- [ ] **Step 3: Brancher le cycle de vie au service d'accès distant**

Dans `enablePortForwardForRouter`, avant `ensureMikhmonTunnelAccess`, traiter exactement ce cas :

```ts
if (service === "mikhmon" && router.supportsContainers === false) {
  const cloud = await ensureCloudMikhmonInstance(router);
  return createCloudMikhmonAccessRecord({ router, cloud, billingPeriod, expiresAtOverride, billingPeriodLabel });
}
```

`createCloudMikhmonAccessRecord` garde le contrat de facturation de `router_port_forwards`, mais son `publicPort` est le port loopback privé de l'instance et n'est jamais envoyé à `allocatePortForward` ni à `revokePortForward`. La désactivation détecte l'instance par `routerId`, appelle `removeCloudMikhmonInstance`, puis supprime le record d'accès. Ainsi aucun `ensureMikhmonTunnelAccess`, `/container/*`, NAT ou firewall ne s'exécute sur le RB951.

- [ ] **Step 4: Résoudre les endpoints à partir du domaine cloud**

Créer une fonction pure `resolveMikhmonAccess` dans `mikhmon-online.ts`. Elle donne priorité à une instance cloud active lorsque `supportsContainers === false`, sinon conserve exactement les liens DDNS, tunnel et local actuels. La page et la liste affichent un badge « Hébergé dans le cloud — sans conteneur sur le routeur », l'URL HTTPS dédiée et l'état offline du routeur sans essayer de lire `/container/print`.

Faire joindre/sélectionner `routerMikhmonCloudInstances.domain` dans les DTOs de `/admin/remote-access`, du contrôle central et de la page routeur. Tous les appelants construisent `https://${cloudDomain}` lorsque cette valeur est présente ; WinBox, WebFig et SSH conservent le format hôte:port.

- [ ] **Step 5: Vérifier les tests et les vues**

Run: `npx tsx --test src/lib/mikrotik/mikhmon-online.test.ts src/lib/remote-access/control-center.test.ts && npm run typecheck`

Expected: une instance cloud s'affiche uniquement avec un domaine HTTPS, les autres services restent inchangés.

## Task 4: Proxy TLS du relais et procédure d'infrastructure

**Files:**
- Modify: `src/app/api/internal/relay-nginx/route.ts`
- Modify: `deploy/.env.example`
- Modify: `deploy/README.md`
- Test: `src/app/api/internal/relay-nginx/route.test.ts`

- [ ] **Step 1: Écrire les tests rouges de virtual host cloud**

Tester le générateur pur extrait de la route avec une instance active :

```ts
assert.match(
  buildRelayNginxConfig({ cloud: [{ domain: "rb951-korhogo-42661417.mikhmon.safelinkhub.io", localPort: 20000 }] }),
  /listen 443 ssl;[\s\S]*server_name rb951-korhogo-42661417\.mikhmon\.safelinkhub\.io;[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:20000;/,
);
```

Vérifier aussi qu'une instance `stopped` n'apparaît pas, qu'un domaine invalide déclenche une erreur et que la génération de ports WebFig/MikHmon existante reste inchangée.

- [ ] **Step 2: Exécuter le test pour constater l'échec**

Run: `npx tsx --test src/app/api/internal/relay-nginx/route.test.ts`

Expected: le générateur cloud est absent.

- [ ] **Step 3: Générer des virtual hosts HTTPS à partir de la DB**

Extraire `buildRelayNginxConfig` dans un module sans HTTP. La route interne existante garde la vérification `Authorization: Bearer ${CRON_SECRET}`, puis sélectionne les instances cloud `status = "active"` et ajoute un bloc par domaine :

```nginx
server {
  listen 443 ssl;
  server_name <domain>;
  ssl_certificate     /etc/nginx/certs/mikhmon-cloud-wildcard.crt;
  ssl_certificate_key /etc/nginx/certs/mikhmon-cloud-wildcard.key;
  location / {
    proxy_pass http://127.0.0.1:<localPort>;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_http_version 1.1;
    proxy_connect_timeout 5s;
  }
}
```

Le script existant de synchronisation nginx continue de consommer la même route : aucun second cron n'est nécessaire. Conserver les blocs d'erreur des forwards techniques existants.

- [ ] **Step 4: Documenter sans exécuter l'infrastructure**

Ajouter à `deploy/.env.example` :

```dotenv
MIKHMON_CLOUD_BASE_DOMAIN=mikhmon.safelinkhub.io
MIKHMON_CLOUD_IMAGE=latif225/mikhmon-sf-v1:latest
```

Dans `deploy/README.md`, détailler dans cet ordre : vérifier Docker sur le relais ; créer `*.mikhmon.safelinkhub.io` vers le VPS ; émettre/installer le certificat wildcard ; donner à l'utilisateur SSH du relais les droits limités aux commandes Docker et reload Nginx requises ; appliquer la migration ; déployer ; vérifier une URL RB951 et l'absence de ressources `/container` sur le routeur. Marquer explicitement ces étapes comme opérées par un administrateur, pas par une Server Action.

- [ ] **Step 5: Vérifier la route et la documentation**

Run: `npx tsx --test src/app/api/internal/relay-nginx/route.test.ts && npm run lint && git diff --check`

Expected: tous les tests passent, aucune erreur de style ni espace terminal.

## Task 5: Régression complète et mise en production contrôlée

**Files:**
- Modify: `docs/superpowers/specs/2026-08-21-mikhmon-cloud-dedicated-domains-design.md`
- Verify: `src/lib/mikrotik/mikhmon-tunnel-access.test.ts`
- Verify: `src/lib/mikrotik/router-preflight.test.ts`
- Verify: `test/mikrotik-auto-setup-hardening.test.mjs`

- [ ] **Step 1: Ajouter les critères de recette cochables à la conception**

Ajouter ces critères précis : un RB951 auto-configuré n'appelle ni `/container/add` ni `/interface/veth/add` ; son activation crée une seule instance cloud et une URL HTTPS sans port ; une seconde activation est idempotente ; sa désactivation retire le proxy et l'instance ; un hAP ax² conserve son conteneur RouterOS et son accès de relais existant.

- [ ] **Step 2: Lancer les régressions ciblées**

Run: `npx tsx --test src/lib/mikrotik/mikhmon-tunnel-access.test.ts src/lib/mikrotik/router-preflight.test.ts test/mikrotik-auto-setup-hardening.test.mjs`

Expected: tous les tests historiques passent sans comportement Docker ajouté sur les appareils MIPS.

- [ ] **Step 3: Lancer la suite complète**

Run: `npm test && npm run typecheck && npm run lint && npm run build && git diff --check`

Expected: tous les tests, le typage, lint et build passent. Toute alerte existante non liée est signalée séparément.

- [ ] **Step 4: Contrôler le déploiement sans mutation automatique**

Exécuter seulement après validation d'infrastructure : `node --env-file=.env.local scripts/run-sql.mjs scripts/add-mikhmon-cloud-instances.sql`, puis déployer l'application et déclencher la synchronisation Nginx existante. Tester un seul RB951 pilote, vérifier le certificat, la connexion MikHmon via tunnel, la génération d'un voucher et l'arrêt de l'instance. Aucun DNS, certificat ou conteneur de production n'est créé automatiquement pendant les tests locaux.

## Auto-revue du plan

- La capacité matérielle, l'isolation cloud, le domaine HTTPS, la facturation existante, le proxy, l'interface et la procédure VPS ont chacun une tâche dédiée.
- Les noms sont cohérents : `routerMikhmonCloudInstances`, `MIKHMON_CLOUD_BASE_DOMAIN`, `ensureCloudMikhmonInstance`, `removeCloudMikhmonInstance`, `resolveMikhmonAccess`.
- Les étapes de code suivent TDD et les commandes de validation sont explicites.
- Le worktree contient des modifications non liées : ne pas effectuer de commit partiel ou de `git add .` tant qu'elles ne sont pas séparées par l'utilisateur.
