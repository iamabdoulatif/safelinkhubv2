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
/* Anneau de progression (grand cercle central). r=68 → circonférence. */
const RING_C = 2 * Math.PI * 68;
function setRing(fillId, pct, spin) {
  const el = byId(fillId); if (!el) return;
  el.style.strokeDasharray = String(RING_C);
  el.style.strokeDashoffset = String(RING_C * (1 - Math.max(0, Math.min(100, pct)) / 100));
  el.closest('.gauge')?.classList.toggle('gauge-spin', !!spin);
}
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
  const pct = (done / STEP_COUNT) * 100;
  setRing('run-ring-fill', pct);
  byId('run-pct').textContent = `${Math.round(pct)}%`;
  let phase = 'En attente du lancement.';
  if (task.state === 'simulated') phase = 'Aperçu du plan — aucune écriture.';
  else if (task.state === 'completed') phase = 'Préparation vérifiée sur le routeur.';
  else if (task.state === 'completed-with-warnings') phase = 'Terminé — un point à vérifier.';
  else if (task.state === 'failed') phase = 'Préparation interrompue.';
  else { const a = items[current]; if (a) phase = a.querySelector('.step-label').textContent.replace(/\s+/g, ' ').trim(); }
  byId('run-phase').textContent = phase;
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
  setRing('run-ring-fill', 0); // (re)synchronisé par renderSteps juste après
  byId('run-ring-fill').closest('.gauge').classList.toggle('gauge-spin', running && (task.progress?.step ?? 0) < 0);
  document.body.dataset.busy = String(running || busyCount > 0);
  renderSteps(task);
  renderSummary(task.result ?? connected);
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
  byId('health-run').disabled = busy;
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
  byId('health-ok').replaceChildren();
  const checks = [...report.checks].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const fine = checks.filter(c => c.severity === 'ok' || c.severity === 'info');
  byId('health-ok-box').hidden = !fine.length;
  byId('health-ok-title').textContent = `Contrôles conformes (${fine.length})`;
  for (const c of checks) {
    const target = c.severity === 'ok' || c.severity === 'info' ? byId('health-ok') : list;
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
    target.append(li);
  }
  const problems = report.checks.filter(c => c.severity === 'error' || c.severity === 'warn').length;
  const safe = report.checks.filter(c => c.fix && SAFE_FIXES.includes(c.fix));
  healthStatus(problems ? `${problems} problème(s) détecté(s) sur ${id.boardName} (SN ${id.serial}).` : `Aucun problème détecté sur ${id.boardName} (SN ${id.serial}).`, problems ? 'warn' : 'ok');
  return safe;
}

async function runFix(fix, title, button) {
  healthBusy(true);
  healthStatus(`En cours : ${title}…`, 'info');
  swirl(true, title, 'Application sur le routeur, puis vérification.');
  busy(button, true);
  try {
    const result = await api(`/agent/routers/${encodeURIComponent(byId('host').value.trim())}/fix`, { method: 'POST', body: JSON.stringify(healthBody({ fix })) });
    if (result.report) renderHealth(result.report);
    healthStatus(result.message, 'ok');
  } catch (error) { healthStatus(error.message, 'err'); }
  finally { healthBusy(false); busy(button, false); swirl(false); }
}

byId('health-run').addEventListener('click', runRepair);
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
  // Carte de session à la place du formulaire tant qu'un routeur est connecté.
  byId('session').hidden = !router;
  byId('connect-form').hidden = !!router;
  byId('topbar-disconnect').hidden = !router;
  if (router) {
    byId('session-title').textContent = `${router.model ?? 'Routeur'} · ${router.host}`;
    byId('session-meta').textContent = [router.version && `RouterOS ${router.version}`, router.serial && `SN ${router.serial}`, byId('tls').checked ? `chiffré (API-SSL ${byId('port').value})` : `non chiffré (API ${byId('port').value})`, `compte ${byId('username').value}`].filter(Boolean).join(' · ');
  }
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
    status.textContent = result.message;
    setTone(status, 'ok');
    if (!byId('tls').checked && byId('auto-tls').checked && !dryRun) await secureConnection(host, status);
    setConnected({ host, ...result });
    renderSummary(result, 'plan-summary');
    goto(2);
  } catch (error) {
    setConnected(null);
    status.textContent = error.message;
    setTone(status, 'err');
    // Certificat mémorisé devenu faux (routeur réinitialisé, certificat retiré) : on l'oublie.
    let saved = null;
    try { saved = localStorage.getItem(caKey(byId('host').value.trim())); } catch { /* stockage indisponible */ }
    if (saved && byId('tls').checked && /TLS|certificat|API-SSL/i.test(error.message)) {
      try { localStorage.removeItem(caKey(byId('host').value.trim())); } catch { /* idem */ }
      byId('tls').checked = false; byId('port').value = '8728'; byId('ca').value = '';
      byId('tls').dispatchEvent(new Event('change'));
      status.textContent = `${error.message} Certificat mémorisé obsolète (routeur réinitialisé ?) : retour au port 8728. Cliquez de nouveau sur « Se connecter » : un nouveau certificat sera créé.`;
      setTone(status, 'warn');
    }
  } finally { busy(button, false); busy(status, false); }
});

