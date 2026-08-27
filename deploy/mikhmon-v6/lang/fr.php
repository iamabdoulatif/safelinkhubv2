<?php
/*
 * Traduction française de MikHmon v3 (laksa19.github.io/?mikhmon/v3).
 *
 * Ce fichier se dépose tel quel dans le dossier `lang/` de MikHmon : le menu
 * des langues est construit par un `glob('lang/*')` (include/menu.php), et
 * « fr » est déjà déclaré dans lang/isocodelang.php. Rien d'autre à brancher.
 *
 * VOCABULAIRE — les choix qui ne vont pas de soi :
 *   Voucher      → « ticket ». C'est le mot qu'emploient les exploitants et le
 *                  reste de SafeLinkHub ; « bon » ou « coupon » ne se disent
 *                  pas sur le terrain.
 *   Profile      → « forfait » côté client (durée + prix + limites), mais
 *                  « profil » quand il s'agit de l'objet RouterOS, pour que
 *                  l'écran reste lisible à côté d'un WinBox ouvert.
 *   Expired mode → « à l'expiration » : c'est une action, pas un état.
 *   Uptime       → « temps de fonctionnement » pour le routeur, « temps
 *                  utilisé » pour un client : le même mot anglais couvre deux
 *                  notions opposées.
 *   Grace period → « délai de grâce », terme consacré en facturation.
 *
 * Les libellés courts restent courts : ils habitent des colonnes de tableau et
 * des boutons étroits, qu'une traduction bavarde ferait déborder sur mobile —
 * or ces écrans se consultent surtout au téléphone.
 */
$langid="fr";
$langname = "Français";
$language = "Langue";

