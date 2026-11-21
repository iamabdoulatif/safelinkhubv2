import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRelayNginxConfig } from "./relay-nginx";
import { provisionCloudMikhmon } from "./mikhmon-cloud";

describe("routage des instances MikHmon cloud", () => {
  it("nginx ne sert plus les sous-domaines cloud", async () => {
    /* Le relais fait tourner nginx ET Traefik ; Traefik détient 80 et 443.
       Un vhost nginx en `listen 443` ne pouvait donc pas se lier — et comme
       la synchro écrit UN SEUL fichier pour toutes les redirections, un vhost
       invalide y faisait échouer `nginx -t` et gelait la mise à jour de
       l'ensemble. Vérifié sur le relais : le test de configuration échoue. */
    const config = buildRelayNginxConfig({
      webForwards: [
        { publicPort: 57007, targetPort: 8089, tunnelIp: "10.66.0.12", relayHost: "s4.safelinkhub.io" },
      ],
    });
    assert.match(config, /listen 57007 ssl http2;/, "les redirections par port restent servies par nginx");
    assert.match(config, /error_page 497 =301 https:\/\/\$host:\$server_port\$request_uri;/, "les anciens liens HTTP sont redirigés vers HTTPS");
    assert.doesNotMatch(config, /listen 443/, "plus aucun vhost sur le port que Traefik détient");
    assert.doesNotMatch(config, /mikhmon\.safelinkhub\.io/);
  });

  it("connexions réutilisées vers le routeur, HTTP/2 et cache TLS côté navigateur", () => {
    const config = buildRelayNginxConfig({
      webForwards: [
        { publicPort: 39007, targetPort: 8089, tunnelIp: "10.66.0.5", relayHost: "s2.safelinkhub.io" },
        { publicPort: 39023, targetPort: 85, tunnelIp: "10.66.0.31", relayHost: "s2.safelinkhub.io" },
      ],
    });
    assert.match(config, /upstream slh_fwd_39007 \{\n  server 10\.66\.0\.5:8089;\n  keepalive 8;/);
    assert.match(config, /proxy_pass http:\/\/slh_fwd_39007;/);
    assert.match(config, /proxy_set_header Connection "";/, "sans cela nginx ferme la connexion amont à chaque requête");
    assert.match(config, /listen 39023 ssl http2;/);
    assert.equal(config.match(/ssl_session_cache/g)?.length, 1, "un seul cache TLS, au niveau http");
  });

  it("le conteneur porte les labels Traefik de son sous-domaine", async () => {
    const commandes: string[] = [];
    const instance = await provisionCloudMikhmon({
      router: {
        id: "8f14e45f-ceea-467a-9c1b-14174000abcd",
        name: "RB951 Korhogo",
        tunnelIp: "10.66.0.12",
        username: "slh",
        password: "secret",
        hotspotName: "KORHOGO",
        dnsName: "korhogo.sn.mynetname.net",
      },
      existing: null,
      usedPorts: [],
      baseDomain: "mikhmon.safelinkhub.io",
      run: async (c) => {
        commandes.push(c);
        return "";
      },
    });

    const cmd = commandes.join("\n");
    assert.match(cmd, /--network 'safelink_safelink_net'/, "sans ce réseau, Traefik ne voit pas le conteneur");
    assert.match(cmd, /traefik\.enable=true/);
    assert.match(cmd, new RegExp(`rule=Host\\(\`${instance.domain.replace(/\./g, "\\.")}\`\\)`));
    assert.match(cmd, /entrypoints=websecure/);

    /* Le certificat joker est épinglé plutôt que laissé au résolveur : sans
       cela Traefik demanderait UN certificat par routeur, et les quotas
       Let's Encrypt tomberaient au bout de quelques dizaines d'instances. */
    assert.match(cmd, /tls\.domains\[0\]\.main=mikhmon\.safelinkhub\.io/);
    assert.match(cmd, /tls\.domains\[0\]\.sans=\*\.mikhmon\.safelinkhub\.io/);
    assert.match(cmd, /loadbalancer\.server\.port=80/);

    // Le chemin de diagnostic local reste publié, et sur la boucle locale seule.
    assert.match(cmd, /--publish '127\.0\.0\.1:20000:80'/);
  });

  it("refuse un domaine de base dangereux au lieu de le poser dans un label", async () => {
    /* Cette garde vivait dans le vhost nginx retiré. La perdre aurait laissé
       une valeur non validée filer dans une règle Host() et un label Docker. */
    await assert.rejects(
      () =>
        provisionCloudMikhmon({
          router: {
            id: "8f14e45f-ceea-467a-9c1b-14174000abcd",
            name: "RB951",
            tunnelIp: "10.66.0.12",
            username: "slh",
            password: "secret",
            hotspotName: "K",
            dnsName: "d",
          },
          existing: null,
          usedPorts: [],
          baseDomain: "../../etc",
          run: async () => "",
        }),
      /invalid/i,
    );
  });

  it("réutilise une instance déjà active sans relancer de conteneur", async () => {
    const commandes: string[] = [];
    const instance = await provisionCloudMikhmon({
      router: {
        id: "8f14e45f-ceea-467a-9c1b-14174000abcd",
        name: "RB951",
        tunnelIp: "10.66.0.12",
        username: "slh",
        password: "secret",
        hotspotName: "K",
        dnsName: "d",
      },
      existing: {
        domain: "deja.mikhmon.safelinkhub.io",
        containerName: "slh-mikhmon-x",
        localPort: 20_005,
        status: "active",
      },
      usedPorts: [20_005],
      baseDomain: "mikhmon.safelinkhub.io",
      run: async (c) => {
        commandes.push(c);
        return "";
      },
    });
    assert.equal(instance.domain, "deja.mikhmon.safelinkhub.io");
    /* « Ne rien relancer » portait sur le CONTENEUR, pas sur la session : une
       seconde activation repose désormais config.php depuis la base, ce qui
       fait du bouton un correctif pour les instances créées avant qu'on sache
       la pré-remplir. Ce qui reste interdit, c'est un second conteneur. */
    assert.ok(!commandes.some((c) => c.includes("docker run")), "un second conteneur a été créé");
    assert.ok(!commandes.some((c) => c.includes("docker start")), "conteneur actif relancé pour rien");
  });
});
