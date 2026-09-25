# API mobile SafeLinkHub — v1

Base : `https://safelinkhub.io/api/mobile/v1` · JSON · pour l'app iOS / Android (React Native).

## Authentification

Le jeton est **le même que la session du site** : l'app l'envoie en en-tête.

```
Authorization: Bearer <token>
```

Les droits sont exactement ceux du compte sur le web (organisation, rôle).
Durée de vie : 7 jours — appeler `/auth/refresh` au démarrage de l'app pour
qu'un utilisateur actif ne soit jamais déconnecté.

### Parcours de connexion

```
POST /auth/login { email, password }
 ├─ 200 { token, tokenType, expiresIn, user }            → connecté
 └─ 200 { mfaRequired: true, mfaToken }                  → écran « code 2FA »
        POST /auth/mfa { mfaToken, code }                → 200 { token, … }
```

`mfaToken` vaut 5 minutes et **ne donne accès à rien d'autre** que `/auth/mfa`.
`code` : code TOTP à 6 chiffres ou code de secours.

## Erreurs

Toujours `{ "error": { "code", "message" } }` avec le statut HTTP adapté.
Brancher l'app sur `code`, pas sur le texte.

| Statut | code | Quand |
|---|---|---|
| 400 | `missing_credentials`, `code_required`, `invalid_range` | Champ manquant ou invalide |
| 401 | `unauthorized` | Jeton absent, invalide ou expiré → renvoyer vers la connexion |
| 401 | `invalid_credentials`, `invalid_code`, `mfa_expired` | Connexion refusée |
| 403 | `account_inactive` | Compte non activé (lien reçu par e-mail) |
| 403 | `forbidden` | Le rôle ne permet pas l'action |
| 404 | `not_found` | Ressource absente ou d'une autre organisation |
| 429 | `rate_limited` (+ `retryAfterSeconds`) | Trop de tentatives de connexion |

## Points d'accès

| Méthode | Chemin | Jeton | Réponse |
|---|---|---|---|
| POST | `/auth/login` | — | voir ci-dessus |
| POST | `/auth/mfa` | — | `{ token, tokenType, expiresIn, user }` |
| POST | `/auth/refresh` | ✓ | nouveau jeton |
| GET | `/me` | ✓ | `{ user, organization, capabilities[] }` |
| GET | `/dashboard?from=AAAA-MM-JJ&to=AAAA-MM-JJ` | ✓ | `{ range, kpis, daily[], recentSales[] }` |
| GET | `/routers` | ✓ | `{ routers[] }` |
| GET | `/routers/:id` | ✓ | `{ router }` |

`capabilities` ⊂ `members, billing, settings, routers, packages, tickets` —
l'app masque les écrans non permis (le serveur refuse de toute façon).

Montants du tableau de bord : FCFA entiers (les champs `*Cents` portent ce nom
pour des raisons historiques). Un routeur expose `id, name, model, status,
connectionMethod, tunnelIp, activeUsers, cpuLoad, memoryUsage, uptimeSeconds,
lastSyncAt` — jamais ses identifiants.

## Exemple React Native

```ts
import * as SecureStore from "expo-secure-store";

const API = "https://safelinkhub.io/api/mobile/v1";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await SecureStore.getItemAsync("slh_token");
  const res = await fetch(API + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error.message), body.error, { status: res.status });
  return body as T;
}

export async function login(email: string, password: string) {
  const r = await api<{ token?: string; mfaRequired?: boolean; mfaToken?: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (r.token) await SecureStore.setItemAsync("slh_token", r.token);
  return r; // si r.mfaRequired : demander le code puis POST /auth/mfa
}
```

Stocker le jeton dans le trousseau (`expo-secure-store`), jamais dans
`AsyncStorage`.

## Étendre l'API

Nouvelle route : `src/app/api/mobile/v1/<chemin>/route.ts`, qui commence par

```ts
const auth = await requireMobileSession("tickets"); // capacité facultative
if ("response" in auth) return auth.response;
```

et réutilise les fonctions de `src/lib` (elles lisent la session via
`getSession`, qui accepte le Bearer). Un test (`test/mobile-api.test.mjs`)
refuse toute route mobile sans ce contrôle.

Suites logiques : tickets (`/vouchers`), forfaits (`/packages`), ventes,
notifications push (jeton Expo par appareil).