$_about = "À propos";
$_action = "Action";
$_add = "Ajouter";
$_add_router = "Ajouter un routeur";
$_add_user = "Ajouter un client";
$_add_user_profile = "Ajouter un forfait";
$_admin = "Administrateur";
$_admin_settings = "Paramètres administrateur";
$_all = "Tout";
$_auto_reload = "Rafraîchissement auto";
$_bluetooth_ac = "Imprimer le code (Bluetooth)";
$_board_name = "Modèle de carte";
$_by_comment = "Par commentaire";
$_cancel = "Annuler";
$_character = "Caractères";
$_close = "Fermer";
$_comment = "Commentaire";
$_confirm = "Confirmer";
$_connecting = "Connexion en cours";
$_cpu_load = "Charge du processeur";
$_currency = "Devise";
$_dashboard = "Tableau de bord";
$_data_limit = "Volume de données";
$_date ="Date";
$_days = "j";
$_delete_data = "Supprimer les données";
$_delete = "Supprimer";
$_dhcp_leases = "Baux DHCP";
$_dns_name = "Nom DNS";
$_edit = "Modifier";
$_edit_user = "Modifier le client";
$_end = "Fin";
$_expired = "Expiré";
$_expired_mode = "À l'expiration";
$_extend_expired_date = "Prolonger l'expiration";
$_format_file_name = "Format du nom de fichier";
$_free_hdd = "Stockage libre";
$_free_memory = "Mémoire libre";
$_generate_code = "Générer le code";
$_generate = "Générer";
$_generate_user = "Générer des tickets";
$_grace_period = "Délai de grâce";
$_help = "Aide";
$_hosts = "Postes connectés";
$_hotspot_active = "Sessions actives";
$_hotspot_cookies = "Cookies";
$_hotspot_log = "Journal du hotspot";
$_hotspot_name = "Nom du hotspot";
$_hotspot_users = "Clients du hotspot";
$_hours = "h";
$_idle_timeout = "Délai d'inactivité";
$_income = "Recettes";
$_interface = "Interface";
$_ip_bindings = "Associations IP";
$_last_generate = "Dernière génération";
$_list_logo = "Logos disponibles";
$_live_report = "Rapport en direct";
$_loading = "Chargement";
$_loading_interface = "Chargement de l'interface";
$_loading_theme = "Chargement du thème";
$_lock_user = "Verrouiller sur un appareil";
$_log = "Journal";
$_logout = "Déconnexion";
$_messages = "Messages";
$_min = "min";
$_minutes = "minutes";
$_model = "Modèle";
$_name = "Nom";
$_no = "Non";
$_open = "Ouvrir";
$_package = "Paquet";
$_password = "Mot de passe";
$_please_login = "Veuillez vous connecter";
$_ppp_active = "PPP actifs";
$_ppp_profiles = "Profils PPP";
$_ppp_secrets = "Comptes PPP";
$_prefix = "Préfixe";
$_price = "Prix";
$_print_default = "Standard";
$_print = "Imprimer";
$_print_qr = "QR";
$_print_small = "Petit format";
$_processing = "Traitement en cours…";
$_profile = "Forfait";
$_qty = "Qté";
$_quick_print = "Impression rapide";
$_random = "Aléatoire";
$_readme = "Mode d'emploi";
$_reboot = "Confirmez-vous le redémarrage";
$_reduce_expired_date = "Raccourcir l'expiration";
$_remove = "Retirer";
$_report = "Rapport";
$_reset_start_date = "Réinitialiser la date de début";
$_resume = "Reprendre";
$_router_list = "Liste des routeurs";
$_save = "Enregistrer";
$_search = "Rechercher";
$_sec = "s";
$_seconds = "secondes";
$_selected = "Sélection";
$_select_interface = "Choisir l'interface";
$_selling_price = "Prix de vente";
$_selling_report = "Rapport des ventes";
$_send_to_WA = "Envoyer sur WhatsApp";
$_session_name = "Nom de la session";
$_session = "Session";
$_session_settings = "Paramètres de session";
$_settings = "Paramètres";
$_share = "Partager";
$_show_all = "Tout afficher";
$_shutdown = "Confirmez-vous l'extinction";
$_start = "Début";
$_system_date_time = "Date et heure du système";
$_system_off = "Éteindre";
$_system_reboot = "Redémarrer";
$_system_scheduler = "Planificateur";
$_system = "Système";
$_template_editor = "Éditeur de modèle";
$_theme = "Thème";
$_this_month = "Ce mois-ci";
$_time_limit = "Durée de connexion";
$_time = "Heure";
$_today = "Aujourd'hui";
$_total = "Total";
$_traffic_interface = "Interface surveillée";
$_traffic_monitor = "Moniteur de trafic";
$_traffic = "Trafic";
$_upload = "Téléverser";
$_upload_logo = "Téléverser un logo";
$_uptime = "Temps de fonctionnement";
$_uptime_user = "Temps utilisé";
$_user_length = "Longueur du nom";
$_user_list = "Liste des clients";
$_user_log = "Journal des clients";
$_user_mode = "Type d'identifiant";
$_user_name = "Nom d'utilisateur";
$_user_pass = "Nom d'utilisateur et mot de passe";
$_user_profile_list = "Liste des forfaits";
$_user_profile = "Forfait client";
$_users = "Clients";
$_user_user = "Nom d'utilisateur = mot de passe";
$_validity = "Validité";
$_voucher_code ="Code du ticket";
$_vouchers = "Tickets";
$_yes = "Oui";





//details
$_format_time_limit = '
    Format de la '.$_time_limit.'.<br>
    [wdhm] Exemples : 30d = 30'.$_days.', 12h = 12'.$_hours.', 4w3d = 31'.$_days.'.
';
$_details_add_user = '
    '.$_add_user.' avec une '.$_time_limit.'.<br>
    La '.$_time_limit.' doit être inférieure à la '.$_validity.'.
';

$_details_user_profile = '
'.$_expired_mode.' décide du sort du client une fois son ticket épuisé.<br>
Options : Supprimer, Avertir, Supprimer et enregistrer, Avertir et enregistrer.
<ul>
<li>Supprimer : le client est effacé à l\'expiration.</li>
<li>Avertir : le client est conservé et reçoit une notification après expiration.</li>
<li>Enregistrer : conserve le prix de chaque connexion, pour calculer le total des ventes du hotspot.</li>
</ul>
</p>

        <p>'.$_lock_user.' : le nom d\'utilisateur ne peut servir que sur un seul appareil.</p>
';

$_format_validity = '
Format de la '.$_validity.'<br>
[wdhm] Exemples : 30d = 30'.$_days.', 12h = 12'.$_hours.', 30m = 30'.$_minutes.'<br>
5'.$_hours.' 30'.$_minutes.' = 5h30m';

