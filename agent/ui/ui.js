const byId = id => document.getElementById(id);
let token = '';
let deadline;
let polling = false;
let dryRun = false;
let connected = null; // routeur vérifié par « Se connecter » : { host, model, version… }

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token, ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`);
  return data;
}

/* ── Affichage ───────────────────────────────────────────────
   Le serveur compte les étapes ainsi : 0 = vérification / mise à jour
   RouterOS, 1 à 3 = les trois commandes device-mode. L'étape 4 (« Vérifier
   le résultat ») n'est acquise qu'à la fin de la tâche. */
const STEP_COUNT = 6;

function setTone(el, tone) { el.dataset.tone = tone; el.removeAttribute('aria-busy'); }
/* Chargement : anneau sur un bouton, radar sur un encart d'état, logo qui pulse. */
let busyCount = 0;
function busy(el, on) {
  if (!el) return;
  if (el.classList.contains('btn')) el.classList.toggle('is-loading', on);
  if (on) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  document.body.dataset.busy = String(busyCount > 0);
}

function renderSteps(task) {
  const items = [...byId('steps').children];
  const current = (task.progress?.step ?? -1) + 1;
  let done = 0;
  items.forEach((li, i) => {
    let state = 'todo';
    if (task.state === 'completed' || task.state === 'simulated') state = 'done';
    else if (task.state === 'completed-with-warnings') state = i === STEP_COUNT - 1 ? 'warn' : 'done';
    else if (task.state === 'failed') state = i < current ? 'done' : i === current ? 'failed' : 'todo';
    else if (task.state === 'running') state = i < current ? 'done' : i === current ? (task.progress?.state === 'waiting-physical' ? 'waiting' : 'active') : 'todo';
    if (task.updateRouterOS === false && i === 1 && current > 1) state = 'todo';
    // Paquets seuls : seule l'étape « Mettre RouterOS… à jour » (paquets + firmware) est concernée.
    if (task.packagesOnly && i > 1) state = 'todo';
    if (task.state === 'simulated') state = 'todo';
    li.dataset.state = state;
    if (state === 'done' || state === 'warn') done += 1;
  });
  byId('meter-fill').style.width = `${Math.round((done / STEP_COUNT) * 100)}%`;
  byId('progress').value = done;
}

// arm64, arm, x86 : container (MikHmon local) possible. mipsbe, mmips, ppc, smips, tile : non.
const archLabel = arch => !arch ? '?' : `${arch} · ${['arm64', 'arm', 'x86', 'x86_64'].includes(arch) ? 'container compatible' : 'container non pris en charge'}`;
function renderSummary(result, target = 'summary') {
  const box = byId(target);
  box.replaceChildren();
  if (!result || typeof result !== 'object') { box.hidden = true; return; }
  const list = document.createElement('dl');
  list.className = 'summary-list';
  const row = (label, value) => {
    const wrap = document.createElement('div');
    wrap.className = 'summary-row';
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    wrap.append(dt, dd);
    list.append(wrap);
  };
  if (result.version) row('RouterOS', result.version);
  if (result.model) row('Modèle', result.model);
  if (result.architecture) row('Architecture', archLabel(result.architecture));
  if (result.serial) row('Numéro de série', result.serial);
  const mode = result.deviceMode || {};
  if (mode.mode) row('Device-mode', mode.mode);
  box.append(list);

  const keys = ['container', 'hotspot', 'scheduler', 'fetch', 'routerboard'].filter(k => k in mode);
  if (keys.length) {
    const flags = document.createElement('div');
    flags.className = 'flags';
    for (const key of keys) {
      const on = mode[key] === 'yes' || mode[key] === 'true';
      const chip = document.createElement('span');
      chip.className = 'flag';
      chip.dataset.on = String(on);
      chip.textContent = `${on ? '✓' : '✕'} ${key}`;
      flags.append(chip);
    }
    box.append(flags);
  }
  if (Array.isArray(result.warnings) && result.warnings.length) {
    const ul = document.createElement('ul');
    ul.className = 'warnings';
    for (const text of result.warnings) { const li = document.createElement('li'); li.textContent = text; ul.append(li); }
    box.append(ul);
  }
  box.hidden = false;
}

function render(task) {
  const labels = { completed: 'Configuration vérifiée sur le routeur.', 'completed-with-warnings': 'Terminé avec un avertissement à vérifier.', failed: 'Configuration interrompue.', simulated: 'Simulation terminée. Aucune commande envoyée.' };
  if (task.packagesOnly && task.state === 'completed') labels.completed = 'Paquets appliqués et vérifiés sur le routeur.';
  byId('status').textContent = task.error || labels[task.state] || task.progress?.message || 'Vérification en cours…';
  const waiting = task.progress?.state === 'waiting-physical';
  setTone(byId('status-box'), task.state === 'failed' ? 'err'
    : task.state === 'completed-with-warnings' || waiting ? 'warn'
    : task.state === 'completed' ? 'ok'
    : 'info');
  deadline = task.state === 'running' ? task.progress?.deadline : undefined;
  const running = task.state === 'running';
  if (running) byId('status-box').setAttribute('aria-busy', 'true');
  byId('meter-fill').parentElement.dataset.running = String(running);
  document.body.dataset.busy = String(running || busyCount > 0);
  renderSteps(task);
  renderSummary(task.result);
  const plan = task.plan ? task.plan.map(words => words.join(' ')).join('\n') : '';
  byId('result').textContent = plan;
  byId('result').hidden = !plan;
  const ready = task.state === 'completed' || task.state === 'completed-with-warnings';
  if (ready && !task.packagesOnly && byId('new-password').hidden) { byId('np-user').textContent = byId('username').value.trim(); byId('new-password').hidden = false; byId('np-1').focus(); }
  byId('fields').disabled = task.state === 'running';
  byId('discover').disabled = task.state === 'running';
}

function setMode(text, tone) { byId('mode').textContent = text; setTone(byId('mode'), tone); }

async function follow(id) {
  if (polling) return;
  polling = true;
  sessionStorage.setItem('safelinkhub-task', id);
  try {
    while (true) {
      const task = await api(`/agent/tasks/${id}/status`);
      render(task);
      if (task.state !== 'running') { sessionStorage.removeItem('safelinkhub-task'); break; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    byId('status').textContent = `${error.message} Le suivi est interrompu, une commande déjà envoyée peut continuer. Rechargez cette page pour reprendre le suivi.`;
    setTone(byId('status-box'), 'err');
  } finally { polling = false; }
}

byId('tls').addEventListener('change', () => {
  const tls = byId('tls').checked;
  byId('port').value = tls ? '8729' : '8728';
  advSummary();
  byId('transport').textContent = tls
    ? 'Connexion chiffrée : le certificat TLS doit être valide pour l’IP du routeur.'
    : 'API 8728 : les identifiants circulent sans chiffrement sur le réseau local.';
  setTone(byId('transport'), tls ? 'ok' : 'warn');
});

function routerCard(router) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'router';
  button.setAttribute('aria-pressed', String(byId('host').value.trim() === router.ip));
  const body = document.createElement('span');
  body.className = 'router-body';
  const ip = document.createElement('span');
  ip.className = 'router-ip';
  ip.textContent = router.ip;
  const meta = document.createElement('span');
  meta.className = 'router-meta';
  meta.textContent = [router.model, router.version && `RouterOS ${router.version}`, router.mac, router.ports?.length && `API ${router.ports.join(', ')}`].filter(Boolean).join(' · ') || 'Identité à confirmer';
  body.append(ip, meta);
  const source = document.createElement('span');
  source.className = 'router-source';
  source.textContent = router.source === 'MNDP' ? 'MNDP' : 'TCP';
  source.title = router.source;
  button.append(body, source);
  button.addEventListener('click', () => {
    byId('host').value = router.ip;
    if (router.ports?.length === 1) {
      // Un port ouvert ne valide ni le protocole ni le certificat : ne pas changer le transport automatiquement.
    }
    for (const card of byId('routers').children) card.setAttribute('aria-pressed', String(card === button));
    byId('username').focus();
  });
  return button;
}

byId('discover').addEventListener('click', async () => {
  const discover = byId('discover');
  discover.disabled = true;
  discover.setAttribute('aria-busy', 'true');
  byId('discovery').textContent = 'Recherche des interfaces locales et des annonces MNDP…';
  byId('routers').replaceChildren();
  try {
    const data = await api('/agent/routers');
    const count = data.routers.length;
    byId('discovery').textContent = `${count === 0 ? 'Aucun candidat détecté.' : count === 1 ? '1 candidat détecté.' : `${count} candidats détectés.`} ${data.warnings.join(' ')} Absent de la liste ? Saisissez son adresse ci-dessous.`;
    byId('routers').replaceChildren(...data.routers.map(routerCard));
  } catch (error) { byId('discovery').textContent = error.message; }
  finally { discover.disabled = false; discover.removeAttribute('aria-busy'); }
});

// Le champ mot de passe est vidé au lancement de la préparation : on garde la
// valeur en mémoire de la page pour l'étape « nouveau mot de passe Winbox ».
let lastPassword = '';
function connectionBody() {
  // Liste non affichée → paquets non touchés (jamais « tout décoché »).
  const packages = byId('packages').children.length ? [...document.querySelectorAll('#packages input:checked')].map(input => input.value) : undefined;
  return { username: byId('username').value, password: byId('password').value || lastPassword, port: Number(byId('port').value), tls: byId('tls').checked, ca: byId('ca').value.trim() || undefined, updateRouterOS: byId('update-ros').checked, packages };
}
const REMOVAL_RISK = { container: 'MikHmon ne fonctionnera plus (son conteneur sera arrêté).', 'wifi-qcom': 'le Wi-Fi peut disparaître.', wireless: 'le Wi-Fi peut disparaître.', 'wifi-qcom-ac': 'le Wi-Fi peut disparaître.' };
function packagesWarning() {
  const inputs = [...document.querySelectorAll('#packages input')];
  const removed = inputs.filter(i => i.dataset.installed === 'true' && !i.checked).map(i => i.value);
  const added = inputs.filter(i => i.dataset.installed !== 'true' && i.checked).map(i => i.value);
  const risks = removed.filter(name => REMOVAL_RISK[name]).map(name => `${name} : ${REMOVAL_RISK[name]}`);
  const warn = byId('packages-warn');
  warn.hidden = !removed.length;
  warn.textContent = removed.length ? `Seront désinstallés : ${removed.join(', ')}.${risks.length ? ` Attention — ${risks.join(' ')}` : ''}` : '';
  byId('packages-apply').textContent = added.length || removed.length ? `Appliquer maintenant (${[added.length && `+${added.join(', +')}`, removed.length && `−${removed.join(', −')}`].filter(Boolean).join(' ; ')})` : 'Paquets conformes à la sélection';
  byId('packages-apply').disabled = !added.length && !removed.length;
}
byId('packages-apply').addEventListener('click', async () => {
  byId('fields').disabled = true;
  try {
    const task = await api(`/agent/routers/${encodeURIComponent(byId('host').value.trim())}/configure`, { method: 'POST', body: JSON.stringify({ ...connectionBody(), packagesOnly: true }) });
    lastPassword = byId('password').value || lastPassword;
    goto(3);
    render(task);
    await follow(task.id);
    goto(2);
    byId('packages-load').click(); // relit l'état réel du routeur
  } catch (error) {
    byId('status').textContent = error.message;
    setTone(byId('status-box'), 'err');
    byId('fields').disabled = false;
  }
});
// container est nécessaire à MikHmon : pré-coché s'il n'est pas installé.
const RECOMMENDED = ['container'];
byId('packages-load').addEventListener('click', async () => {
  const button = byId('packages-load');
  busy(button, true);
  byId('packages-note').textContent = 'Recherche des paquets depuis le routeur (Internet requis)…';
  try {
    const data = await api(`/agent/routers/${encodeURIComponent(byId('host').value.trim())}/packages`, { method: 'POST', body: JSON.stringify(connectionBody()) });
    byId('packages').replaceChildren(...data.packages.map(pkg => {
      const label = document.createElement('label');
      label.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = pkg.name;
      input.checked = pkg.installed || RECOMMENDED.includes(pkg.name);
      input.dataset.installed = String(pkg.installed);
      input.disabled = pkg.name === 'routeros';
      input.addEventListener('change', packagesWarning);
      const text = document.createElement('span');
      text.textContent = pkg.name;
      if (pkg.installed) {
        const tag = document.createElement('span'); tag.className = 'muted';
        const update = pkg.name === 'routeros' && data.latest && data.latest !== pkg.version ? ` → ${data.latest} disponible${byId('update-ros').checked ? ' (installé par la préparation)' : ' (cochez « Mettre RouterOS à jour »)'}` : '';
        tag.textContent = ` · installé ${pkg.version ?? ''}${update}`;
        text.append(tag);
      }
      label.append(input, text);
      return label;
    }));
    byId('packages-apply').hidden = false;
    packagesWarning();
    byId('packages-note').textContent = data.note ?? `${data.packages.filter(p => !p.installed).length} paquet(s) disponible(s). Les paquets déjà installés restent en place.`;
  } catch (error) { byId('packages-note').textContent = error.message; }
  finally { busy(button, false); }
});
byId('update-ros').addEventListener('change', () => {
  byId('steps').children[1].querySelector('.step-label').textContent = byId('update-ros').checked ? 'Mettre RouterOS et le firmware RouterBOARD à jour (stable)' : 'RouterOS différé · firmware RouterBOARD vérifié';
});
byId('configure').addEventListener('submit', async event => {
  event.preventDefault();
  busy(byId('submit'), true);
  byId('fields').disabled = true;
  try {
    const task = await api(`/agent/routers/${encodeURIComponent(byId('host').value.trim())}/configure`, { method: 'POST', body: JSON.stringify(connectionBody()) });
    lastPassword = byId('password').value || lastPassword;
    byId('password').value = '';
    busy(byId('submit'), false);
    goto(3);
    render(task);
    await follow(task.id);
  } catch (error) {
    busy(byId('submit'), false);
    byId('status').textContent = error.message;
    setTone(byId('status-box'), 'err');
    byId('fields').disabled = false;
  }
});

/* ── Diagnostic et dépannage ──────────────────────────────── */
const SAFE_FIXES = ['ntp', 'expiry-sweep', 'ticket-expiry', 'mikhmon-sales', 'wifi-enable', 'wifi-unhide', 'wifi-dfs', 'dns-remote', 'dhcp-enable', 'hotspot-enable', 'mikhmon-start', 'mikhmon-session'];
const SEV_ORDER = { error: 0, warn: 1, info: 2, ok: 3 };
const FIX_LABEL = { 'mikhmon-sales': 'Réparer les revenus', 'expiry-sweep': 'Réparer l’expiration', 'ticket-expiry': 'Réécrire les dates', nat: 'Recréer le NAT', 'wan-dhcp': 'Recréer le client DHCP WAN', 'mikhmon-session': 'Restaurer la session', ntp: 'Synchroniser l’heure' };

function healthStatus(text, tone) { byId('health-status').textContent = text; setTone(byId('health-status'), tone); }
function healthBody(extra = {}) { const b = connectionBody(); delete b.updateRouterOS; return { ...b, ...extra }; }
function healthBusy(busy) {
  for (const id of ['health-run', 'health-fix-all']) byId(id).disabled = busy;
  for (const b of document.querySelectorAll('#health-checks button, [data-maint]')) b.disabled = busy;
}

function renderHealth(report) {
  const id = report.identity;
  const dl = byId('health-identity');
  dl.replaceChildren();
  for (const [label, value] of [['Modèle', `${id.boardName} (${id.model})`], ['Numéro de série', id.serial], ['Adresse MAC', id.mac], ['Architecture', archLabel(id.architecture)], ['RouterOS', id.version], ['Firmware', id.firmware], ['Allumé depuis', id.uptime], ['Santé', `${report.score}/100`]]) {
    const wrap = document.createElement('div'); wrap.className = 'summary-row';
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    wrap.append(dt, dd); dl.append(wrap);
  }
  dl.hidden = false;
  const list = byId('health-checks');
  list.replaceChildren();
  const checks = [...report.checks].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  for (const c of checks) {
    const li = document.createElement('li'); li.className = 'check'; li.dataset.sev = c.severity;
    const dot = document.createElement('span'); dot.className = 'check-dot'; dot.setAttribute('aria-hidden', 'true');
    const head = document.createElement('div');
    const area = document.createElement('div'); area.className = 'check-area'; area.textContent = c.area;
    const title = document.createElement('div'); title.className = 'check-title'; title.textContent = c.title;
    head.append(area, title);
    li.append(dot, head);
    if (c.fix) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-outline btn-sm';
      btn.textContent = FIX_LABEL[c.fix] || 'Réparer';
      btn.addEventListener('click', () => runFix(c.fix, c.title, btn));
      li.append(btn);
    } else li.append(document.createElement('span'));
    const detail = document.createElement('p'); detail.className = 'check-detail'; detail.textContent = c.detail;
    li.append(detail);
    list.append(li);
  }
  const problems = report.checks.filter(c => c.severity === 'error' || c.severity === 'warn').length;
  const safe = report.checks.filter(c => c.fix && SAFE_FIXES.includes(c.fix));
  byId('health-fix-all').hidden = safe.length < 2;
  healthStatus(problems ? `${problems} problème(s) détecté(s) sur ${id.boardName} (SN ${id.serial}).` : `Aucun problème détecté sur ${id.boardName} (SN ${id.serial}).`, problems ? 'warn' : 'ok');
  return safe;
}

async function runHealth() {
  healthBusy(true);
  healthStatus('Diagnostic en cours (lecture seule, 10 à 30 secondes)…', 'info');
  busy(byId('health-run'), true); busy(byId('health-status'), true);
  try {
    renderHealth(await api(`/agent/routers/${encodeURIComponent(byId('host').value.trim())}/health`, { method: 'POST', body: JSON.stringify(healthBody()) }));
  } catch (error) { healthStatus(error.message, 'err'); }
  finally { healthBusy(false); busy(byId('health-run'), false); busy(byId('health-status'), false); }
}

async function runFix(fix, title, button) {
  healthBusy(true);
  healthStatus(`En cours : ${title}…`, 'info');
  busy(button, true); busy(byId('health-status'), true);
  try {
    const result = await api(`/agent/routers/${encodeURIComponent(byId('host').value.trim())}/fix`, { method: 'POST', body: JSON.stringify(healthBody({ fix })) });
    if (result.report) renderHealth(result.report);
    healthStatus(result.message, 'ok');
  } catch (error) { healthStatus(error.message, 'err'); }
  finally { healthBusy(false); busy(button, false); busy(byId('health-status'), false); }
}

byId('health-run').addEventListener('click', runHealth);
byId('health-fix-all').addEventListener('click', async () => {
  healthBusy(true);
  busy(byId('health-fix-all'), true); busy(byId('health-status'), true);
  try {
    let report = await api(`/agent/routers/${encodeURIComponent(byId('host').value.trim())}/health`, { method: 'POST', body: JSON.stringify(healthBody()) });
    const todo = [...new Set(report.checks.filter(c => c.fix && SAFE_FIXES.includes(c.fix)).map(c => c.fix))];
    const done = [];
    for (const fix of todo) {
      healthStatus(`Réparation ${done.length + 1}/${todo.length}…`, 'info');
      const result = await api(`/agent/routers/${encodeURIComponent(byId('host').value.trim())}/fix`, { method: 'POST', body: JSON.stringify(healthBody({ fix })) });
      report = result.report; done.push(result.message);
    }
    renderHealth(report);
    healthStatus(done.length ? done.join(' ') : 'Rien à réparer automatiquement.', 'ok');
  } catch (error) { healthStatus(error.message, 'err'); }
  finally { healthBusy(false); busy(byId('health-fix-all'), false); busy(byId('health-status'), false); }
});

setInterval(() => {
  if (!deadline) { byId('countdown').textContent = ''; return; }
  const left = Math.ceil((deadline - Date.now()) / 1000);
  byId('countdown').textContent = left > 0
    ? `Temps restant : ${Math.floor(left / 60)} min ${String(left % 60).padStart(2, '0')} s`
    : 'Fenêtre écoulée : vérification du retour du routeur…';
}, 1000);

(async () => {
  try {
    const health = await (await fetch('/health')).json();
    if (health.version < 2) throw new Error('Redémarrez l’agent : cette interface nécessite la nouvelle version du serveur.');
    if (health.service !== 'safelinkhub-agent') throw new Error('Service local inconnu.');
    token = (await (await fetch('/session')).json()).token;
    dryRun = health.dryRun;
    setConnected(null);
    byId('submit').textContent = health.dryRun ? 'Simuler le parcours' : 'Mettre à jour et configurer';
    byId('submit').disabled = false;
    const previous = sessionStorage.getItem('safelinkhub-task');
    if (previous) { byId('wz-3').disabled = false; goto(3); await follow(previous); }
  } catch (error) {
    setMode('Agent injoignable', 'err');
    byId('status').textContent = error.message;
    setTone(byId('status-box'), 'err');
  }
})();

byId('new-password').addEventListener('submit', async event => {
  event.preventDefault();
  const status = byId('np-status');
  const next = byId('np-1').value;
  if (next !== byId('np-2').value) { status.textContent = 'Les deux saisies ne correspondent pas.'; setTone(status, 'err'); return; }
  status.textContent = 'Changement puis vérification par reconnexion…'; setTone(status, 'info');
  busy(byId('np-submit'), true); busy(status, true);
  try {
    const result = await api(`/agent/routers/${encodeURIComponent(byId('host').value.trim())}/password`, { method: 'POST', body: JSON.stringify({ ...connectionBody(), newPassword: next }) });
    // Le formulaire de connexion suit le nouveau mot de passe (diagnostic, réparations).
    byId('password').value = next;
    lastPassword = next;
    byId('np-1').value = byId('np-2').value = '';
    byId('np-show').checked = false; byId('np-1').type = byId('np-2').type = 'password';
    status.textContent = result.message; setTone(status, 'ok');
    byId('np-submit').disabled = true;
  } catch (error) {
    status.textContent = error.message; setTone(status, 'err');
  } finally { busy(byId('np-submit'), false); busy(status, false); }
});

byId('np-show').addEventListener('change', event => {
  for (const id of ['np-1', 'np-2']) byId(id).type = event.target.checked ? 'text' : 'password';
});

for (const button of document.querySelectorAll('[data-maint]')) {
  const label = button.textContent;
  button.addEventListener('click', () => {
    // Action destructive : deuxième clic pour confirmer.
    if (button.dataset.confirm && button.textContent !== button.dataset.confirm) {
      button.textContent = button.dataset.confirm;
      setTimeout(() => { button.textContent = label; }, 6000);
      return;
    }
    button.textContent = label;
    runFix(button.dataset.maint, button.closest('li').querySelector('strong').textContent, button);
  });
}

/* ── Navigation : onglets et assistant ────────────────────── */
function showView(view) {
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  }
  byId('view-prep').hidden = view !== 'prep';
  byId('view-diag').hidden = view !== 'diag';
}
for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => showView(tab.dataset.view));
for (const link of document.querySelectorAll('[data-view-link]')) link.addEventListener('click', () => { showView(link.dataset.viewLink); goto(1); });

function goto(step) {
  for (const n of [1, 2, 3]) {
    byId(`panel-${n}`).hidden = n !== step;
    const wz = document.querySelector(`.wz[data-step="${n}"]`);
    if (n === step) wz.setAttribute('aria-current', 'step'); else wz.removeAttribute('aria-current');
    wz.dataset.done = String(n < step);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
for (const wz of document.querySelectorAll('.wz')) wz.addEventListener('click', () => goto(Number(wz.dataset.step)));
for (const b of document.querySelectorAll('[data-goto]')) b.addEventListener('click', () => goto(Number(b.dataset.goto)));

function setConnected(router) {
  connected = router;
  document.querySelector('.wz[data-step="2"]').disabled = !router;
  byId('diag-need').hidden = !!router;
  byId('health-run').disabled = !router;
  for (const b of document.querySelectorAll('[data-maint]')) b.disabled = !router;
  const suffix = dryRun ? ' · simulation' : '';
  if (router) setMode(`${router.model ?? 'Routeur'} · ${router.host}${suffix}`, 'ok');
  else setMode(`Aucun routeur connecté${suffix}`, dryRun ? 'warn' : 'pending');
}

function advSummary() {
  byId('adv-summary').textContent = `— port ${byId('port').value}, ${byId('tls').checked ? 'TLS' : 'sans TLS'}`;
}
byId('port').addEventListener('input', advSummary);

// Toute modification de l'adresse ou des identifiants oblige à se reconnecter.
for (const id of ['host', 'username', 'password', 'port', 'tls']) {
  byId(id).addEventListener('input', () => { if (connected) { setConnected(null); byId('connect-status').hidden = true; } });
}

byId('pw-show').addEventListener('click', () => {
  const show = byId('password').type === 'password';
  byId('password').type = show ? 'text' : 'password';
  byId('pw-show').textContent = show ? 'Masquer' : 'Afficher';
  byId('pw-show').setAttribute('aria-pressed', String(show));
});

byId('connect-form').addEventListener('submit', async event => {
  event.preventDefault();
  const status = byId('connect-status');
  const button = byId('connect');
  status.hidden = false;
  status.textContent = 'Connexion au routeur en lecture seule…';
  setTone(status, 'info');
  busy(button, true); busy(status, true);
  try {
    const host = byId('host').value.trim();
    const result = await api(`/agent/routers/${encodeURIComponent(host)}/diagnose`, { method: 'POST', body: JSON.stringify(connectionBody()) });
    if (dryRun && !result.model) Object.assign(result, { model: 'Routeur simulé' });
    lastPassword = byId('password').value || lastPassword;
    setConnected({ host, ...result });
    status.textContent = result.message;
    setTone(status, 'ok');
    renderSummary(result, 'plan-summary');
    goto(2);
  } catch (error) {
    setConnected(null);
    status.textContent = error.message;
    setTone(status, 'err');
  } finally { busy(button, false); busy(status, false); }
});
