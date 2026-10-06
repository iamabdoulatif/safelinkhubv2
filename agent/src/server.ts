import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runConfiguration, PLAN, type Progress, type Transport } from './configurator';
import { inspectRouter } from './diagnostics';
import { routerTransport, type Credentials } from './routeros';
import { discoverRouters, isLocalAddress } from './scanner';

type Task = { id: string; state: string; progress?: Progress; result?: unknown; error?: string; createdAt: number; updateRouterOS?: boolean; plan?: string[][] };
export function createAgent(options: { dryRun?: boolean; transport?: (credentials: Credentials) => Transport; assetsDir?: string; log?: (event: Record<string, unknown>) => void } = {}) {
  const token = randomBytes(32).toString('hex');
  const tasks = new Map<string, Task>();
  let active: string | undefined;
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
    if (req.method === 'GET' && path === '/health') return json(res, 200, { service: 'safelinkhub-agent', version: 2, port, dryRun: !!options.dryRun });
    if (req.method === 'GET' && path === '/session') {
      if (req.headers['sec-fetch-site'] === 'cross-site' && !origin) return json(res, 403, { error: 'Contexte refusé.' });
      return json(res, 200, { token });
    }
    if (req.method === 'GET' && ['/', '/ui.js', '/style.css'].includes(path)) {
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors http://localhost:3000 http://127.0.0.1:3000");
      const filename = path === '/' ? 'index.html' : path.slice(1);
      const data = await readFile(resolve(options.assetsDir ?? 'agent/ui', filename));
      res.writeHead(200, { 'Content-Type': path === '/' ? 'text/html; charset=utf-8' : path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(data);
    }
    const supplied = req.headers['x-agent-token'];
    if (typeof supplied !== 'string' || supplied.length !== token.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) return json(res, 401, { error: 'Session locale requise.' });
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
    const match = /^\/agent\/routers\/([^/]+)\/(configure|diagnose)$/.exec(path);
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
      if ((body.updateRouterOS !== undefined && typeof body.updateRouterOS !== 'boolean') || !isLocalAddress(host) || typeof body.username !== 'string' || !body.username.trim() || typeof body.password !== 'string' || typeof body.tls !== 'boolean' || !Number.isInteger(body.port) || Number(body.port) < 1 || Number(body.port) > 65535 || (body.ca !== undefined && typeof body.ca !== 'string')) return json(res, 400, { error: 'IP locale, identifiants, port et transport valides requis.' });
      // Recheck after reading the request: two uploads must not race the task lock.
      if (active) return json(res, 409, { error: 'Une configuration est déjà en cours.', taskId: active });
      const credentials: Credentials = { host, port: Number(body.port), username: body.username, password: body.password, tls: body.tls, ca: body.ca as string | undefined };
      if (match[2] === 'diagnose') {
        try {
          if (options.dryRun) return json(res, 200, { message: 'Simulation : aucun diagnostic réseau effectué.' });
          return json(res, 200, await inspectRouter((options.transport ?? routerTransport)(credentials)));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Diagnostic impossible.';
          return json(res, 422, { error: credentials.password ? message.split(credentials.password).join('[secret]') : message });
        } finally { credentials.password = ''; }
      }
      const task: Task = { id: randomUUID(), state: options.dryRun ? 'simulated' : 'running', createdAt: Date.now(), updateRouterOS: body.updateRouterOS !== false };
      if (tasks.size >= 20) tasks.delete(tasks.keys().next().value!);
      tasks.set(task.id, task);
      if (options.dryRun) { task.plan = body.updateRouterOS === false ? PLAN.filter(words => !words[0].includes('/package/update')) : PLAN; credentials.password = ''; }
      else {
        active = task.id;
        void runConfiguration((options.transport ?? routerTransport)(credentials), progress => { task.progress = progress; options.log?.({ taskId: task.id, ...progress }); }, undefined, { updateRouterOS: body.updateRouterOS !== false })
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
