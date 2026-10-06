const byId = id => document.getElementById(id);
let token = '';
let deadline;
let polling = false;

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

function setTone(el, tone) { el.dataset.tone = tone; }

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
    if (task.state === 'simulated') state = 'todo';
    li.dataset.state = state;
    if (state === 'done' || state === 'warn') done += 1;
  });
  byId('meter-fill').style.width = `${Math.round((done / STEP_COUNT) * 100)}%`;
  byId('progress').value = done;
}

function renderSummary(result) {
  const box = byId('summary');
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
  byId('status').textContent = task.error || labels[task.state] || task.progress?.message || 'Vérification en cours…';
  const waiting = task.progress?.state === 'waiting-physical';
  setTone(byId('status-box'), task.state === 'failed' ? 'err'
    : task.state === 'completed-with-warnings' || waiting ? 'warn'
    : task.state === 'completed' ? 'ok'
    : 'info');
  deadline = task.state === 'running' ? task.progress?.deadline : undefined;
  renderSteps(task);
  renderSummary(task.result);
  const plan = task.plan ? task.plan.map(words => words.join(' ')).join('\n') : '';
  byId('result').textContent = plan;
  byId('result').hidden = !plan;
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

function connectionBody() {
  return { username: byId('username').value, password: byId('password').value, port: Number(byId('port').value), tls: byId('tls').checked, ca: byId('ca').value.trim() || undefined, updateRouterOS: byId('update-ros').checked };
}
byId('factory').addEventListener('click', () => {
  byId('tls').checked = false;
  byId('tls').dispatchEvent(new Event('change'));
});
byId('update-ros').addEventListener('change', () => {
  byId('steps').children[1].querySelector('.step-label').textContent = byId('update-ros').checked ? 'Mettre RouterOS à jour (stable)' : 'Mise à jour RouterOS différée';
});
byId('diagnose').addEventListener('click', async () => {
  byId('fields').disabled = true;
  byId('status').textContent = 'Test de connexion administrateur en lecture seule…';
  setTone(byId('status-box'), 'info');
  try {
    const result = await api(`/agent/routers/${encodeURIComponent(byId('host').value.trim())}/diagnose`, { method: 'POST', body: JSON.stringify(connectionBody()) });
    byId('status').textContent = result.message;
    setTone(byId('status-box'), 'ok');
    renderSummary(result);
  } catch (error) {
    byId('status').textContent = error.message;
    setTone(byId('status-box'), 'err');
  } finally { byId('fields').disabled = false; }
});

byId('configure').addEventListener('submit', async event => {
  event.preventDefault();
  byId('fields').disabled = true;
  try {
    const task = await api(`/agent/routers/${encodeURIComponent(byId('host').value.trim())}/configure`, { method: 'POST', body: JSON.stringify(connectionBody()) });
    byId('password').value = '';
    render(task);
    await follow(task.id);
  } catch (error) {
    byId('status').textContent = error.message;
    setTone(byId('status-box'), 'err');
    byId('fields').disabled = false;
  }
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
    if (health.dryRun) setMode('Simulation — aucune écriture', 'warn');
    else setMode('Agent connecté', 'ok');
    byId('submit').textContent = health.dryRun ? 'Simuler le parcours' : 'Mettre à jour et configurer';
    byId('submit').disabled = false;
    const previous = sessionStorage.getItem('safelinkhub-task');
    if (previous) await follow(previous);
  } catch (error) {
    setMode('Agent injoignable', 'err');
    byId('status').textContent = error.message;
    setTone(byId('status-box'), 'err');
  }
})();
