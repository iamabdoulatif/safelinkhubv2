# Station de contrôle des tickets — conception

**Date :** 19 juillet 2026
**Statut :** validé pour planification
**Portée :** `/admin/vouchers`

## Objectif

Transformer la page Tickets en une station de contrôle dense et élégante, adaptée au travail quotidien des administrateurs SafeLinkHub. Elle doit permettre d'importer des tickets exportés depuis MikHmon au format CSV, de reconnaître leurs profils et d'archiver/restaurer les tickets sans risquer de supprimer leur compte MikroTik.

Le design retenu est **Station de contrôle** : fond clair chaud, surfaces noir charbon, jaune SafeLinkHub pour l'action et les informations prioritaires, rouge réservé aux actions irréversibles ou erreurs.

## Expérience de la page

La page conserve la liste des tickets, mais l'encadre comme une console opérationnelle :

- un en-tête « Station Tickets » affiche les nombres de tickets actifs, importés et archivés ;
- l'action principale **Importer** ouvre un choix clair entre MikHmon et CSV ;
- un onglet/filtre **Corbeille** affiche les tickets archivés, avec leur date d'archivage ;
- les lignes mettent en avant le code, le profil, la source/l'utilisation et l'état, avec une pastille d'état discrète ;
- la sélection multiple révèle une barre d'actions compacte ;
- les états vide, chargement, réussite et erreur ont une surface dédiée cohérente avec le design.

Les couleurs de référence sont : charbon `#171717`, jaune `#F3B900`, crème `#F7F6F3`, bordure sable `#DED8CA`, rouge d'erreur `#D85243`.

## Corbeille et annulation

### Archivage

- Le libellé utilisateur est **Archiver** ; il remplace l'idée de suppression immédiate.
- L'archivage retire le ticket de la liste active et renseigne `deletedAt` en base.
- Il ne modifie ni le compte Hotspot, ni les sessions actives, ni les profils sur le ou les routeurs MikroTik. C'est indispensable pour que la restauration soit fiable.
- Après l'action, un retour de succès permet d'**Annuler** immédiatement. Le ticket reste également récupérable depuis la corbeille sans limite temporelle dans cette version.

### Restauration

- La restauration, unitaire ou par lot, vide `deletedAt` et remet le ticket dans la liste active avec toutes ses liaisons routeur d'origine.
- Les actions ne fonctionnent que sur des tickets de l'organisation de l'administrateur connecté.

### Exclusion volontaire

Cette version n'offre pas de suppression définitive. Un effacement physique demanderait de décider explicitement du traitement distant de chaque compte MikroTik et ne doit pas être implicite dans une corbeille restaurable.

## Import CSV MikHmon

Le fichier de référence fourni est un export MikHmon avec les colonnes :

```csv
Username,Password,Profile,Time Limit,Data Limit,Comment
1jyd59,1jyd59,01-JOUR,,,vc-850-05.11.26-alima
```

### Parcours

1. L'administrateur ouvre **Importer → Fichier CSV**.
2. Il choisit **un unique routeur** appartenant à son organisation : l'export CSV MikHmon ne contient pas de colonne routeur, ce choix rend la provenance exacte.
3. Il dépose le fichier `.csv` dans une zone dédiée, qui rappelle les colonnes reconnues.
4. L'interface affiche un aperçu et un bilan : tickets prêts, doublons, profils associés et lignes à vérifier.
5. La confirmation lance l'import puis affiche le résultat détaillé sans masquer les avertissements.

### Règles de lecture

- Accepter UTF-8 avec ou sans BOM et détecter un séparateur virgule ou point-virgule.
- Limiter un import à 2 000 lignes et 2 Mo ; un fichier hors limite est refusé avant toute écriture.
- `Username` est obligatoire et devient le code du ticket. Les valeurs vides, dupliquées dans le fichier ou déjà suivies par l'organisation sont signalées et ignorées.
- `Password` est lu seulement pour la compatibilité avec l'export MikHmon. Il n'est pas conservé, exposé ni journalisé par SafeLinkHub.
- `Profile` et `Comment` sont conservés ; le commentaire devient la note du ticket. `Time Limit` et `Data Limit` sont lus afin de valider l'export, mais ne sont pas persistés dans cette version : le CSV adopte des tickets existants sans reconfigurer le routeur.
- L'import CSV adopte un inventaire existant : il **n'ajoute et ne modifie aucun utilisateur sur MikroTik**. La création de nouveaux comptes reste réservée au générateur de vouchers.
- Un ticket déjà présent dans la corbeille est signalé comme tel et n'est pas réactivé automatiquement ; l'administrateur doit le restaurer volontairement.