/* ── Chiffrement automatique (certificat créé sur le routeur) ─────────────
   Le certificat PUBLIC de l'autorité est mémorisé par routeur dans ce
   navigateur : la connexion suivante part directement en 8729 vérifié. */
const caKey = host => `slh-agent-ca:${host}`;
function applyTls(port, ca) {
  byId('tls').checked = true;
  byId('port').value = String(port);
  byId('ca').value = ca;
  byId('transport').textContent = 'Connexion chiffrée : certificat du routeur vérifié (adresse comprise).';
  setTone(byId('transport'), 'ok');
  advSummary();
}
async function secureConnection(host, status) {
  status.textContent = 'Chiffrement de la connexion : création du certificat sur le routeur (jusqu’à 1 minute)…';
  setTone(status, 'info'); busy(status, true);
  try {
    const result = await api(`/agent/routers/${encodeURIComponent(host)}/tls-setup`, { method: 'POST', body: JSON.stringify(connectionBody()) });
    applyTls(result.port, result.ca);
    try { localStorage.setItem(caKey(host), JSON.stringify({ port: result.port, ca: result.ca })); } catch { /* stockage indisponible */ }
    status.textContent = `${result.message} La suite passe par cette connexion chiffrée.`;
    setTone(status, 'ok');
  } catch (error) {
    status.textContent = `Connecté en 8728 (non chiffré). Chiffrement automatique impossible : ${error.message}`;
    setTone(status, 'warn');
  } finally { busy(status, false); }
}
function restoreTls() {
  try {
    const saved = JSON.parse(localStorage.getItem(caKey(byId('host').value.trim())) ?? 'null');
    if (saved?.ca) applyTls(saved.port, saved.ca);
  } catch { /* rien de mémorisé */ }
}
byId('host').addEventListener('change', restoreTls);
restoreTls();

/* ── Déconnexion : on oublie le routeur ET le mot de passe saisi ───────── */
function disconnect() {
  if (polling) {
    byId('connect-status').hidden = false;
    byId('connect-status').textContent = 'Une préparation est en cours : attendez la fin avant de vous déconnecter.';
    setTone(byId('connect-status'), 'warn');
    goto(1);
    return;
  }
  setConnected(null);
  byId('password').value = '';
  lastPassword = '';
  for (const id of ['plan-summary', 'packages', 'health-checks', 'health-identity']) byId(id).replaceChildren();
  byId('health-identity').hidden = true;
  byId('packages-apply').hidden = true;
  byId('packages-warn').hidden = true;
  byId('packages-note').textContent = '';
  byId('consent').checked = false;
  byId('wz-3').disabled = true;
  byId('connect-status').hidden = false;
  byId('connect-status').textContent = 'Déconnecté. Le mot de passe a été effacé de cette page.';
  setTone(byId('connect-status'), 'idle');
  showView('prep');
  goto(1);
  byId('password').focus();
}
byId('disconnect').addEventListener('click', disconnect);
byId('topbar-disconnect').addEventListener('click', disconnect);

/* ── Dépannage automatique ────────────────────────────────────────────────
   Au lieu d'exposer chaque compétence en menu : un tourbillon fait défiler les
   étapes, les réparations sûres s'appliquent, une relecture du routeur les
   CONFIRME, et l'utilisateur ne voit que le résultat (et ce qui reste à décider). */
