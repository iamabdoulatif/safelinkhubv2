# Plan — FUP prorata et tickets

1. Vérifier le budget existant (solde/durée restante) et garder les cycles réels.
2. Tester puis créer une machine d'état pure : référence, fenêtre de volume,
   bridage, persistance, blocage cinq heures et expiration sans prolongation.
3. Ajouter politique/état JSONB distincts de l'observation n8n ; sérialiser cron
   et n8n par verrou dédié ; maintenir l'autorité du moteur serveur.
4. Appliquer des files enfants FUP et des blocages sur les comptes locaux,
   avec récupération locale vérifiée, sans modifier les commentaires Mikhmon.
5. Exposer les réglages/états et l'explication du prorata dans le SaaS et le
   récap n8n ; conserver les alertes du moteur.
6. Vérifier tests, typecheck, lint ; relecture des reprises partielles ; test
   natif d'expiration sur un compte temporaire isolé. Déployer et vérifier UI,
   API et workflow publié. Pas d'activation des sanctions sur les clients
   avant configuration par zone ; FOUANGA doit rester en observation jusqu'à
   rapprochement des consommations après redémarrage.