## Reconnaissance des profils MikHmon

La reconnaissance repose sur une normalisation partagée par l'import CSV et le scan MikHmon : espaces et tirets sont harmonisés, la casse est ignorée, et les durées usuelles sont reconnues. Ainsi `01-JOUR` de l'exemple est rattaché au forfait « 1 jour » configuré dans l'organisation ; les variantes équivalentes (`1 JOUR`, `01 JOUR`, `01-JOURS`) sont aussi reconnues.

- Le `profileName` d'origine reste affiché et conservé.
- Lorsqu'une durée reconnue correspond à un forfait de l'organisation, `packageId` est renseigné.
- Lorsqu'aucun forfait ne correspond, le ticket est tout de même importable avec son profil d'origine et sans `packageId`, mais l'aperçu et le bilan le signalent explicitement comme **profil non associé**.

## Architecture fonctionnelle

- Une fonction pure analyse et normalise les lignes CSV. Elle est réutilisable côté aperçu et côté serveur ; le serveur valide toujours le fichier à nouveau avant l'écriture.
- Une fonction pure de reconnaissance de profil associe un libellé MikHmon à une durée et à un forfait existant, sans dépendre de l'interface.
- Les Server Actions exigent une session administrateur, contrôlent l'organisation et vérifient que le routeur choisi lui appartient.
- Les écritures sont groupées avec `db.batch`, compatible avec le pilote Neon HTTP déjà utilisé par l'application.
- Les actions de mutation invalident `/admin/vouchers` après succès afin de rafraîchir les compteurs et listes.

## Données

La table `vouchers` reçoit une colonne nullable `deletedAt`. Aucun champ de mot de passe n'est ajouté. Les relations existantes `voucherRouters` sont préservées pendant l'archivage et la restauration.

Les requêtes de la liste active filtrent `deletedAt IS NULL` ; la corbeille utilise `deletedAt IS NOT NULL` et affiche les données de même organisation.

## Gestion des erreurs et sécurité

- Toute action renvoie un message compréhensible et des compteurs d'éléments traités, ignorés ou en erreur.
- Une erreur sur une ligne CSV n'annule pas les autres lignes valides.
- Une erreur de connexion au routeur n'empêche pas l'import CSV, car ce dernier ne contacte pas MikroTik.
- Les erreurs serveur ne révèlent ni mots de passe CSV, ni paramètres de routeurs.
- Les actions refusent les identifiants de tickets ou routeurs hors organisation, même s'ils sont forgés dans le navigateur.

## Critères d'acceptation

1. Un administrateur peut importer le CSV MikHmon fourni pour un routeur sélectionné et voir les tickets avec le profil `01-JOUR` associé à son forfait « 1 jour » lorsqu'il existe.
2. Un import montre clairement les comptes créés, les doublons ignorés et les profils non associés.
3. Archiver un ou plusieurs tickets les retire de la liste active sans supprimer l'utilisateur distant.
4. Le ticket archivé apparaît dans la corbeille et peut être restauré seul ou en lot avec ses liaisons routeur intactes.
5. Un administrateur ne peut ni importer dans le routeur d'une autre organisation, ni archiver/restaurer ses tickets.
6. Le rendu reste lisible sur mobile et conserve les repères visuels jaune/noir/blanc de SafeLinkHub.

## Hors périmètre

- suppression définitive d'un utilisateur MikroTik ;
- création de comptes MikroTik depuis un CSV ;
- conservation des mots de passe issus de fichiers CSV ;
- configuration automatique de nouveaux profils RouterOS.
