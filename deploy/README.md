# Migration Vercel + AWS EC2 → VPS Hostinger

Runbook pour réhéberger l'app Next.js **et** le relay VPN sur le seul VPS
Hostinger (`31.97.153.83`, Ubuntu 24.04 + Docker + Traefik), domaine
`safelinkhub.io`. La base **Neon reste inchangée** (cloud, externe).

Fais un **snapshot du VPS avant chaque phase** (`hostinger-vps` / panel), et
garde l'EC2 allumé en secours jusqu'à la fin de la Phase 3.

---

## Phase 1 — App Next.js sur le VPS (sans toucher au VPN)

1. **CI** : le workflow `.github/workflows/deploy.yml` build l'image et la pousse
   sur `ghcr.io/<owner>/<repo>`. Vérifie que le repo autorise GHCR (Settings →
   Actions → Workflow permissions : *Read and write*).
2. **Sur le VPS**, prépare le dossier :
   ```bash
   mkdir -p ~/safelinkhub && cd ~/safelinkhub
   # copie deploy/docker-compose.yml ici, puis :
   cp /chemin/.env.example .env   # voir deploy/.env.example
   ```
3. **Remplis `.env`** (valeurs = ton projet Vercel actuel `vercel env pull`) :
   - toutes les vars Neon/`POSTGRES_*`/`DATABASE_URL*` (copie telles quelles),
   - `AUTH_SECRET`, `NEON_AUTH_BASE_URL`, `NEON_PROJECT_ID`,
   - **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`** = `openssl rand -base64 32`
     (obligatoire en self-host, sinon les Server Actions cassent au rebuild),
   - `WG_RELAY_*` : au **début pointe encore l'EC2** (`WG_RELAY_HOST=3.221.39.207`,
     `WG_RELAY_PUBLIC_HOST=ec2-3-221-39-207.compute-1.amazonaws.com`) pour tester
     l'app isolément, on basculera en Phase 2,
   - **ne PAS** reporter `VERCEL_OIDC_TOKEN` (inutilisé par le code).
4. **Traefik** : confirme les 2 valeurs du template et mets-les dans `.env` :
   ```bash
   docker network ls                       # → TRAEFIK_NETWORK
   docker inspect traefik | grep -i certresolver   # → TRAEFIK_CERTRESOLVER
   ```
5. **Lance** :
   ```bash
   export APP_IMAGE=ghcr.io/<owner>/<repo>:latest
   docker compose pull && docker compose up -d
   docker compose logs -f app
   ```
6. **Cron** (remplace le cron Vercel `router-health-check`, 03:00) — timer systemd :
   ```ini
   # /etc/systemd/system/router-health.service  (ExecStart)
   curl -fsS -X GET https://safelinkhub.io/api/cron/router-health-check \
     -H "Authorization: Bearer <CRON_SECRET si la route en attend un>"
   # /etc/systemd/system/router-health.timer → OnCalendar=*-*-* 03:00:00
   ```
   Vérifie d'abord l'auth attendue dans `src/app/api/cron/router-health-check/route.ts`.
7. **Test** avant bascule DNS : `curl -H 'Host: safelinkhub.io' http://31.97.153.83`
   ou un `/etc/hosts` temporaire. Le DNS apex pointe déjà le VPS, donc dès que le
   conteneur répond, `https://safelinkhub.io` sert l'app auto-hébergée.

---

## Phase 2 — Relay VPN EC2 → même VPS

1. Sur le VPS : `apt-get install -y wireguard openvpn`.
2. **Copie la config** depuis l'EC2 (préserve clés serveur + peers, donc les
   routeurs restent valides) :
   ```bash
   rsync -a ubuntu@3.221.39.207:/etc/wireguard/ /etc/wireguard/
   rsync -a ubuntu@3.221.39.207:/etc/openvpn/   /etc/openvpn/
   sysctl -w net.ipv4.ip_forward=1   # + rends-le persistant (/etc/sysctl.d)
   systemctl enable --now wg-quick@wg0 openvpn-server@server   # noms selon config
   ```
3. **Accès SSH du relay** : crée l'utilisateur `relay`, dépose la clé publique
   correspondant à `WG_RELAY_SSH_KEY_B64`, sudo NOPASSWD pour `wg`/`iptables`
   (comme sur l'EC2). L'app SSH en local → `WG_RELAY_HOST=127.0.0.1`.
4. **DNS** : ajoute `relay.safelinkhub.io` → `31.97.153.83` (enregistrement A).
5. **Bascule l'env app** : `WG_RELAY_HOST=127.0.0.1`,
   `WG_RELAY_PUBLIC_HOST=relay.safelinkhub.io`, `WG_RELAY_SSH_USER=relay`,
   puis `docker compose up -d`.
6. Ouvre le firewall Hostinger : UDP 51820 (WireGuard) et 1194 (OpenVPN), 80/443.

---

## Phase 3 — Cutover des routeurs déjà installés ⚠️

Les routeurs existants ont l'endpoint `ec2-...amazonaws.com` (nom AWS, non
repointable). **Tant que l'EC2 tourne**, on les repointe un par un vers
`relay.safelinkhub.io` via le tunnel encore actif :

- Script one-shot côté app : pour chaque routeur `connectToRouter(router)` puis
  `/interface/wireguard/peers/set [find interface=safelinkhub-wg0] endpoint-address=relay.safelinkhub.io`.
- Vérifie que chaque tunnel se rétablit sur le nouveau relay (handshake récent)
  **avant** d'éteindre l'EC2.
- Routeurs hors-ligne au moment du cutover = orphelins → à réparer manuellement
  ensuite (réinstall du tunnel).

---

## Phase 4 — Décommission

- Confirme TLS Traefik OK sur `https://safelinkhub.io`.
- Retire le projet de Vercel (ou laisse-le en fallback quelques jours).
- Snapshot final de l'EC2, puis stop/terminate.

---

## Ce qu'on perd en quittant Vercel
Preview deployments, CI/CD managé, edge/CDN, WAF/DDoS, TLS 100 % managé,
scaling auto. Traefik gère le TLS ; le reste (uptime, sécurité, mises à jour du
VPS, sauvegardes) devient ta responsabilité.