const STAGES = [
  ['Identité du routeur', 'Modèle, numéro de série, adresse MAC, RouterOS'],
  ['Horloge', 'Heure et synchronisation NTP — sans elles, les tickets n’expirent pas'],
  ['Tickets MikHmon', 'Format des dates et balayage d’expiration'],
  ['Revenus MikHmon', 'Ventes lisibles par les rapports du jour et du mois'],
  ['Wi-Fi', 'Radios actives, SSID visible, canaux 5 GHz (DFS)'],
  ['Ports Ethernet', 'Erreurs physiques, coupures, vitesses négociées'],
  ['Internet', 'WAN, NAT, DNS, DHCP'],
  ['Hotspot et MikHmon', 'Serveur hotspot, conteneur, session'],
];
let swirlTimer;
function swirlText(title, sub = '') {
  const text = byId('swirl-text');
  text.classList.remove('swap'); void text.offsetWidth; text.classList.add('swap');
  text.textContent = title;
  byId('swirl-sub').textContent = sub;
}
function setDiagRing(pct, spin) { setRing('diag-ring-fill', pct, spin); byId('diag-pct').textContent = `${Math.round(pct)}%`; }
function swirl(on, title = '', sub = '', pct) {
  clearInterval(swirlTimer);
  byId('swirl').hidden = !on;
  document.body.dataset.busy = String(on || busyCount > 0);
  if (on) { swirlText(title, sub); setDiagRing(pct ?? 12, pct == null); }
}
function cycleStages() {
  let i = 0;
  swirl(true, `Analyse : ${STAGES[0][0]}`, STAGES[0][1], 4);
  swirlTimer = setInterval(() => {
    i += 1;
    const st = STAGES[i % STAGES.length];
    swirlText(`Analyse : ${st[0]}`, st[1]);
    setDiagRing(Math.min(48, ((i + 1) / STAGES.length) * 50));
  }, 1400);
}

async function runRepair() {
  const host = byId('host').value.trim();
  healthBusy(true);
  byId('repairs').replaceChildren();
  byId('health-status').hidden = true;
  cycleStages();
  try {
    let report = await api(`/agent/routers/${encodeURIComponent(host)}/health`, { method: 'POST', body: JSON.stringify(healthBody()) });
    if (!Array.isArray(report.checks)) { swirl(false); healthStatus(report.message ?? 'Aucun résultat.', 'warn'); return; }
    const problems = report.checks.filter(c => (c.severity === 'error' || c.severity === 'warn') && c.fix && SAFE_FIXES.includes(c.fix));
    const todo = [...new Map(problems.map(c => [c.fix, c])).values()];
    const applied = [];
    for (const [n, c] of todo.entries()) {
      clearInterval(swirlTimer);
      swirlText(`Réparation ${n + 1}/${todo.length} : ${c.title}`, 'Application sur le routeur…');
      setDiagRing(50 + (n / Math.max(1, todo.length)) * 45);
      try {
        const result = await api(`/agent/routers/${encodeURIComponent(host)}/fix`, { method: 'POST', body: JSON.stringify(healthBody({ fix: c.fix })) });
        if (result.report) report = result.report;
        applied.push({ check: c, message: result.message });
      } catch (error) { applied.push({ check: c, error: error.message }); }
    }
    if (todo.length) { swirlText('Vérification finale', 'Relecture du routeur pour confirmer chaque réparation'); setDiagRing(97); }
    swirl(false);
    renderHealth(report);
    renderRepairs(applied, report);
  } catch (error) {
    swirl(false);
    healthStatus(error.message, 'err');
  } finally { healthBusy(false); byId('health-status').hidden = false; }
}

/* Chaque réparation est CONFIRMÉE par la relecture : le même contrôle ne doit
   plus être en erreur/avertissement dans le rapport final. */
function renderRepairs(applied, report) {
  const list = byId('repairs');
  list.replaceChildren();
  for (const a of applied) {
    const still = report.checks.some(c => c.id === a.check.id && (c.severity === 'error' || c.severity === 'warn'));
    const state = a.error ? 'failed' : still ? 'partial' : 'done';
    const li = document.createElement('li');
    li.className = 'repair'; li.dataset.state = state;
    const mark = document.createElement('span'); mark.className = 'repair-mark'; mark.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = state === 'done' ? `${a.check.title} — réparé et vérifié` : state === 'partial' ? `${a.check.title} — appliqué, encore signalé` : `${a.check.title} — échec`;
    const detail = document.createElement('p'); detail.textContent = a.error ?? a.message;
    body.append(title, detail);
    li.append(mark, body);
    list.append(li);
  }
  const left = report.checks.filter(c => c.severity === 'error' || c.severity === 'warn').length;
  const fixed = applied.filter(a => !a.error && !report.checks.some(c => c.id === a.check.id && (c.severity === 'error' || c.severity === 'warn'))).length;
  const head = applied.length ? `${fixed} réparation(s) confirmée(s) sur le routeur.` : 'Aucune réparation automatique nécessaire.';
  healthStatus(`${head} ${left ? `${left} point(s) restent à votre décision ci-dessous.` : 'Le routeur est sain.'}`, left ? 'warn' : 'ok');
}
