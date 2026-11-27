/**
 * Le MikroTik remplace lui-même ses variables `$(…)` au moment de servir la
 * page. Hors du routeur, elles s'afficheraient en clair : on rejoue ici le cas
 * d'un visiteur qui arrive sur le portail (pas d'erreur, pas de CHAP).
 * Les blocs `$(if x)…$(else)…$(endif)` sont résolus du plus intérieur au plus
 * extérieur, condition toujours fausse.
 */
export function simulateHotspotPage(html: string, sample: { identity: string }): string {
  const bloc = /\$\(if [^)]*\)((?:(?!\$\(if )[\s\S])*?)\$\(endif\)/;
  let out = html;
  for (let i = 0; i < 50 && bloc.test(out); i++) {
    out = out.replace(bloc, (_, body: string) => {
      const sinon = body.split(/\$\(else\)/)[1];
      return sinon ?? "";
    });
  }
  const valeurs: Record<string, string> = {
    "link-login-only": "#",
    "link-login": "#",
    "link-orig": "#",
    "link-logout": "#",
    "link-status": "#",
    "link-redirect": "#",
    identity: sample.identity,
    "server-name": sample.identity,
    // Un visiteur réel a toujours une MAC. Le flux de paiement injecté
    // (portalPayInjection) ne s'active QUE si cfg.mac est une vraie MAC
    // (configured() : mac présente et ne commençant pas par "$("). La blanchir
    // ici désactivait le bouton d'achat dans l'aperçu — « la fenêtre de paiement
    // ne s'ouvre pas » — alors que sur le routeur RouterOS substitue la vraie
    // MAC. On rejoue donc une MAC d'exemple pour que l'aperçu soit fidèle.
    mac: "02:00:00:00:00:01",
    "mac-esc": "02:00:00:00:00:01",
  };
  return out.replace(/\$\(([a-z0-9-]+)\)/g, (_, name: string) => valeurs[name] ?? "");
}
