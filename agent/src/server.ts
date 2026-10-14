import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { listPackages, PACKAGE_NAME, runConfiguration, PLAN, type Progress, type Transport } from './configurator';
import { inspectRouter } from './diagnostics';
import { applyFix, diagnoseRouter, MAINTENANCE_ACTIONS, SAFE_FIXES, type FixId } from './health';
import { changeAdminPassword, passwordProblem } from './password';
import { setupApiTls } from './tls-setup';
import { routerTransport, type Credentials } from './routeros';
import { discoverRouters, isLocalAddress } from './scanner';

type Task = { id: string; state: string; progress?: Progress; result?: unknown; error?: string; createdAt: number; updateRouterOS?: boolean; packagesOnly?: boolean; plan?: string[][] };
const SAAS_BASE = (process.env.SLH_SAAS_URL ?? "https://safelinkhub.io").replace(/\/+$/, "");

export function createAgent(options: { dryRun?: boolean; transport?: (credentials: Credentials) => Transport; assetsDir?: string; readAsset?: (filename: string) => Buffer; onQuit?: () => void; log?: (event: Record<string, unknown>) => void } = {}) {
  const token = randomBytes(32).toString('hex');
  const tasks = new Map<string, Task>();
  let active: string | undefined;
  let linkCode: string | undefined; // code de liaison SaaS (secret, en mémoire)
  let linkOrg: string | undefined;  // nom de l'organisation liée
  async function saas(pathname: string, init?: { method?: string; body?: unknown }) {
    if (!linkCode) throw new Error('Agent non lié : collez d\'abord un code de liaison.');
    const res = await fetch(`${SAAS_BASE}/api/agent${pathname}`, {
      method: init?.method ?? 'GET',
      headers: { 'Authorization': `Bearer ${linkCode}`, 'Content-Type': 'application/json' },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? `SaaS ${res.status}`);
    return data;
  }
  let discovery: ReturnType<typeof discoverRouters> | undefined;
  let lastDiscovery = 0;
  let port = 0;
  const server = createServer((req, res) => { void handle(req, res).catch(() => { if (!res.headersSent) json(res, 400, { error: 'Requête invalide.' }); else res.end(); }); });
  function json(res: ServerResponse, code: number, body: unknown) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!allowedHosts.includes(req.headers.host ?? '')) return json(res, 403, { error: 'Host refusé.' });
    const origins = [...allowedHosts.map(h => `http://${h}`), 'http://localhost:3000', 'http://127.0.0.1:3000'];
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) return json(res, 403, { error: 'Origine refusée.' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Agent-Token');
      res.writeHead(204); return res.end();
    }
    const path = new URL(req.url ?? '/', `http://127.0.0.1:${port}`).pathname;
    if (req.method === 'GET' && path === '/health') return json(res, 200, { service: 'safelinkhub-agent', version: 2, port, dryRun: !!options.dryRun, packaged: !!options.onQuit });
    if (req.method === 'GET' && path === '/session') {
      if (req.headers['sec-fetch-site'] === 'cross-site' && !origin) return json(res, 403, { error: 'Contexte refusé.' });
      return json(res, 200, { token });
    }
    if (req.method === 'GET' && ['/', '/ui.js', '/style.css'].includes(path)) {
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors http://localhost:3000 http://127.0.0.1:3000");
      const filename = path === '/' ? 'index.html' : path.slice(1);
      const data = options.readAsset ? options.readAsset(filename) : await readFile(resolve(options.assetsDir ?? 'agent/ui', filename));
      res.writeHead(200, { 'Content-Type': path === '/' ? 'text/html; charset=utf-8' : path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(data);
    }
    const supplied = req.headers['x-agent-token'];
    if (typeof supplied !== 'string' || supplied.length !== token.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) return json(res, 401, { error: 'Session locale requise.' });
    if (req.method === 'GET' && path === '/agent/link') {
      return json(res, 200, { linked: !!linkCode, orgName: linkOrg ?? null, saas: SAAS_BASE });
    }
    if (req.method === 'POST' && path === '/agent/link') {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 4096) return json(res, 413, { error: 'Trop volumineux.' }); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as { code?: string };
      const code = (body.code ?? '').trim();
      if (!code) return json(res, 400, { error: 'Code requis.' });
      if (options.dryRun) { linkCode = code; linkOrg = 'Organisation simulée'; return json(res, 200, { orgName: linkOrg }); }
      try {
        const prev = linkCode; linkCode = code;
        const ctx = await saas('/context') as { orgName?: string };
        linkOrg = ctx.orgName ?? 'Organisation';
        options.log?.({ event: 'agent-linked', org: linkOrg });
        void prev;
        return json(res, 200, { orgName: linkOrg });
      } catch (error) {
        linkCode = undefined; linkOrg = undefined;
        return json(res, 401, { error: error instanceof Error ? error.message : 'Liaison refusée.' });
      }
    }
    if (req.method === 'POST' && path === '/agent/unlink') {
      linkCode = undefined; linkOrg = undefined;
      return json(res, 200, { linked: false });
    }
    if (req.method === 'POST' && path === '/agent/saas/provision/start') {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 16384) return json(res, 413, { error: 'Trop volumineux.' }); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as Record<string, unknown>;
      if (options.dryRun) return json(res, 200, { stage: 'payment', amountFcfa: 2000, paymentUrl: 'https://geniuspay.ci/pay/demo', reference: 'DEMO-REF' });
      try { return json(res, 200, await saas('/provision/start', { method: 'POST', body })); }
      catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Paiement indisponible.' }); }
    }
    if (req.method === 'GET' && path === '/agent/saas/provision/status') {
      const serial = new URL(req.url ?? '/', `http://127.0.0.1:${port}`).searchParams.get('serial') ?? '';
      if (options.dryRun) return json(res, 200, { paid: false, status: 'pending' });
      try { return json(res, 200, await saas(`/provision/status?serial=${encodeURIComponent(serial)}`)); }
      catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Statut indisponible.' }); }
    }
    if (req.method === 'POST' && path === '/agent/saas/provision') {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 16384) return json(res, 413, { error: 'Trop volumineux.' }); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as Record<string, unknown>;
      if (options.dryRun) return json(res, 200, { stage: 'payment', free: false, amountFcfa: 2000, walletFcfa: 0, canPayWallet: false });
      try { return json(res, 200, await saas('/provision', { method: 'POST', body })); }
      catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Provisioning indisponible.' }); }
    }
    if (req.method === 'GET' && path === '/agent/saas/suggestions') {
      if (options.dryRun) return json(res, 200, { orgName: 'Organisation simulée', wifiNameSuggestion: 'DEMO WIFI', hotspotAddressDefault: '10.0.0.1/8', portals: [], existingPackages: [{ id: 'x', name: '2 Heures', priceFcfa: 500 }], forfaitPresets: [{ durationCode: '3h', label: '3 heures', priceFcfa: 100 }, { durationCode: '1d', label: '1 jour', priceFcfa: 200 }] });
      try { return json(res, 200, await saas('/suggestions')); }
      catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Suggestions indisponibles.' }); }
    }
    if (req.method === 'POST' && path === '/quit') {
      if (active) return json(res, 409, { error: 'Une opération est en cours : attendez la fin avant de quitter.', taskId: active });
      json(res, 200, { message: 'Agent arrêté.' });
      options.log?.({ event: 'quit' });
      // Laisser la réponse partir avant de fermer.
      setTimeout(() => options.onQuit?.(), 50);
      return;
    }
    if (req.method === 'GET' && path === '/agent/routers') {
      if (options.dryRun) return json(res, 200, { routers: [], warnings: ['Simulation : aucune détection réseau effectuée.'] });
      if (!discovery || Date.now() - lastDiscovery > 15000) {
        lastDiscovery = Date.now();
        discovery = discoverRouters().catch(error => { discovery = undefined; throw error; });
      }
      return json(res, 200, await discovery);
    }
    if (req.method === 'GET' && path.startsWith('/agent/tasks/')) {
      const id = path.split('/')[3];
      const task = tasks.get(id);
      return json(res, task ? 200 : 404, task ?? { error: 'Tâche introuvable.' });
    }
    const match = /^\/agent\/routers\/([^/]+)\/(configure|diagnose|health|fix|password|packages|tls-setup)$/.exec(path);
    if (req.method === 'POST' && match) {
      if (active) return json(res, 409, { error: 'Une configuration est déjà en cours.', taskId: active });
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') return json(res, 415, { error: 'JSON requis.' });
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32768) return json(res, 413, { error: 'Requête trop volumineuse.' });
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
      const host = decodeURIComponent(match[1]);
      if ((body.updateRouterOS !== undefined && typeof body.updateRouterOS !== 'boolean') || !isLocalAddress(host) || typeof body.username !== 'string' || !body.username.trim() || typeof body.password !== 'string' || typeof body.tls !== 'boolean' || !Number.isInteger(body.port) || Number(body.port) < 1 || Number(body.port) > 65535 || (body.ca !== undefined && typeof body.ca !== 'string') || (body.packagesOnly !== undefined && typeof body.packagesOnly !== 'boolean') || (body.packages !== undefined && (!Array.isArray(body.packages) || body.packages.length > 20 || !body.packages.every(name => typeof name === 'string' && PACKAGE_NAME.test(name))))) return json(res, 400, { error: 'IP locale, identifiants, port et transport valides requis.' });
      // Recheck after reading the request: two uploads must not race the task lock.
      if (active) return json(res, 409, { error: 'Une configuration est déjà en cours.', taskId: active });
      const credentials: Credentials = { host, port: Number(body.port), username: body.username, password: body.password, tls: body.tls, ca: body.ca as string | undefined };
      if (match[2] === 'password') {
        const next = typeof body.newPassword === 'string' ? body.newPassword : '';
        const problem = passwordProblem(next, credentials.password, credentials.username);
        if (problem) { credentials.password = ''; return json(res, 400, { error: problem }); }
        try {
          if (options.dryRun) return json(res, 200, { message: 'Simulation : mot de passe non modifié.' });
          const make = options.transport ?? routerTransport;
          await changeAdminPassword(make(credentials), password => make({ ...credentials, password }), credentials.username, next);
          options.log?.({ event: 'password-changed', host, username: credentials.username });
          return json(res, 200, { message: `Mot de passe de « ${credentials.username} » changé et vérifié. Utilisez-le désormais dans Winbox.` });
        } catch (error) {
          const raw = error instanceof Error ? error.message : 'Changement impossible.';
          const message = [credentials.password, next].filter(Boolean).reduce((m, secret) => m.split(secret).join('[secret]'), raw);
          return json(res, 422, { error: message });
        } finally { credentials.password = ''; }
      }
      if (match[2] === 'health' || match[2] === 'fix') {
        const fix = body.fix;
        const FIXES: readonly string[] = [...SAFE_FIXES, ...MAINTENANCE_ACTIONS, 'nat', 'wan-dhcp'];
        if (match[2] === 'fix' && (typeof fix !== 'string' || !FIXES.includes(fix))) {
          credentials.password = '';
          return json(res, 400, { error: 'Réparation inconnue.' });
        }
        try {
          if (options.dryRun) return json(res, 200, { message: 'Simulation : aucun diagnostic réseau effectué.' });
          const transport = (options.transport ?? routerTransport)(credentials);
          if (match[2] === 'health') return json(res, 200, await diagnoseRouter(transport));
          const message = await applyFix(transport, fix as FixId);
          options.log?.({ event: 'fix', fix, host });
          // Maintenance : pas de rediagnostic (le test de débit ou la réinstallation suffisent à attendre).
          return json(res, 200, MAINTENANCE_ACTIONS.includes(fix as FixId) ? { message } : { message, report: await diagnoseRouter(transport) });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Diagnostic impossible.';
          return json(res, 422, { error: credentials.password ? message.split(credentials.password).join('[secret]') : message });
        } finally { credentials.password = ''; }
      }
      if (match[2] === 'tls-setup') {
        try {
          if (options.dryRun) return json(res, 200, { message: 'Simulation : aucun certificat créé.', simulated: true });
          const make = options.transport ?? routerTransport;
          const { ca, port, created } = await setupApiTls(make(credentials), host);
          // Preuve : une NOUVELLE connexion TLS qui valide le certificat ET l'adresse.
          await make({ ...credentials, tls: true, port, ca }).read('/system/identity/print');
          options.log?.({ event: 'tls-setup', host, created });
          return json(res, 200, { ca, port, message: `Connexion chiffrée vérifiée (API-SSL, port ${port}).${created ? ' Certificat créé sur le routeur.' : ''}` });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Chiffrement impossible.';
          return json(res, 422, { error: credentials.password ? message.split(credentials.password).join('[secret]') : message });
        } finally { credentials.password = ''; }
      }
      if (match[2] === 'packages') {
        try {
          if (options.dryRun) return json(res, 200, { packages: [{ name: 'routeros', installed: true, version: '7.24.5' }, { name: 'container', installed: false }, { name: 'zerotier', installed: false }, { name: 'wifi-qcom', installed: true }], note: 'Simulation : liste d’exemple.', latest: '7.25' });
          return json(res, 200, await listPackages((options.transport ?? routerTransport)(credentials)));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Liste des paquets impossible.';
          return json(res, 422, { error: credentials.password ? message.split(credentials.password).join('[secret]') : message });
        } finally { credentials.password = ''; }
      }
      if (match[2] === 'diagnose') {
        try {
          if (options.dryRun) return json(res, 200, { message: 'Simulation : aucun diagnostic réseau effectué.' });
          return json(res, 200, await inspectRouter((options.transport ?? routerTransport)(credentials)));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Diagnostic impossible.';
          return json(res, 422, { error: credentials.password ? message.split(credentials.password).join('[secret]') : message });
        } finally { credentials.password = ''; }
      }
      const task: Task = { id: randomUUID(), state: options.dryRun ? 'simulated' : 'running', createdAt: Date.now(), updateRouterOS: body.updateRouterOS !== false, packagesOnly: body.packagesOnly === true };
      if (tasks.size >= 20) tasks.delete(tasks.keys().next().value!);
      tasks.set(task.id, task);
      if (options.dryRun) {
        const pkg = /\/package\/(enable|uninstall|apply-changes)$/;
        task.plan = PLAN.filter(words => {
          if (pkg.test(words[0])) return body.packages !== undefined;
          if (body.packagesOnly) return words[0] === '/system/routerboard/upgrade';
          return !(body.updateRouterOS === false && words[0].includes('/package/update'));
        });
        credentials.password = '';
      }
      else {
        active = task.id;
        void runConfiguration((options.transport ?? routerTransport)(credentials), progress => { task.progress = progress; options.log?.({ taskId: task.id, ...progress }); }, undefined, { updateRouterOS: body.updateRouterOS !== false, packages: body.packages as string[] | undefined, packagesOnly: body.packagesOnly === true })
          .then(result => { task.result = result; task.state = result.warnings.length ? 'completed-with-warnings' : 'completed'; })
          .catch((error: unknown) => { const message = error instanceof Error ? error.message : 'Échec de configuration.'; task.error = credentials.password ? message.split(credentials.password).join('[secret]') : message; task.state = 'failed'; })
          .finally(() => { credentials.password = ''; active = undefined; options.log?.({ taskId: task.id, state: task.state }); });
      }
      return json(res, 202, task);
    }
    return json(res, 404, { error: 'Endpoint inconnu.' });
  }
  return {
    server,
    get active() { return active; },
    async listen(firstPort = 8787, lastPort = 8790) {
      for (let candidate = firstPort; candidate <= lastPort; candidate++) {
        try {
          await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(candidate, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
          });
          const address = server.address();
          port = typeof address === 'object' && address ? address.port : candidate;
          return port;
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error; }
      }
      throw new Error('Ports 8787–8790 occupés. Fermez l’autre agent puis réessayez.');
    },
  };
}