$_format_ip_binding = '
    Format des limites de débit (envoi/réception)<br>
    [k / M] Exemples : 512k, 1500k, 1M<br><br>
    Format de la '.$_validity.'<br>
    [d] Exemple : 30d = 30'.$_days.'.<br>
';

$_help_report = '
<ul>
<li>Cliquez sur CSV pour télécharger.</li>
<li>Pour filtrer par mois, choisissez le jour et le mois, puis cliquez sur Filtrer.<br>
	<img width="70%" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAATUAAAAsCAYAAAAEsS/jAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAOlSURBVHhe7d09TtxAGMbxnCYSKOJDCggtqZIqHCRVpFwDiYJj0MARIq2i5QQUW6RH0CJST/x6bM/YM7Z38cfi1//iJ2F7PCvGfp+ZYQs+nH+7MACgBaEGQBVCDYAqhBoAVQg1AKoQagBUaQy1xdfv0fMA8F7VhtrBycLsH382Hz8dYgf2jxh74C2ioXZ4ujB7SVEdn33BjuQPKHYNmJtt6iEINdlyygrt+Ow8aIzxEGqA0ynUBMW0e4Qa4BBqChBqgEOoKUCoAQ6hpgChBjiEmgKEGuAQagoQaoBDqClAqAHOiKF2bZZP/8zLa+jhNtYem+oUardr8/J0by5j14AJGj3UggC7ujePBFsnhBrg7D7UhBTW69rc5MdZ0LnV3LNZXtlrN+vkeH3n3W/7fVxde+em7ffyj/e7W3Iu1lb0GmoNY2+vrc1y9eyue/deyvlSQN6Zh6SNe+bhat09N2nr9f3016yD51rtD3MwZD0MF2rpy5oVT7ByywohL5ZoAHrHCvz4+St4iHIu1lb0FmptY58HXjGp2JDJg6c51LK+vAkpbV+Epm0bXPf7Y1U5S0PWw4Ch1nSt+nKXZ+v0WmnlpoM/OzXNSqK3UIsojX0aat7KLeGvnIMQqjyrQKm/SNvK58lnaVqRY3ND1cPIoZbN3DmvWPyXW36uLZoJ82enpllJ9B9qNWPfU6il9xT9N4Ra6b2Qn8ufjfkYqh7G2X56BVW7rSkKUdrq2nr6ZEZqm5VEf6HWMvYdQ60Is2h/5ba5tE/pX9qW+sbcDFEP43xREFk5xIslKYZV0lbh1jMnM1LbrCS2eYhFSOTn/PFuG/tOoZY9M3+ltUGo2Tb2CwS2nvM2RD0ME2rpS+ud9wOuOPZm90w+60dDcma2eYjV8fVDqXXsW0LNtnfX05ArnlE1tOxx8/ZT2Pem9C0s0GD0UEuLpCR8WYttipCCqhRLqlqAM7ZVqCWC8W265o99W6hV7n9c3ZUnsjwkU9KPDTK7AqsLtdgKEKg3Yqj1TArE30bN2LahNjUSamw9sanJhpqsCGKz+hzpDjVZ4YereaDO9EIt+xscqzRHbahl21VWadjG9EINAbWhBrwBoaYAoQY4hJoChBrgEGoKEGqA0ynU3D8zjt+AcRBqgNMp1MTBycLsHfFf2neJUAOczqEmDk8X6Yot7wzj2k8mldh5AM1qQ03IVjR2HgDeq8ZQA4CpIdQAqEKoAVCFUAOgCqEGQBVCDYAiF+Y/bd3pxgv3MhEAAAAASUVORK5CYII=">
	</li>
	<li>Pour filtrer sur le '.$_prefix.', saisissez-le dans la recherche puis cliquez sur Filtrer.</li>
	<li>Pour filtrer sur le '.$_comment.', saisissez !!'.$_comment.' dans la colonne puis cliquez sur Filtrer. Ou cliquez sur l\'un des commentaires (MikHmon Online).</li>
	<li>Il est conseillé de supprimer le rapport des ventes après avoir téléchargé le CSV.</li>
	</ul>
';

$_delete_report = '
<ul>
		        <li>Supprimer le rapport des ventes supprime aussi le journal des clients.</li>
		        <li>Il est conseillé de télécharger d\'abord le '.$_user_log.'.</li>
		      </ul>
';
