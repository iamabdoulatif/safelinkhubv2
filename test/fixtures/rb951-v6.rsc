# aug/31/2026 15:32:19 by RouterOS 6.49.17
# software id = J4IW-34J6
#
# model = 951Ui-2HnD
# serial number = HJ10ACGPYT6
/interface bridge
add fast-forward=no name=HOTSPOT protocol-mode=none
/interface ethernet
set [ find default-name=ether1 ] name=E1-WAN-FAI
set [ find default-name=ether2 ] name="PORT 2"
set [ find default-name=ether3 ] name="PORT 3"
set [ find default-name=ether4 ] name="PORT 4"
set [ find default-name=ether5 ] name="PORT 5"
/interface wireless
set [ find default-name=wlan1 ] band=2ghz-b/g/n country=no_country_set \
    disabled=no frequency=auto frequency-mode=manual-txpower installation=\
    indoor mode=ap-bridge radio-name="SAMASSA WIFI 0707607782" ssid=\
    "SAMASSA WIFI 0707607782" wireless-protocol=802.11 wps-mode=disabled
/interface list
add name=LAN
add name=WAN
/interface wireless security-profiles
set [ find default=yes ] supplicant-identity=MikroTik
/ip firewall layer7-protocol
add comment="Block Bit Torrent" name=layer7-bittorrent-exp regexp="^(\\x13bitt\
    orrent protocol|azver\\x01\$|get /scrape\\\?info_hash=get /announce\\\?inf\
    o_hash=|get /client/bitcomet/|GET /data\\\?fid=)|d1:ad2:id20:|\\x08'7P\\)[\
    RP]"
add name=p2p_dns regexp="^.+(torrent|thepiratebay|isohunt|kat|smartorrent|cpas\
    bien|t411|entertane|demonoid|btjunkie|mininova|flixflux|vertor|h33t|zoozle\
    |bitnova|bitsoup|meganova|fulldls|btbot|fenopy|gpirate|commonbits).*\\\$"
add name=p2p_www regexp="^.*(get|GET).+(torrent|thepiratebay|isohunt|kat|smart\
    orrent|cpasbien|t411|entertane|demonoid|btjunkie|mininova|flixflux|vertor|\
    h33t|zoozle|bitnova|bitsoup|meganova|fulldls|btbot|fenopy|gpirate|commonbi\
    ts).*\\\$"
/ip hotspot profile
set [ find default=yes ] login-by=cookie,http-chap,http-pap
add dns-name=samassa.ci hotspot-address=10.10.10.1 html-directory=SAMFORUM \
    html-directory-override=SAMFORUM http-cookie-lifetime=52w1d login-by=\
    mac,cookie,http-chap,http-pap,mac-cookie mac-auth-mode=\
    mac-as-username-and-password name=samassawifi use-radius=yes
/ip hotspot user profile
add name=JOUR on-login=":put (\",rem,200,1d,200,,Disable,\"); {:local date [ /\
    system clock get date ];:local year [ :pick \$date 7 11 ];:local month [ :\
    pick \$date 0 3 ];:local comment [ /ip hotspot user get [/ip hotspot user \
    find where name=\"\$user\"] comment]; :local ucode [:pic \$comment 0 2]; :\
    if (\$ucode = \"vc\" or \$ucode = \"up\" or \$comment = \"\") do={ /sys sc\
    h add name=\"\$user\" disable=no start-date=\$date interval=\"1d\"; :delay\
    \_2s; :local exp [ /sys sch get [ /sys sch find where name=\"\$user\" ] ne\
    xt-run]; :local getxp [len \$exp]; :if (\$getxp = 15) do={ :local d [:pic \
    \$exp 0 6]; :local t [:pic \$exp 7 16]; :local s (\"/\"); :local exp (\"\$\
    d\$s\$year \$t\"); /ip hotspot user set comment=\$exp [find where name=\"\
    \$user\"];}; :if (\$getxp = 8) do={ /ip hotspot user set comment=\"\$date \
    \$exp\" [find where name=\"\$user\"];}; :if (\$getxp > 15) do={ /ip hotspo\
    t user set comment=\$exp [find where name=\"\$user\"];}; /sys sch remove [\
    find where name=\"\$user\"]}}" parent-queue=none
add name=1-SEMAINE on-login=":put (\",rem,700,7d,700,,Disable,\"); {:local dat\
    e [ /system clock get date ];:local year [ :pick \$date 7 11 ];:local mont\
    h [ :pick \$date 0 3 ];:local comment [ /ip hotspot user get [/ip hotspot \
    user find where name=\"\$user\"] comment]; :local ucode [:pic \$comment 0 \
    2]; :if (\$ucode = \"vc\" or \$ucode = \"up\" or \$comment = \"\") do={ /s\
    ys sch add name=\"\$user\" disable=no start-date=\$date interval=\"7d\"; :\
    delay 2s; :local exp [ /sys sch get [ /sys sch find where name=\"\$user\" \
    ] next-run]; :local getxp [len \$exp]; :if (\$getxp = 15) do={ :local d [:\
    pic \$exp 0 6]; :local t [:pic \$exp 7 16]; :local s (\"/\"); :local exp (\
    \"\$d\$s\$year \$t\"); /ip hotspot user set comment=\$exp [find where name\
    =\"\$user\"];}; :if (\$getxp = 8) do={ /ip hotspot user set comment=\"\$da\
    te \$exp\" [find where name=\"\$user\"];}; :if (\$getxp > 15) do={ /ip hot\
    spot user set comment=\$exp [find where name=\"\$user\"];}; /sys sch remov\
    e [find where name=\"\$user\"]}}" parent-queue=none
add name=2-SEMAINE on-login=":put (\",rem,1300,14d,1300,,Disable,\"); {:local \
    date [ /system clock get date ];:local year [ :pick \$date 7 11 ];:local m\
    onth [ :pick \$date 0 3 ];:local comment [ /ip hotspot user get [/ip hotsp\
    ot user find where name=\"\$user\"] comment]; :local ucode [:pic \$comment\
    \_0 2]; :if (\$ucode = \"vc\" or \$ucode = \"up\" or \$comment = \"\") do=\
    { /sys sch add name=\"\$user\" disable=no start-date=\$date interval=\"14d\
    \"; :delay 2s; :local exp [ /sys sch get [ /sys sch find where name=\"\$us\
    er\" ] next-run]; :local getxp [len \$exp]; :if (\$getxp = 15) do={ :local\
    \_d [:pic \$exp 0 6]; :local t [:pic \$exp 7 16]; :local s (\"/\"); :local\
    \_exp (\"\$d\$s\$year \$t\"); /ip hotspot user set comment=\$exp [find whe\
    re name=\"\$user\"];}; :if (\$getxp = 8) do={ /ip hotspot user set comment\
    =\"\$date \$exp\" [find where name=\"\$user\"];}; :if (\$getxp > 15) do={ \
    /ip hotspot user set comment=\$exp [find where name=\"\$user\"];}; /sys sc\
    h remove [find where name=\"\$user\"]}}" parent-queue=none
add name=MOIS on-login=":put (\",rem,2000,30d,2000,,Disable,\"); {:local date \
    [ /system clock get date ];:local year [ :pick \$date 7 11 ];:local month \
    [ :pick \$date 0 3 ];:local comment [ /ip hotspot user get [/ip hotspot us\
    er find where name=\"\$user\"] comment]; :local ucode [:pic \$comment 0 2]\
    ; :if (\$ucode = \"vc\" or \$ucode = \"up\" or \$comment = \"\") do={ /sys\
    \_sch add name=\"\$user\" disable=no start-date=\$date interval=\"30d\"; :\
    delay 2s; :local exp [ /sys sch get [ /sys sch find where name=\"\$user\" \
    ] next-run]; :local getxp [len \$exp]; :if (\$getxp = 15) do={ :local d [:\
    pic \$exp 0 6]; :local t [:pic \$exp 7 16]; :local s (\"/\"); :local exp (\
    \"\$d\$s\$year \$t\"); /ip hotspot user set comment=\$exp [find where name\
    =\"\$user\"];}; :if (\$getxp = 8) do={ /ip hotspot user set comment=\"\$da\
    te \$exp\" [find where name=\"\$user\"];}; :if (\$getxp > 15) do={ /ip hot\
    spot user set comment=\$exp [find where name=\"\$user\"];}; /sys sch remov\
    e [find where name=\"\$user\"]}}" parent-queue=none
add name=3-JOUR on-login=":put (\",rem,500,3d,500,,Disable,\"); {:local date [\
    \_/system clock get date ];:local year [ :pick \$date 7 11 ];:local month \
    [ :pick \$date 0 3 ];:local comment [ /ip hotspot user get [/ip hotspot us\
    er find where name=\"\$user\"] comment]; :local ucode [:pic \$comment 0 2]\
    ; :if (\$ucode = \"vc\" or \$ucode = \"up\" or \$comment = \"\") do={ /sys\
    \_sch add name=\"\$user\" disable=no start-date=\$date interval=\"3d\"; :d\
    elay 2s; :local exp [ /sys sch get [ /sys sch find where name=\"\$user\" ]\
    \_next-run]; :local getxp [len \$exp]; :if (\$getxp = 15) do={ :local d [:\
    pic \$exp 0 6]; :local t [:pic \$exp 7 16]; :local s (\"/\"); :local exp (\
    \"\$d\$s\$year \$t\"); /ip hotspot user set comment=\$exp [find where name\
    =\"\$user\"];}; :if (\$getxp = 8) do={ /ip hotspot user set comment=\"\$da\
    te \$exp\" [find where name=\"\$user\"];}; :if (\$getxp > 15) do={ /ip hot\
    spot user set comment=\$exp [find where name=\"\$user\"];}; /sys sch remov\
    e [find where name=\"\$user\"]}}" parent-queue=none
add name=3-MOIS on-login=":put (\",remc,7000,90d,7000,,Disable,\"); {:local co\
    mment [ /ip hotspot user get [/ip hotspot user find where name=\"\$user\"]\
    \_comment]; :local ucode [:pic \$comment 0 2]; :if (\$ucode = \"vc\" or \$\
    ucode = \"up\" or \$comment = \"\") do={ :local date [ /system clock get d\
    ate ];:local year [ :pick \$date 7 11 ];:local month [ :pick \$date 0 3 ];\
    \_/sys sch add name=\"\$user\" disable=no start-date=\$date interval=\"90d\
    \"; :delay 5s; :local exp [ /sys sch get [ /sys sch find where name=\"\$us\
    er\" ] next-run]; :local getxp [len \$exp]; :if (\$getxp = 15) do={ :local\
    \_d [:pic \$exp 0 6]; :local t [:pic \$exp 7 16]; :local s (\"/\"); :local\
    \_exp (\"\$d\$s\$year \$t\"); /ip hotspot user set comment=\"\$exp\" [find\
    \_where name=\"\$user\"];}; :if (\$getxp = 8) do={ /ip hotspot user set co\
    mment=\"\$date \$exp\" [find where name=\"\$user\"];}; :if (\$getxp > 15) \
    do={ /ip hotspot user set comment=\"\$exp\" [find where name=\"\$user\"];}\
    ;:delay 5s; /sys sch remove [find where name=\"\$user\"]; :local mac \$\"m\
    ac-address\"; :local time [/system clock get time ]; /system script add na\
    me=\"\$date-|-\$time-|-\$user-|-7000-|-\$address-|-\$mac-|-90d-|-3-MOIS-|-\
    \$comment\" owner=\"\$month\$year\" source=\"\$date\" comment=\"mikhmon\"}\
    }" parent-queue=none
add name=2mois on-login=":put (\",remc,3000,60d,3000,,Disable,\"); {:local com\
    ment [ /ip hotspot user get [/ip hotspot user find where name=\"\$user\"] \
    comment]; :local ucode [:pic \$comment 0 2]; :if (\$ucode = \"vc\" or \$uc\
    ode = \"up\" or \$comment = \"\") do={ :local date [ /system clock get dat\
    e ];:local year [ :pick \$date 7 11 ];:local month [ :pick \$date 0 3 ]; /\
    sys sch add name=\"\$user\" disable=no start-date=\$date interval=\"60d\";\
    \_:delay 5s; :local exp [ /sys sch get [ /sys sch find where name=\"\$user\
    \" ] next-run]; :local getxp [len \$exp]; :if (\$getxp = 15) do={ :local d\
    \_[:pic \$exp 0 6]; :local t [:pic \$exp 7 16]; :local s (\"/\"); :local e\
    xp (\"\$d\$s\$year \$t\"); /ip hotspot user set comment=\"\$exp\" [find wh\
    ere name=\"\$user\"];}; :if (\$getxp = 8) do={ /ip hotspot user set commen\
    t=\"\$date \$exp\" [find where name=\"\$user\"];}; :if (\$getxp > 15) do={\
    \_/ip hotspot user set comment=\"\$exp\" [find where name=\"\$user\"];};:d\
    elay 5s; /sys sch remove [find where name=\"\$user\"]; :local mac \$\"mac-\
    address\"; :local time [/system clock get time ]; /system script add name=\
    \"\$date-|-\$time-|-\$user-|-3000-|-\$address-|-\$mac-|-60d-|-2mois-|-\$co\
    mment\" owner=\"\$month\$year\" source=\"\$date\" comment=\"mikhmon\"}}" \
    parent-queue=none
/ip pool
add name=POOL-HOTSPOT ranges=10.10.10.2-10.10.11.254
/ip dhcp-server
add address-pool=POOL-HOTSPOT disabled=no interface=HOTSPOT name=dhcp1
/ip hotspot
add address-pool=POOL-HOTSPOT addresses-per-mac=1 disabled=no interface=\
    HOTSPOT name=Server_Hotspot profile=samassawifi
/tool user-manager customer
set admin access=\
    own-routers,own-users,own-profiles,own-limits,config-payment-gw currency=\
    FCFA signup-allowed=yes
/tool user-manager profile
add name="30 MIN" name-for-users="" override-shared-users=1 owner=admin \
    price=0 starts-at=logon validity=30m
add name="45 MIN" name-for-users="" override-shared-users=1 owner=admin \
    price=0 starts-at=logon validity=45m
add name=1H name-for-users="" override-shared-users=1 owner=admin price=0 \
    starts-at=logon validity=1h
add name=2H name-for-users="" override-shared-users=1 owner=admin price=0 \
    starts-at=logon validity=2h
add name=3H name-for-users="" override-shared-users=1 owner=admin price=0 \
    starts-at=logon validity=3h
add name=5H name-for-users="" override-shared-users=1 owner=admin price=0 \
    starts-at=logon validity=5h
add name=10H name-for-users="" override-shared-users=1 owner=admin price=0 \
    starts-at=logon validity=10h
add name="1 JOUR" name-for-users="" override-shared-users=1 owner=admin \
    price=0 starts-at=logon validity=1d
add name="3 JOURS" name-for-users="" override-shared-users=1 owner=admin \
    price=0 starts-at=logon validity=3d
add name="1 SEMAINE" name-for-users="" override-shared-users=1 owner=admin \
    price=0 starts-at=logon validity=1w
add name="1 MOIS" name-for-users="" override-shared-users=1 owner=admin \
    price=0 starts-at=logon validity=4w2d
/tool user-manager profile limitation
add address-list="" download-limit=0B group-name="" ip-pool="" ip-pool6="" \
    name="30 MIN" owner=admin transfer-limit=0B upload-limit=0B uptime-limit=\
    30m
add address-list="" download-limit=0B group-name="" ip-pool="" ip-pool6="" \
    name="45 MIN" owner=admin transfer-limit=0B upload-limit=0B uptime-limit=\
    45m
add address-list="" download-limit=0B group-name="" ip-pool="" ip-pool6="" \
    name=1H owner=admin transfer-limit=0B upload-limit=0B uptime-limit=1h
add address-list="" download-limit=0B group-name="" ip-pool="" ip-pool6="" \
    name=2H owner=admin transfer-limit=0B upload-limit=0B uptime-limit=2h
add address-list="" download-limit=0B group-name="" ip-pool="" ip-pool6="" \
    name=3H owner=admin transfer-limit=0B upload-limit=0B uptime-limit=3h
add address-list="" download-limit=0B group-name="" ip-pool="" ip-pool6="" \
    name=5H owner=admin transfer-limit=0B upload-limit=0B uptime-limit=5h
add address-list="" download-limit=0B group-name="" ip-pool="" ip-pool6="" \
    name=10H owner=admin transfer-limit=0B upload-limit=0B uptime-limit=10h
add address-list="" download-limit=0B group-name="" ip-pool="" ip-pool6="" \
    name="1 JOUR" owner=admin transfer-limit=0B upload-limit=0B uptime-limit=\
    1d
add address-list="" download-limit=0B group-name="" ip-pool="" ip-pool6="" \
    name="3 JOURS" owner=admin transfer-limit=0B upload-limit=0B \
    uptime-limit=3d
add address-list="" download-limit=0B group-name="" ip-pool="" ip-pool6="" \
    name="7 JOURS" owner=admin transfer-limit=0B upload-limit=0B \
    uptime-limit=1w
add address-list="" download-limit=0B group-name="" ip-pool="" ip-pool6="" \
    name="1 MOIS" owner=admin transfer-limit=0B upload-limit=0B uptime-limit=\
    4w2d
/user group
set full policy="local,telnet,ssh,ftp,reboot,read,write,policy,test,winbox,pas\
    sword,web,sniff,sensitive,api,romon,dude,tikapp"
/interface bridge port
add bridge=HOTSPOT interface="PORT 5"
add bridge=HOTSPOT interface="PORT 4"
add bridge=HOTSPOT interface="PORT 3"
add bridge=HOTSPOT interface="PORT 2"
add bridge=HOTSPOT interface=wlan1
/ip firewall connection tracking
set enabled=yes
/ip neighbor discovery-settings
set discover-interface-list=!dynamic
/interface list member
add interface=E1-WAN-FAI list=WAN
add interface=HOTSPOT list=LAN
/ip address
add address=10.10.10.1/23 comment="ADRESSE IP HOTSPOT SERVER" interface=\
    HOTSPOT network=10.10.10.0
/ip dhcp-client
add comment="ENTREE INTERNET" disabled=no interface=E1-WAN-FAI
/ip dhcp-server network
add address=10.10.10.0/23 dns-server=8.8.8.8,8.8.4.4 gateway=10.10.10.1
/ip dns
set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4
/ip firewall filter
add action=passthrough chain=unused-hs-chain comment=\
    "place hotspot rules here" disabled=yes
add action=passthrough chain=unused-hs-chain comment=\
    "place hotspot rules here" disabled=yes
add action=accept chain=output comment="Section Break" disabled=yes
add action=drop chain=input comment="Drop Invalid Connections" \
    connection-state=invalid
add action=drop chain=forward comment="Drop Invalid Connections" \
    connection-state=invalid
add action=accept chain=output comment="Section Break" disabled=yes
add action=accept chain=output comment="Section Break" disabled=yes
add action=add-src-to-address-list address-list=Torrent-Conn \
    address-list-timeout=2m chain=forward comment=p2p-exp disabled=yes \
    layer7-protocol=layer7-bittorrent-exp src-address-list=!allow-bit
add action=add-src-to-address-list address-list=Torrent-Conn-site \
    address-list-timeout=2m chain=forward comment=p2p-dns disabled=yes \
    layer7-protocol=p2p_dns src-address-list=!allow-bit
add action=add-src-to-address-list address-list=Torrent-Conn-site \
    address-list-timeout=2m chain=forward comment=p2p-www disabled=yes \
    layer7-protocol=p2p_www src-address-list=!allow-bit
add action=drop chain=forward disabled=yes dst-port=\
    !0-1024,8291,5900,5800,3389,14147,5222,59905 protocol=tcp \
    src-address-list=Torrent-Conn
add action=drop chain=forward disabled=yes dst-port=\
    !0-1024,8291,5900,5800,3389,14147,5222,59905 protocol=udp \
    src-address-list=Torrent-Conn
add action=drop chain=forward disabled=yes src-address-list=Torrent-Conn-site
add action=accept chain=output comment="Section Break" disabled=yes
add action=jump chain=forward connection-state=new jump-target=block-ddos
add action=drop chain=forward connection-state=new dst-address-list=ddosed \
    src-address-list=ddoser
add action=return chain=block-ddos dst-limit=50,50,src-and-dst-addresses/10s
add action=add-dst-to-address-list address-list=ddosed address-list-timeout=\
    1d chain=block-ddos
add action=add-src-to-address-list address-list=ddoser address-list-timeout=\
    1d chain=block-ddos
add action=accept chain=output comment="Section Break" disabled=yes
add action=drop chain=input comment="BLOCK DNS REQUEST ON WAN INTERFACE" \
    dst-port=53 in-interface=E1-WAN-FAI protocol=tcp
add action=drop chain=input comment="BLOCK DNS REQUEST ON WAN INTERFACE" \
    dst-port=53 in-interface=E1-WAN-FAI protocol=udp
add action=add-src-to-address-list address-list="port scanners" \
    address-list-timeout=2m chain=input comment="Port scanners to list " \
    protocol=tcp psd=21,3s,3,1
add action=add-src-to-address-list address-list="port scanners" \
    address-list-timeout=2m chain=input comment="NMAP FIN Stealth scan" \
    protocol=tcp tcp-flags=fin,!syn,!rst,!psh,!ack,!urg
add action=add-src-to-address-list address-list="port scanners" \
    address-list-timeout=2m chain=input comment="SYN/FIN scan" protocol=tcp \
    tcp-flags=fin,syn
add action=add-src-to-address-list address-list="port scanners" \
    address-list-timeout=2m chain=input comment="SYN/RST scan" protocol=tcp \
    tcp-flags=syn,rst
add action=add-src-to-address-list address-list="port scanners" \
    address-list-timeout=2m chain=input comment="FIN/PSH/URG scan" protocol=\
    tcp tcp-flags=fin,psh,urg,!syn,!rst,!ack
add action=add-src-to-address-list address-list="port scanners" \
    address-list-timeout=30m chain=input comment="ALL/ALL scan" protocol=tcp \
    tcp-flags=fin,syn,rst,psh,ack,urg
add action=add-src-to-address-list address-list="port scanners" \
    address-list-timeout=2m chain=input comment="NMAP NULL scan" protocol=tcp \
    tcp-flags=!fin,!syn,!rst,!psh,!ack,!urg
add action=drop chain=input comment="ping port scanners" src-address-list=\
    "port scanners"
add action=accept chain=output comment="Section Break" disabled=yes
add action=add-src-to-address-list address-list=SSH_BlackList_1 \
    address-list-timeout=1m chain=input comment=\
    "Drop SSH&TELNET Brute Forcers" connection-state=new dst-port=22-23 \
    protocol=tcp
add action=add-src-to-address-list address-list=SSH_BlackList_2 \
    address-list-timeout=1m chain=input connection-state=new dst-port=22-23 \
    protocol=tcp src-address-list=SSH_BlackList_1
add action=add-src-to-address-list address-list=SSH_BlackList_3 \
    address-list-timeout=1m chain=input connection-state=new dst-port=22-23 \
    protocol=tcp src-address-list=SSH_BlackList_2
add action=add-src-to-address-list address-list=IP_BlackList \
    address-list-timeout=1d chain=input connection-state=new dst-port=22-23 \
    protocol=tcp src-address-list=SSH_BlackList_3
add action=drop chain=input dst-port=22-23 protocol=tcp src-address-list=\
    IP_BlackList
add action=accept chain=output comment="Section Break" disabled=yes
/ip firewall nat
add action=passthrough chain=unused-hs-chain comment=\
    "place hotspot rules here" disabled=yes
add action=passthrough chain=unused-hs-chain comment=\
    "place hotspot rules here" disabled=yes
add action=masquerade chain=srcnat out-interface-list=WAN src-address=\
    10.10.10.0/23
add action=masquerade chain=srcnat comment="masquerade hotspot network" \
    src-address=10.10.10.0/23
/ip hotspot ip-binding
add comment="fallou /24" disabled=yes mac-address=00:22:19:94:94:25 type=\
    bypassed
/ip hotspot user
add name=admin password=Baba1
add name=Douc password=Douc
add name=An50 password=An50
add disabled=yes name=baba password=baba
add name=baba1 password=baba1
add disabled=yes name=baba5 password=baba5
add name=John password=John
add name=Oluchi password=Oluchi
add disabled=yes name=Uchechi password=Uchechi
add disabled=yes name=Akon password=Akon
add name=Fodie password=Fodie
add disabled=yes name=Zenab password=Zenab
add name=0505 password=0505
add disabled=yes name=CHUKA password=CHUKA
add name=Ordinateur password=Ordinateur
add disabled=yes name=Diarrisso password=Diarrisso
add name=Boukary password=Boukary
add name=Amad password=Amad
add name=Mdiaby password=Mdiaby
add name=Jonas password=Jonas
add name=Cheickna password=Cheickna
add name=Bosco password=Bosco
add name=Serge password=Serge
add name=Ismael password=Ismael
add name=Batougoune password=Batougoune
add name=doucoure password=doucoure
add name=CHEICK password=CHEICK
add name=Lidya password=Lidya
add name=SITA password=SITA
add name=iwa password=iwa
add name=Fodie1 password=Fodie1
add name=alima password=alima
add name=7575 password=7575
add name=sansan password=sansan
add name=maitre password=maitre
add name=Sita7980 password=Sita7980
add name=saloni password=saloni
add name=Chinoso password=Chinoso
add name=Sissoko password=Sissoko
add name=Nimaga password=Nimaga
add name=Gassama password=Gassama
add name=idriss password=idriss
add disabled=yes name=ali password=ali
add name=Akon3 password=Akon3
add name=jerry password=jerry
add name=imam password=imam
add name=ananawa password=ananawa
add disabled=yes name=Diarrisso1 password=Diarrisso1
add name=agui password=agui
add name=gary password=gary
add name=Abou7508 password=Abou7508
add name=cheickna password=cheickna
add name=john3 password=john3
add name=john4 password=john4
add name=Victoria password=Victoria
add name=ordi password=ordi
add name=kantara password=kantara
add name=ISSA password=ISSA
add name=Fodie2 password=Fodie2
add name=Dra password=Dra
add name=Fodie3 password=Fodie3
add name=adeoye password=adeoye
add name=djene password=djene
add name=Fatim password=Fatim
add name=uchechi1 password=uchechi1
add name=oppo password=oppo
add name=xady949 password=Awa1234 profile=1-SEMAINE
add name=Cheick password=Cheick
add name=benya password=benya
add name=Mamadou password=Mamadou
add name=doris password=doris
add name=Moctar password=Moctar
add name=4897479 password=4897479 profile=1-SEMAINE
add disabled=yes name=DJEFF password=DJEFF
add name=Demba password=Demba
add name=Djenab password=Djenab
add name=Drisssa password=Drisssa
add name=ekene password=ekene
add disabled=yes name=ismael2 password=ismael2
add name=0575361746 password=0575361746 profile=MOIS
add name=iphone12 password=iphone12
add name=Mory password=Mory
add name=aziz password=aziz
add name=ekenee password=ekenee
add name=Donton password=Donton
add name=DONTOM password=DONTOM
add name=S9 password=S9
add name=MOUSSA password=MOUSSA
add disabled=yes name=ola password=ola
add name=Malika password=Malika
add name=Tidiane password=Tidiane
add name=08550771 password=08550771
add name=user1 password=ooo profile=1-SEMAINE
add name=isuf password=isuf profile=MOIS
add name=ABOUBACAR password=ABOUBACAR
add name=HOULANE password=HOULANE
add name=Madou password=Madou
add name=Tako password=Tako
add name=Haba password=Haba
add name=Diaby password=Diaby
add name=haidara password=haidara
add name=marchel password=marchel
add name=baba password=baba
add name=Mala password=Mala
add name=alma password=alma profile=MOIS
add name=poulo password=poulo
add name=diaguilli password=diaguilli
add name=jerry2 password=jerry2
add name=0556073874 password=0556073874 profile=MOIS
add name=dem password=dem
add name=diasco password=diasco
add name=4229 password=4229
add name=CHEICKNA password=CHEICKNA
add name=sekou password=sekou
add name=sm password=sm
add name=0707303117 password=0707303117
add name=0505024556 password=0505024556
add name=nouhou2 password=nouhou2
add name=nefs927 password=nefs927 profile=1-SEMAINE
add name=uchechi password=uchechi
add name="Geoffrey " password="Geoffrey "
add name=Joseph password=Joseph
add name=ananawa2 password=ananawa2
add name=ananawa3 password=ananawa3
add disabled=yes name=DIARRISSO2 password=DIARRISSO2
add name=cisso password=cisso
add name=0709522545 password=0709522545
add name=uchechi2 password=uchechi2
add name=Gossy password=Gossy
add name=0757843591 password=0757843591
add name=0707959605 password=0707959605
add name=karamoko password=karamoko
add name=Crismo password=Crismo
add name=zongo8762 password=zongo8762 profile=MOIS
add name=TOKUNBO password=TOKUNBO
add name=0747483991 password=0747483991
add name=0757434046 password=0757434046
add name=anawawa password=anawawa
add name=anawawa3 password=anawawa3
add name=Mari password=Mari
add name=Marcel password=Marcel
add name=Soukouna password=Soukouna
add name=0170380870 password=0170380870
add name=0708088061 password=0708088061
add name=0566205540 password=0566205540
add name=0707341648 password=0707341648
add name=0505911446 password=0505911446
add name=Garry password=Garry
add name=0153537913 password=0153537913 profile=2-SEMAINE
add name=siss password=siss
add name=chinedou password=chinedou
add name=0545842199 password=0545842199
add name=ali password=ali
add name=praize password=praize
add name=0575433631 password=0575433631
add name=AMARA password=AMARA
add name=0708866043 password=0708866043
add name=Batougoune2 password=Batougoune2
add name=Lanfifa password=Lanfifa
add name=Uchechi password=Uchechi
add name=Uchechi2 password=Uchechi2
add name=0768149654 password=0768149654
add name=0747888840 password=0747888840
add name=hamala password=hamala
add comment=vc-959-12.22.25- limit-uptime=2w name=EKK37 password=EKK37 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=YWD76 password=YWD76 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=DWj74 password=DWj74 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=xDz48 password=xDz48 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=MPG63 password=MPG63 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=skh37 password=skh37 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=Wwm37 password=Wwm37 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=vdm34 password=vdm34 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=KWm25 password=KWm25 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=Vhp37 password=Vhp37 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=amC39 password=amC39 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=dVt72 password=dVt72 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=mYz29 password=mYz29 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=AyS23 password=AyS23 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=hfA68 password=hfA68 \
    profile=2-SEMAINE
add comment=vc-959-12.22.25- limit-uptime=2w name=EBM29 password=EBM29 \
    profile=2-SEMAINE
add name=KOROGO password=KOROGO
add disabled=yes name=ola password=ola
add comment=vc-488-01.19.26- limit-uptime=4w2d name=km43fci9 password=\
    km43fci9 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=kwb3p5ct password=\
    kwb3p5ct profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=rd2dfn9r password=\
    rd2dfn9r profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=unju6kd3 password=\
    unju6kd3 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=x24te6ve password=\
    x24te6ve profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=vgg4cuhw password=\
    vgg4cuhw profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=sv2sr3ig password=\
    sv2sr3ig profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=phf3zduh password=\
    phf3zduh profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=7vhym9yh password=\
    7vhym9yh profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=cf68x5s6 password=\
    cf68x5s6 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=evtkdetx password=\
    evtkdetx profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=kzsugk2p password=\
    kzsugk2p profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=dtcurucu password=\
    dtcurucu profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=zdrasiyb password=\
    zdrasiyb profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=5jabd2i2 password=\
    5jabd2i2 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=jbp5tyne password=\
    jbp5tyne profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=sv4einyc password=\
    sv4einyc profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=9rneycef password=\
    9rneycef profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=ed3t7bif password=\
    ed3t7bif profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=k6wr969h password=\
    k6wr969h profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=bkicte7d password=\
    bkicte7d profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=z8uijis2 password=\
    z8uijis2 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=3bxxn4hg password=\
    3bxxn4hg profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=cwnjwige password=\
    cwnjwige profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=7fwa2axd password=\
    7fwa2axd profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=7f65expd password=\
    7f65expd profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=cvwsm6re password=\
    cvwsm6re profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=vn8gbc5p password=\
    vn8gbc5p profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=zvpzyvtr password=\
    zvpzyvtr profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=7s2h8ds5 password=\
    7s2h8ds5 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=rypkgbpm password=\
    rypkgbpm profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=85vfzrh3 password=\
    85vfzrh3 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=3t8y8hkh password=\
    3t8y8hkh profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=vf5nbxrj password=\
    vf5nbxrj profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=r8hkkmyj password=\
    r8hkkmyj profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=fvuhj6i2 password=\
    fvuhj6i2 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=d4gbf3he password=\
    d4gbf3he profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=imn74hbw password=\
    imn74hbw profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=ht9mh7ww password=\
    ht9mh7ww profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=d9zxwpzn password=\
    d9zxwpzn profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=h6442nce password=\
    h6442nce profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=ztppgztd password=\
    ztppgztd profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=w4ezyea4 password=\
    w4ezyea4 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=865gb668 password=\
    865gb668 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=eeze7fy6 password=\
    eeze7fy6 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=r29rfrpf password=\
    r29rfrpf profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=syurn9aw password=\
    syurn9aw profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=mr3v9ss9 password=\
    mr3v9ss9 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=sagvdadx password=\
    sagvdadx profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=vf5xwp78 password=\
    vf5xwp78 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=e33emi42 password=\
    e33emi42 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=k2uim83k password=\
    k2uim83k profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=2hy36962 password=\
    2hy36962 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=mztruih9 password=\
    mztruih9 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=gx6kc5s9 password=\
    gx6kc5s9 profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=643zu9pp password=\
    643zu9pp profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=f8enthwv password=\
    f8enthwv profile=MOIS
add comment=vc-488-01.19.26- limit-uptime=4w2d name=b4wt8aeb password=\
    b4wt8aeb profile=MOIS
add name=Dabou password=Dabou
add name=Djeffaga password=Djeffaga
add name=Rokia password=Rokia
add comment=vc-366-02.16.26- limit-uptime=1d name=69966 password=69966 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=26323 password=26323 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=29582 password=29582 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=99643 password=99643 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=96358 password=96358 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=22899 password=22899 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=89988 password=89988 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=42888 password=42888 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=44295 password=44295 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=48747 password=48747 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=85989 password=85989 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=86627 password=86627 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=29289 password=29289 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=75985 password=75985 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=35466 password=35466 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=65324 password=65324 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=63969 password=63969 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=95749 password=95749 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=49633 password=49633 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=72976 password=72976 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=93834 password=93834 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=77966 password=77966 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=25248 password=25248 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=72768 password=72768 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=56753 password=56753 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=92569 password=92569 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=55899 password=55899 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=67253 password=67253 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=37228 password=37228 \
    profile=JOUR
add comment=vc-366-02.16.26- limit-uptime=1d name=55347 password=55347 \
    profile=JOUR
add name=SONIKE password=SONIKE
add name=CAMARA password=CAMARA
add name=0709 password=0709
add name=mangane password=mangane
add name=DOUCOURE password=DOUCOURE
add name=honorine password=honorine
add name=playboy password=playboy
add name=Oumar password=Oumar
add name=nouhou password=nouhou
add name=donald password=donald
add name=Ton1 password=Ton1
add name=Fod password=Fod
add name=7782 password=7782
add name=Tablette password=Tablette
add comment=vc-918-05.18.26- limit-uptime=4w2d name=56978725 password=\
    56978725 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=47657884 password=\
    47657884 profile=MOIS
add comment="sep/27/2026 08:26:12" limit-uptime=4w2d name=38653223 password=\
    38653223 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=53863225 password=\
    53863225 profile=MOIS
add comment="sep/30/2026 08:37:13" limit-uptime=4w2d name=55742274 password=\
    55742274 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=53739575 password=\
    53739575 profile=MOIS
add comment="sep/23/2026 08:16:17" limit-uptime=4w2d name=62869977 password=\
    62869977 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=57276376 password=\
    57276376 profile=MOIS
add comment="sep/27/2026 15:51:35" limit-uptime=4w2d name=76335796 password=\
    76335796 profile=MOIS
add comment="sep/30/2026 11:57:38" limit-uptime=4w2d name=22673965 password=\
    22673965 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=55668295 password=\
    55668295 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=45479473 password=\
    45479473 profile=MOIS
add comment="sep/24/2026 07:51:50" limit-uptime=4w2d name=67798762 password=\
    67798762 profile=MOIS
add comment="sep/30/2026 11:57:25" limit-uptime=4w2d name=72763482 password=\
    72763482 profile=MOIS
add comment="sep/21/2026 10:47:23" limit-uptime=4w2d name=33795569 password=\
    33795569 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=52836873 password=\
    52836873 profile=MOIS
add comment="sep/20/2026 09:21:44" limit-uptime=4w2d name=43438266 password=\
    43438266 profile=MOIS
add comment="sep/18/2026 14:16:39" limit-uptime=4w2d name=52285247 password=\
    52285247 profile=MOIS
add comment="sep/18/2026 14:08:41" limit-uptime=4w2d name=57946776 password=\
    57946776 profile=MOIS
add comment="sep/19/2026 15:21:32" limit-uptime=4w2d name=69962535 password=\
    69962535 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=37982796 password=\
    37982796 profile=MOIS
add comment="sep/02/2026 10:02:00" limit-uptime=4w2d name=43365283 password=\
    43365283 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=93845234 password=\
    93845234 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=94854375 password=\
    94854375 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=54364276 password=\
    54364276 profile=MOIS
add comment="sep/02/2026 12:03:26" limit-uptime=4w2d name=55998837 password=\
    55998837 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=89358665 password=\
    89358665 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=69829984 password=\
    69829984 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=29463753 password=\
    29463753 profile=MOIS
add comment="sep/05/2026 11:18:15" limit-uptime=4w2d name=87678733 password=\
    87678733 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=65837987 password=\
    65837987 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=73847875 password=\
    73847875 profile=MOIS
add comment="sep/05/2026 11:59:54" limit-uptime=4w2d name=78394235 password=\
    78394235 profile=MOIS
add comment="sep/14/2026 09:36:07" limit-uptime=4w2d name=64788892 password=\
    64788892 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=59625568 password=\
    59625568 profile=MOIS
add comment="sep/13/2026 09:03:54" limit-uptime=4w2d name=44644695 password=\
    44644695 profile=MOIS
add comment="sep/10/2026 12:08:05" limit-uptime=4w2d name=69279352 password=\
    69279352 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=59322296 password=\
    59322296 profile=MOIS
add comment="sep/11/2026 14:31:14" limit-uptime=4w2d name=93523373 password=\
    93523373 profile=MOIS
add comment="sep/11/2026 08:41:00" limit-uptime=4w2d name=79967432 password=\
    79967432 profile=MOIS
add comment="sep/13/2026 08:21:41" limit-uptime=4w2d name=96523244 password=\
    96523244 profile=MOIS
add comment="sep/07/2026 14:49:12" limit-uptime=4w2d name=64547288 password=\
    64547288 profile=MOIS
add comment="sep/10/2026 11:35:27" limit-uptime=4w2d name=59736838 password=\
    59736838 profile=MOIS
add comment="sep/06/2026 12:59:24" limit-uptime=4w2d name=63343534 password=\
    63343534 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=69862954 password=\
    69862954 profile=MOIS
add comment="sep/05/2026 11:18:28" limit-uptime=4w2d name=67436733 password=\
    67436733 profile=MOIS
add comment="sep/05/2026 10:49:53" limit-uptime=4w2d name=43253448 password=\
    43253448 profile=MOIS
add comment="sep/05/2026 08:14:16" limit-uptime=4w2d name=72466358 password=\
    72466358 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=65844448 password=\
    65844448 profile=MOIS
add comment="sep/26/2026 12:32:23" limit-uptime=4w2d name=32934498 password=\
    32934498 profile=MOIS
add comment="sep/02/2026 12:19:25" limit-uptime=4w2d name=33582922 password=\
    33582922 profile=MOIS
add comment="sep/23/2026 13:53:10" limit-uptime=4w2d name=94835825 password=\
    94835825 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=87348376 password=\
    87348376 profile=MOIS
add comment="sep/02/2026 11:05:12" limit-uptime=4w2d name=43332363 password=\
    43332363 profile=MOIS
add comment="sep/02/2026 11:34:49" limit-uptime=4w2d name=35474396 password=\
    35474396 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=36694578 password=\
    36694578 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=55286639 password=\
    55286639 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=77285799 password=\
    77285799 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=86989443 password=\
    86989443 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=32648554 password=\
    32648554 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=74722343 password=\
    74722343 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=97486643 password=\
    97486643 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=43356436 password=\
    43356436 profile=MOIS
add comment="sep/19/2026 10:35:43" limit-uptime=4w2d name=47997675 password=\
    47997675 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=54286568 password=\
    54286568 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=94325875 password=\
    94325875 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=64492529 password=\
    64492529 profile=MOIS
add comment="sep/11/2026 17:17:51" limit-uptime=4w2d name=72554353 password=\
    72554353 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=33336269 password=\
    33336269 profile=MOIS
add comment="sep/30/2026 11:05:20" limit-uptime=4w2d name=79694959 password=\
    79694959 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=47435778 password=\
    47435778 profile=MOIS
add comment="sep/30/2026 08:31:45" limit-uptime=4w2d name=24633942 password=\
    24633942 profile=MOIS
add comment="sep/25/2026 13:49:53" limit-uptime=4w2d name=34758564 password=\
    34758564 profile=MOIS
add comment="sep/30/2026 08:06:28" limit-uptime=4w2d name=94563529 password=\
    94563529 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=29925675 password=\
    29925675 profile=MOIS
add comment="sep/28/2026 13:57:53" limit-uptime=4w2d name=28594242 password=\
    28594242 profile=MOIS
add comment="sep/24/2026 08:15:25" limit-uptime=4w2d name=37523899 password=\
    37523899 profile=MOIS
add comment="sep/21/2026 09:50:30" limit-uptime=4w2d name=74945459 password=\
    74945459 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=72739777 password=\
    72739777 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=98493542 password=\
    98493542 profile=MOIS
add comment="sep/02/2026 11:15:50" limit-uptime=4w2d name=54966232 password=\
    54966232 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=24367448 password=\
    24367448 profile=MOIS
add comment="sep/02/2026 08:34:30" limit-uptime=4w2d name=66333465 password=\
    66333465 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=76628224 password=\
    76628224 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=25777945 password=\
    25777945 profile=MOIS
add comment="sep/10/2026 11:59:19" limit-uptime=4w2d name=52732482 password=\
    52732482 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=74645484 password=\
    74645484 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=28737457 password=\
    28737457 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=28679633 password=\
    28679633 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=99897332 password=\
    99897332 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=73727424 password=\
    73727424 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=92639546 password=\
    92639546 profile=MOIS
add comment="sep/21/2026 08:40:57" limit-uptime=4w2d name=22334254 password=\
    22334254 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=43243549 password=\
    43243549 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=33593329 password=\
    33593329 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=64729725 password=\
    64729725 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=86252363 password=\
    86252363 profile=MOIS
add comment=vc-918-05.18.26- limit-uptime=4w2d name=65587572 password=\
    65587572 profile=MOIS
add comment=vc-345-06.10.26- limit-uptime=1d name=frk58 password=frk58 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=sgc67 password=sgc67 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=xnf59 password=xnf59 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=iaa83 password=iaa83 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=mui49 password=mui49 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=des98 password=des98 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=fny34 password=fny34 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=zuj39 password=zuj39 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=rvv49 password=rvv49 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=vjj56 password=vjj56 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=zuu43 password=zuu43 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=wdb88 password=wdb88 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=tbj58 password=tbj58 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=ubn62 password=ubn62 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=jpb44 password=jpb44 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=fzg92 password=fzg92 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=xgi76 password=xgi76 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=rpp64 password=rpp64 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=edd74 password=edd74 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=fji66 password=fji66 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=gzj48 password=gzj48 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=uzh34 password=uzh34 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=yni87 password=yni87 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=rze68 password=rze68 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=gwp65 password=gwp65 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=hjd23 password=hjd23 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=tbh33 password=tbh33 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=zsg34 password=zsg34 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=ymp97 password=ymp97 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=mcp23 password=mcp23 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=kbw89 password=kbw89 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=fxv86 password=fxv86 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=trt28 password=trt28 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=kxj65 password=kxj65 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=rtt99 password=rtt99 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=yvs55 password=yvs55 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=jbf73 password=jbf73 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=xnn85 password=xnn85 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=ibx47 password=ibx47 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=pmw36 password=pmw36 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=jki44 password=jki44 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=iww92 password=iww92 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=unp53 password=unp53 \
    profile=JOUR
add comment=vc-345-06.10.26- limit-uptime=1d name=aja89 password=aja89 \
    profile=JOUR
add name=aminata password=aminata
add name=koro password=koro
add name=koro2 password=koro2
add name=homo password=homo
add comment="sep/16/2026 16:25:28" name=Francis password=Francis profile=\
    2mois
add comment=vc-741-07.25.26- limit-uptime=1w name=kcgc932 password=kcgc932 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=xejx469 password=xejx469 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=ipcd325 password=ipcd325 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=srae425 password=srae425 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=hpip286 password=hpip286 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=jpcw882 password=jpcw882 \
    profile=1-SEMAINE
add comment="sep/05/2026 12:10:07" limit-uptime=1w name=rpkc298 password=\
    rpkc298 profile=1-SEMAINE
add comment="sep/07/2026 10:04:09" limit-uptime=1w name=gveg386 password=\
    gveg386 profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=ffsj325 password=ffsj325 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=ihek553 password=ihek553 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=zpdp776 password=zpdp776 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=ihur498 password=ihur498 \
    profile=1-SEMAINE
add comment="sep/07/2026 12:37:21" limit-uptime=1w name=jyyz754 password=\
    jyyz754 profile=1-SEMAINE
add comment="sep/07/2026 15:04:26" limit-uptime=1w name=kxpp794 password=\
    kxpp794 profile=1-SEMAINE
add comment="sep/03/2026 08:48:57" limit-uptime=1w name=jurm693 password=\
    jurm693 profile=1-SEMAINE
add comment="sep/03/2026 16:36:14" limit-uptime=1w name=bskw862 password=\
    bskw862 profile=1-SEMAINE
add comment="sep/03/2026 11:00:18" limit-uptime=1w name=mpmp286 password=\
    mpmp286 profile=1-SEMAINE
add comment="sep/04/2026 08:19:26" limit-uptime=1w name=jvdm498 password=\
    jvdm498 profile=1-SEMAINE
add comment="sep/01/2026 12:22:35" limit-uptime=1w name=ypaz684 password=\
    ypaz684 profile=1-SEMAINE
add comment="aug/31/2026 15:57:00" limit-uptime=1w name=fcxs528 password=\
    fcxs528 profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=befp924 password=befp924 \
    profile=1-SEMAINE
add comment="sep/02/2026 14:06:48" limit-uptime=1w name=ezwn627 password=\
    ezwn627 profile=1-SEMAINE
add comment="sep/01/2026 09:15:16" limit-uptime=1w name=kxhg767 password=\
    kxhg767 profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=zhjb227 password=zhjb227 \
    profile=1-SEMAINE
add comment="sep/04/2026 13:33:21" limit-uptime=1w name=nuvr652 password=\
    nuvr652 profile=1-SEMAINE
add comment="sep/05/2026 08:39:33" limit-uptime=1w name=cjab362 password=\
    cjab362 profile=1-SEMAINE
add comment="sep/02/2026 14:53:30" limit-uptime=1w name=bxew225 password=\
    bxew225 profile=1-SEMAINE
add comment="sep/01/2026 15:35:36" limit-uptime=1w name=ubfu986 password=\
    ubfu986 profile=1-SEMAINE
add comment="sep/03/2026 11:12:17" limit-uptime=1w name=xpiu668 password=\
    xpiu668 profile=1-SEMAINE
add comment="sep/01/2026 10:08:05" limit-uptime=1w name=fnzx749 password=\
    fnzx749 profile=1-SEMAINE
add comment="sep/01/2026 10:26:38" limit-uptime=1w name=vysi763 password=\
    vysi763 profile=1-SEMAINE
add comment="sep/01/2026 10:32:48" limit-uptime=1w name=hyxv825 password=\
    hyxv825 profile=1-SEMAINE
add comment="sep/04/2026 11:08:13" limit-uptime=1w name=ufvi757 password=\
    ufvi757 profile=1-SEMAINE
add comment="sep/03/2026 11:03:14" limit-uptime=1w name=shai792 password=\
    shai792 profile=1-SEMAINE
add comment="sep/04/2026 10:30:46" limit-uptime=1w name=hksj799 password=\
    hksj799 profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=hfpd833 password=hfpd833 \
    profile=1-SEMAINE
add comment="sep/03/2026 12:58:23" limit-uptime=1w name=aawc542 password=\
    aawc542 profile=1-SEMAINE
add comment="sep/02/2026 15:21:55" limit-uptime=1w name=kzga886 password=\
    kzga886 profile=1-SEMAINE
add comment="sep/04/2026 09:07:28" limit-uptime=1w name=efzk472 password=\
    efzk472 profile=1-SEMAINE
add comment="sep/04/2026 09:38:42" limit-uptime=1w name=rpnp788 password=\
    rpnp788 profile=1-SEMAINE
add comment="sep/02/2026 08:42:44" limit-uptime=1w name=rknx438 password=\
    rknx438 profile=1-SEMAINE
add comment="sep/01/2026 09:05:17" limit-uptime=1w name=durc366 password=\
    durc366 profile=1-SEMAINE
add comment="sep/05/2026 11:13:34" limit-uptime=1w name=gwga899 password=\
    gwga899 profile=1-SEMAINE
add comment="sep/05/2026 10:02:39" limit-uptime=1w name=npyw694 password=\
    npyw694 profile=1-SEMAINE
add comment="sep/01/2026 08:43:46" limit-uptime=1w name=ugvj529 password=\
    ugvj529 profile=1-SEMAINE
add comment="sep/04/2026 10:14:03" limit-uptime=1w name=xxww666 password=\
    xxww666 profile=1-SEMAINE
add comment="sep/05/2026 15:15:05" limit-uptime=1w name=rmjt838 password=\
    rmjt838 profile=1-SEMAINE
add comment="sep/05/2026 10:45:59" limit-uptime=1w name=bxej783 password=\
    bxej783 profile=1-SEMAINE
add comment="sep/02/2026 08:24:57" limit-uptime=1w name=zbxf994 password=\
    zbxf994 profile=1-SEMAINE
add comment="sep/01/2026 12:05:10" limit-uptime=1w name=ihyc287 password=\
    ihyc287 profile=1-SEMAINE
add comment="sep/02/2026 09:06:28" limit-uptime=1w name=zkjp587 password=\
    zkjp587 profile=1-SEMAINE
add comment="sep/04/2026 09:54:17" limit-uptime=1w name=kzdp373 password=\
    kzdp373 profile=1-SEMAINE
add comment="sep/05/2026 11:18:34" limit-uptime=1w name=nyas844 password=\
    nyas844 profile=1-SEMAINE
add comment="sep/03/2026 13:39:17" limit-uptime=1w name=kaab253 password=\
    kaab253 profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=upzp872 password=upzp872 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=jxmw455 password=jxmw455 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=bmyf938 password=bmyf938 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=udpc787 password=udpc787 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=vfme957 password=vfme957 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=scav697 password=scav697 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=hikt328 password=hikt328 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=puxa264 password=puxa264 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=xpaf686 password=xpaf686 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=nume528 password=nume528 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=ckhg453 password=ckhg453 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=kcgb242 password=kcgb242 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=ymwc728 password=ymwc728 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=axuu587 password=axuu587 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=dhng385 password=dhng385 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=gcgm967 password=gcgm967 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=faks673 password=faks673 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=rtcf326 password=rtcf326 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=jvuc638 password=jvuc638 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=msmr789 password=msmr789 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=ifvf523 password=ifvf523 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=jaxv665 password=jaxv665 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=xwyc783 password=xwyc783 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=wiab442 password=wiab442 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=picm656 password=picm656 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=bzke947 password=bzke947 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=ujdr584 password=ujdr584 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=pdmv339 password=pdmv339 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=kpyz393 password=kpyz393 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=tuim322 password=tuim322 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=rbfx335 password=rbfx335 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=tbcb783 password=tbcb783 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=iwwm566 password=iwwm566 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=xzig794 password=xzig794 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=esrp845 password=esrp845 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=sike795 password=sike795 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=tzyu328 password=tzyu328 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=denr829 password=denr829 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=eteu422 password=eteu422 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=snpp747 password=snpp747 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=cbrx988 password=cbrx988 \
    profile=1-SEMAINE
add comment="sep/01/2026 07:57:21" limit-uptime=1w name=wpuy367 password=\
    wpuy367 profile=1-SEMAINE
add comment="aug/31/2026 16:57:04" limit-uptime=1w name=bups892 password=\
    bups892 profile=1-SEMAINE
add comment="sep/02/2026 11:12:46" limit-uptime=1w name=kjdv837 password=\
    kjdv837 profile=1-SEMAINE
add comment="sep/02/2026 12:01:01" limit-uptime=1w name=gsfs744 password=\
    gsfs744 profile=1-SEMAINE
add comment="sep/02/2026 10:13:50" limit-uptime=1w name=vyey344 password=\
    vyey344 profile=1-SEMAINE
add comment="sep/01/2026 12:16:02" limit-uptime=1w name=ghcs223 password=\
    ghcs223 profile=1-SEMAINE
add comment="sep/02/2026 12:45:24" limit-uptime=1w name=njft586 password=\
    njft586 profile=1-SEMAINE
add comment="sep/05/2026 09:50:48" limit-uptime=1w name=ahdx252 password=\
    ahdx252 profile=1-SEMAINE
add comment="sep/02/2026 14:57:39" limit-uptime=1w name=kayn499 password=\
    kayn499 profile=1-SEMAINE
add comment="sep/02/2026 13:28:44" limit-uptime=1w name=yjhv434 password=\
    yjhv434 profile=1-SEMAINE
add comment="sep/03/2026 13:59:03" limit-uptime=1w name=ptst549 password=\
    ptst549 profile=1-SEMAINE
add comment="sep/05/2026 14:01:51" limit-uptime=1w name=hvdr859 password=\
    hvdr859 profile=1-SEMAINE
add comment="sep/07/2026 08:52:58" limit-uptime=1w name=jngg229 password=\
    jngg229 profile=1-SEMAINE
add comment="sep/06/2026 12:50:56" limit-uptime=1w name=mutd528 password=\
    mutd528 profile=1-SEMAINE
add comment="sep/05/2026 10:23:42" limit-uptime=1w name=znff772 password=\
    znff772 profile=1-SEMAINE
add comment="sep/04/2026 17:12:17" limit-uptime=1w name=nirk498 password=\
    nirk498 profile=1-SEMAINE
add comment="sep/04/2026 08:50:19" limit-uptime=1w name=fdgp788 password=\
    fdgp788 profile=1-SEMAINE
add comment="sep/03/2026 15:14:37" limit-uptime=1w name=vpvv327 password=\
    vpvv327 profile=1-SEMAINE
add comment="sep/07/2026 09:56:10" limit-uptime=1w name=mbff685 password=\
    mbff685 profile=1-SEMAINE
add comment="sep/03/2026 10:19:52" limit-uptime=1w name=rnhb872 password=\
    rnhb872 profile=1-SEMAINE
add comment="sep/03/2026 08:57:23" limit-uptime=1w name=bsmf369 password=\
    bsmf369 profile=1-SEMAINE
add comment="sep/02/2026 13:12:13" limit-uptime=1w name=zapg653 password=\
    zapg653 profile=1-SEMAINE
add comment="sep/07/2026 08:05:47" limit-uptime=1w name=cgxb278 password=\
    cgxb278 profile=1-SEMAINE
add comment="sep/02/2026 11:50:09" limit-uptime=1w name=ffza855 password=\
    ffza855 profile=1-SEMAINE
add comment="sep/02/2026 10:19:56" limit-uptime=1w name=hkrd687 password=\
    hkrd687 profile=1-SEMAINE
add comment="sep/01/2026 12:01:25" limit-uptime=1w name=gkzp225 password=\
    gkzp225 profile=1-SEMAINE
add comment="sep/06/2026 12:46:04" limit-uptime=1w name=dgnx525 password=\
    dgnx525 profile=1-SEMAINE
add comment="sep/01/2026 08:48:59" limit-uptime=1w name=ypte544 password=\
    ypte544 profile=1-SEMAINE
add comment="sep/05/2026 12:17:24" limit-uptime=1w name=evps459 password=\
    evps459 profile=1-SEMAINE
add comment="sep/02/2026 10:01:39" limit-uptime=1w name=jztj624 password=\
    jztj624 profile=1-SEMAINE
add comment="sep/04/2026 10:17:49" limit-uptime=1w name=nefj574 password=\
    nefj574 profile=1-SEMAINE
add comment="sep/05/2026 10:04:49" limit-uptime=1w name=xrpe228 password=\
    xrpe228 profile=1-SEMAINE
add comment="sep/05/2026 14:40:52" limit-uptime=1w name=yhwe925 password=\
    yhwe925 profile=1-SEMAINE
add comment="sep/01/2026 10:12:11" limit-uptime=1w name=jwuz373 password=\
    jwuz373 profile=1-SEMAINE
add comment="sep/03/2026 10:04:18" limit-uptime=1w name=nrki444 password=\
    nrki444 profile=1-SEMAINE
add comment="sep/04/2026 15:03:18" limit-uptime=1w name=eyjv934 password=\
    eyjv934 profile=1-SEMAINE
add comment="sep/05/2026 09:41:35" limit-uptime=1w name=fcfn446 password=\
    fcfn446 profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=wyar429 password=wyar429 \
    profile=1-SEMAINE
add comment="sep/02/2026 10:18:27" limit-uptime=1w name=ycye546 password=\
    ycye546 profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=kcze257 password=kcze257 \
    profile=1-SEMAINE
add comment="sep/02/2026 13:34:46" limit-uptime=1w name=hazb773 password=\
    hazb773 profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=uvei334 password=uvei334 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=ebdx553 password=ebdx553 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=vcma968 password=vcma968 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=ggfp743 password=ggfp743 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=nnaj933 password=nnaj933 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=vrfu837 password=vrfu837 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=avrc944 password=avrc944 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=devg689 password=devg689 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=easx658 password=easx658 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=jahg597 password=jahg597 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=apdf586 password=apdf586 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=xmxt284 password=xmxt284 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=cfzv483 password=cfzv483 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=jzvz793 password=jzvz793 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=jtku624 password=jtku624 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=kukt488 password=kukt488 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=cevb569 password=cevb569 \
    profile=1-SEMAINE
add comment="sep/01/2026 10:01:58" limit-uptime=1w name=gvda786 password=\
    gvda786 profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=fwyt276 password=fwyt276 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=bcey377 password=bcey377 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=fank239 password=fank239 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=hewn498 password=hewn498 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=dcjd779 password=dcjd779 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=kctn526 password=kctn526 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=kaig462 password=kaig462 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=jrtx966 password=jrtx966 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=sibm452 password=sibm452 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=pnmj854 password=pnmj854 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=jhrw446 password=jhrw446 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=jhwy823 password=jhwy823 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=mzju432 password=mzju432 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=ryya968 password=ryya968 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=ijhz239 password=ijhz239 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=mzgd439 password=mzgd439 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=avwh522 password=avwh522 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=vgjs336 password=vgjs336 \
    profile=1-SEMAINE
add comment=vc-741-07.25.26- limit-uptime=1w name=catp433 password=catp433 \
    profile=1-SEMAINE
add comment="sep/03/2026 14:05:57" name=ike password=ike profile=MOIS
add comment="sep/03/2026 14:09:32" name=0710178596 password=0710178596 \
    profile=MOIS
add name=ola password=ola profile=MOIS
add comment="sep/04/2026 16:43:23" name=ola1 password=ola1 profile=MOIS
add name=mimi password=mimi
add comment="sep/10/2026 10:35:03" name=djegui password=djegui profile=MOIS
add comment="sep/10/2026 13:35:36" name=Kadi password=Kadi profile=MOIS
add comment="sep/12/2026 10:19:54" name=saliman password=saliman profile=MOIS
add comment="sep/12/2026 10:17:36" name=nafisa password=nafisa profile=MOIS
add comment="sep/13/2026 14:22:28" name=bakary password=bakary profile=MOIS
add comment=vc-905-08.15.26- limit-uptime=1d name=A6226 password=A6226 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A8469 password=A8469 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A5424 password=A5424 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A7397 password=A7397 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A4377 password=A4377 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A5278 password=A5278 \
    profile=JOUR
add comment="sep/01/2026 12:23:34" limit-uptime=1d name=A3583 password=A3583 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A6334 password=A6334 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A3789 password=A3789 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A6368 password=A6368 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A5786 password=A5786 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A6785 password=A6785 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A3266 password=A3266 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A8249 password=A8249 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A5483 password=A5483 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A5356 password=A5356 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A3774 password=A3774 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A3879 password=A3879 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A4396 password=A4396 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A9836 password=A9836 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A2325 password=A2325 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A5636 password=A5636 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A5438 password=A5438 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A5222 password=A5222 \
    profile=JOUR
add comment=vc-905-08.15.26- limit-uptime=1d name=A7893 password=A7893 \
    profile=JOUR
add comment="sep/16/2026 14:24:49" name=77740 password=77740 profile=MOIS
add comment="sep/17/2026 10:22:10" name=TRAORE password=TRAORE profile=MOIS
add comment="sep/20/2026 16:38:08" name=mathew password=mathew profile=MOIS
add comment="sep/21/2026 12:54:17" name=0502617234 password=0502617234 \
    profile=MOIS
add name=soul password=soul
add comment="sep/23/2026 10:46:12" name=Jamal password=Jamal profile=MOIS
add comment=vc-171-08.28.26- limit-uptime=1w name=2339756 password=2339756 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7349273 password=7349273 \
    profile=1-SEMAINE
add comment="sep/05/2026 11:51:29" limit-uptime=1w name=6322527 password=\
    6322527 profile=1-SEMAINE
add comment="sep/05/2026 11:53:47" limit-uptime=1w name=8349346 password=\
    8349346 profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8795523 password=8795523 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4539673 password=4539673 \
    profile=1-SEMAINE
add comment="sep/07/2026 14:17:24" limit-uptime=1w name=9888768 password=\
    9888768 profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5458223 password=5458223 \
    profile=1-SEMAINE
add comment="sep/07/2026 13:19:09" limit-uptime=1w name=4868958 password=\
    4868958 profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5742875 password=5742875 \
    profile=1-SEMAINE
add comment="sep/07/2026 12:40:48" limit-uptime=1w name=9845947 password=\
    9845947 profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5354542 password=5354542 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8285727 password=8285727 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6528577 password=6528577 \
    profile=1-SEMAINE
add comment="sep/07/2026 09:02:55" limit-uptime=1w name=4538299 password=\
    4538299 profile=1-SEMAINE
add comment="sep/07/2026 11:16:23" limit-uptime=1w name=3863348 password=\
    3863348 profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4942883 password=4942883 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6664227 password=6664227 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3862465 password=3862465 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9865648 password=9865648 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4492548 password=4492548 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2235495 password=2235495 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3784934 password=3784934 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7525494 password=7525494 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6284296 password=6284296 \
    profile=1-SEMAINE
add comment="sep/05/2026 17:04:51" limit-uptime=1w name=7877469 password=\
    7877469 profile=1-SEMAINE
add comment="sep/07/2026 09:36:26" limit-uptime=1w name=8842357 password=\
    8842357 profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5395553 password=5395553 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4249269 password=4249269 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9577278 password=9577278 \
    profile=1-SEMAINE
add comment="sep/07/2026 14:57:39" limit-uptime=1w name=5746497 password=\
    5746497 profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9374536 password=9374536 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2992973 password=2992973 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9852848 password=9852848 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6839685 password=6839685 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2688938 password=2688938 \
    profile=1-SEMAINE
add comment="sep/05/2026 11:33:58" limit-uptime=1w name=5539744 password=\
    5539744 profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9563662 password=9563662 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6862978 password=6862978 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2459727 password=2459727 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7693276 password=7693276 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4894972 password=4894972 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8325957 password=8325957 \
    profile=1-SEMAINE
add comment="sep/07/2026 12:34:25" limit-uptime=1w name=7887755 password=\
    7887755 profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7745923 password=7745923 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5973855 password=5973855 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4832592 password=4832592 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5924836 password=5924836 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2482596 password=2482596 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7347768 password=7347768 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9228477 password=9228477 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8924776 password=8924776 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5324374 password=5324374 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4456744 password=4456744 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7496632 password=7496632 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4765423 password=4765423 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9624346 password=9624346 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4432448 password=4432448 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5857959 password=5857959 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9343973 password=9343973 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4583285 password=4583285 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3525732 password=3525732 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9878452 password=9878452 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6833794 password=6833794 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9772925 password=9772925 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5893377 password=5893377 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5992883 password=5992883 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9552455 password=9552455 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6949792 password=6949792 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8227624 password=8227624 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9379349 password=9379349 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3844658 password=3844658 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2333542 password=2333542 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9669265 password=9669265 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7665857 password=7665857 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5467867 password=5467867 \
    profile=1-SEMAINE
add comment="sep/07/2026 09:02:38" limit-uptime=1w name=4226945 password=\
    4226945 profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7536669 password=7536669 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8562254 password=8562254 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9292793 password=9292793 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4824479 password=4824479 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6835677 password=6835677 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8696443 password=8696443 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4872559 password=4872559 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3555234 password=3555234 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8855527 password=8855527 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4257668 password=4257668 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9467756 password=9467756 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7759778 password=7759778 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9856462 password=9856462 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5752473 password=5752473 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5938275 password=5938275 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7956692 password=7956692 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3294542 password=3294542 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7783348 password=7783348 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2556437 password=2556437 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8888766 password=8888766 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6489537 password=6489537 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7539365 password=7539365 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3885969 password=3885969 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5598443 password=5598443 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2442385 password=2442385 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9592963 password=9592963 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6467482 password=6467482 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4647795 password=4647795 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2973269 password=2973269 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7368826 password=7368826 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4629859 password=4629859 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6366572 password=6366572 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4222283 password=4222283 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4565629 password=4565629 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7552386 password=7552386 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3786338 password=3786338 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7854438 password=7854438 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4795452 password=4795452 \
    profile=1-SEMAINE
add comment="sep/07/2026 10:41:50" limit-uptime=1w name=9964772 password=\
    9964772 profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6273826 password=6273826 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3737866 password=3737866 \
    profile=1-SEMAINE
add comment="sep/07/2026 12:42:53" limit-uptime=1w name=5444279 password=\
    5444279 profile=1-SEMAINE
add comment="sep/07/2026 10:00:02" limit-uptime=1w name=9629739 password=\
    9629739 profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7742894 password=7742894 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7577759 password=7577759 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8644659 password=8644659 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3576442 password=3576442 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5696555 password=5696555 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3979379 password=3979379 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5554446 password=5554446 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9993468 password=9993468 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7235998 password=7235998 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4394938 password=4394938 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4995674 password=4995674 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9474498 password=9474498 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4839288 password=4839288 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4446425 password=4446425 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8332964 password=8332964 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6692995 password=6692995 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9469642 password=9469642 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8446952 password=8446952 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7927465 password=7927465 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2747524 password=2747524 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3536449 password=3536449 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6572369 password=6572369 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7243963 password=7243963 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4497768 password=4497768 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6279883 password=6279883 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7978445 password=7978445 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2359953 password=2359953 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8533593 password=8533593 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5254563 password=5254563 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5245653 password=5245653 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8493265 password=8493265 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3739427 password=3739427 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5448737 password=5448737 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8653526 password=8653526 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7267476 password=7267476 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4938397 password=4938397 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2252888 password=2252888 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9445962 password=9445962 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2529289 password=2529289 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9773532 password=9773532 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6836627 password=6836627 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2753277 password=2753277 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6653437 password=6653437 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9665779 password=9665779 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7523569 password=7523569 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7988657 password=7988657 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2654593 password=2654593 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8643576 password=8643576 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8834647 password=8834647 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9935673 password=9935673 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7699693 password=7699693 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2282469 password=2282469 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5279849 password=5279849 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9945636 password=9945636 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4593532 password=4593532 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3233637 password=3233637 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7348428 password=7348428 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5489654 password=5489654 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8473342 password=8473342 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4249445 password=4249445 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6824259 password=6824259 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4749773 password=4749773 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3559895 password=3559895 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9973628 password=9973628 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4279467 password=4279467 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9369938 password=9369938 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3592772 password=3592772 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9573556 password=9573556 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8367552 password=8367552 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7658973 password=7658973 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3437983 password=3437983 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5694686 password=5694686 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7469953 password=7469953 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9892342 password=9892342 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8886857 password=8886857 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3888923 password=3888923 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7574745 password=7574745 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5834288 password=5834288 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9492752 password=9492752 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9737446 password=9737446 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7799646 password=7799646 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2889254 password=2889254 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6653429 password=6653429 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2782977 password=2782977 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9679462 password=9679462 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7627584 password=7627584 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7898694 password=7898694 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9429998 password=9429998 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3923868 password=3923868 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7924798 password=7924798 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6532292 password=6532292 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7933483 password=7933483 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2625282 password=2625282 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9844225 password=9844225 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2875778 password=2875778 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6463487 password=6463487 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2268446 password=2268446 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4286449 password=4286449 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8563746 password=8563746 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4493665 password=4493665 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8644982 password=8644982 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9844777 password=9844777 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2248264 password=2248264 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2354937 password=2354937 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5789977 password=5789977 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7533248 password=7533248 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3527273 password=3527273 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5925936 password=5925936 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2387566 password=2387566 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6679532 password=6679532 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7358462 password=7358462 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4996422 password=4996422 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8342967 password=8342967 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9334544 password=9334544 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6523983 password=6523983 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4999624 password=4999624 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4647545 password=4647545 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6777767 password=6777767 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2296353 password=2296353 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2269347 password=2269347 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7899569 password=7899569 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4835987 password=4835987 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8677632 password=8677632 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9833977 password=9833977 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7662465 password=7662465 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2692797 password=2692797 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6479349 password=6479349 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9676385 password=9676385 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3568945 password=3568945 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7866666 password=7866666 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5778744 password=5778744 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7756375 password=7756375 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5984277 password=5984277 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7272293 password=7272293 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4884398 password=4884398 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5354569 password=5354569 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9594537 password=9594537 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3467853 password=3467853 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8443254 password=8443254 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6597427 password=6597427 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2763567 password=2763567 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7796785 password=7796785 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8689927 password=8689927 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6365675 password=6365675 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2537768 password=2537768 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2396793 password=2396793 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2665759 password=2665759 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4569238 password=4569238 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4663668 password=4663668 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2674683 password=2674683 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4435349 password=4435349 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8623592 password=8623592 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5753348 password=5753348 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4357563 password=4357563 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6826585 password=6826585 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6667476 password=6667476 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4957438 password=4957438 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4947999 password=4947999 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8246732 password=8246732 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6827655 password=6827655 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8423956 password=8423956 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6967759 password=6967759 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4759862 password=4759862 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9337883 password=9337883 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7323527 password=7323527 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7678945 password=7678945 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4382675 password=4382675 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7987248 password=7987248 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8766333 password=8766333 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3238546 password=3238546 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2593225 password=2593225 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3969444 password=3969444 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8269483 password=8269483 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2232955 password=2232955 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8759426 password=8759426 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3235557 password=3235557 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8997633 password=8997633 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7429894 password=7429894 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3329388 password=3329388 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3776997 password=3776997 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6338845 password=6338845 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4495948 password=4495948 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3437966 password=3437966 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4422564 password=4422564 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2937287 password=2937287 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4295773 password=4295773 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3725233 password=3725233 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7442264 password=7442264 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2492556 password=2492556 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9478242 password=9478242 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6769262 password=6769262 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8846544 password=8846544 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9252248 password=9252248 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3832548 password=3832548 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7534454 password=7534454 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4465428 password=4465428 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5667764 password=5667764 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2334649 password=2334649 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3994746 password=3994746 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5268323 password=5268323 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6945828 password=6945828 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8488255 password=8488255 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3487655 password=3487655 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9365492 password=9365492 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7563829 password=7563829 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6844973 password=6844973 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6862853 password=6862853 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9879894 password=9879894 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4822663 password=4822663 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5493468 password=5493468 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3856534 password=3856534 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2877276 password=2877276 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7327632 password=7327632 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8765823 password=8765823 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9458778 password=9458778 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2674967 password=2674967 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7256535 password=7256535 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5847776 password=5847776 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6547433 password=6547433 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5383326 password=5383326 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6983929 password=6983929 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8882276 password=8882276 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2495468 password=2495468 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4249793 password=4249793 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6287582 password=6287582 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7878889 password=7878889 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8472795 password=8472795 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3562739 password=3562739 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5725392 password=5725392 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7279759 password=7279759 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8947667 password=8947667 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9478933 password=9478933 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5668683 password=5668683 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6372748 password=6372748 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9465567 password=9465567 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6464982 password=6464982 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8526327 password=8526327 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9257443 password=9257443 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9729264 password=9729264 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4966832 password=4966832 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6899438 password=6899438 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5496456 password=5496456 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2598396 password=2598396 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5667846 password=5667846 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6929473 password=6929473 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8688673 password=8688673 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5947795 password=5947795 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2932633 password=2932633 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8236358 password=8236358 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2652535 password=2652535 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3233364 password=3233364 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9942387 password=9942387 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5945739 password=5945739 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6684234 password=6684234 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6966264 password=6966264 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4339594 password=4339594 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2562369 password=2562369 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7672893 password=7672893 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3926846 password=3926846 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6733637 password=6733637 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4928559 password=4928559 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5569786 password=5569786 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8942539 password=8942539 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9348733 password=9348733 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9544867 password=9544867 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8277953 password=8277953 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5857444 password=5857444 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3865666 password=3865666 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5466875 password=5466875 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4282738 password=4282738 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4885626 password=4885626 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8742642 password=8742642 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2763272 password=2763272 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6845535 password=6845535 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2724347 password=2724347 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6954233 password=6954233 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6674288 password=6674288 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2346346 password=2346346 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9996589 password=9996589 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6262895 password=6262895 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4942735 password=4942735 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8749797 password=8749797 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9294954 password=9294954 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4684957 password=4684957 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4397886 password=4397886 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3459328 password=3459328 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5964239 password=5964239 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4255737 password=4255737 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5428868 password=5428868 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7586464 password=7586464 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6437764 password=6437764 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8894968 password=8894968 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7253633 password=7253633 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6538455 password=6538455 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7845293 password=7845293 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3737678 password=3737678 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4574956 password=4574956 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7645985 password=7645985 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7982455 password=7982455 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2473842 password=2473842 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5995722 password=5995722 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4899495 password=4899495 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3985295 password=3985295 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5283498 password=5283498 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7399726 password=7399726 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8762735 password=8762735 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8484886 password=8484886 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4875997 password=4875997 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6625966 password=6625966 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8675545 password=8675545 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9482526 password=9482526 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2493596 password=2493596 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4337268 password=4337268 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9876478 password=9876478 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8662362 password=8662362 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9947956 password=9947956 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8764556 password=8764556 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6827648 password=6827648 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4427992 password=4427992 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7999742 password=7999742 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2888646 password=2888646 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5983789 password=5983789 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8822327 password=8822327 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4344549 password=4344549 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2523979 password=2523979 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8897439 password=8897439 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5995438 password=5995438 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4693785 password=4693785 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9293297 password=9293297 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5354334 password=5354334 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2357549 password=2357549 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3999374 password=3999374 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9445278 password=9445278 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3659752 password=3659752 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6378334 password=6378334 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8485499 password=8485499 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9228694 password=9228694 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8768563 password=8768563 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5329626 password=5329626 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4686427 password=4686427 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3592256 password=3592256 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2493398 password=2493398 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3473563 password=3473563 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4977675 password=4977675 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5532257 password=5532257 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8266792 password=8266792 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4664536 password=4664536 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4887535 password=4887535 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3435659 password=3435659 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5686534 password=5686534 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5465973 password=5465973 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6827532 password=6827532 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7672488 password=7672488 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6767489 password=6767489 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3569975 password=3569975 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6887239 password=6887239 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8739892 password=8739892 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5653278 password=5653278 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4428879 password=4428879 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4276872 password=4276872 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6462893 password=6462893 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9986472 password=9986472 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8764623 password=8764623 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=3564645 password=3564645 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9278735 password=9278735 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8999958 password=8999958 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6383677 password=6383677 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9456725 password=9456725 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=7563289 password=7563289 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=8943625 password=8943625 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4663266 password=4663266 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2394685 password=2394685 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5395869 password=5395869 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=2573565 password=2573565 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4429989 password=4429989 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=6392642 password=6392642 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4958283 password=4958283 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=9734434 password=9734434 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=4847768 password=4847768 \
    profile=1-SEMAINE
add comment=vc-171-08.28.26- limit-uptime=1w name=5935598 password=5935598 \
    profile=1-SEMAINE
add comment="sep/05/2026 11:38:47" name=hao password=hao profile=1-SEMAINE
add comment="sep/30/2026 15:29:00" name=Drame password=Drame profile=MOIS
/ip route
add comment=SAV distance=1 dst-address=172.16.10.0/24 gateway=172.16.10.1
/ip service
set telnet disabled=yes
set www port=85
set ssh disabled=yes
set api-ssl disabled=yes
/ip ssh
set forwarding-enabled=remote
/radius
add address=127.0.0.1 disabled=yes secret=1234 service=hotspot
/radius incoming
set accept=yes
/system clock
set time-zone-autodetect=no time-zone-name=Africa/Abidjan
/system identity
set name="HOTSPOT SERVER"
/system logging
add action=disk prefix=-> topics=hotspot,info,debug
/system note
set note=" #####  #     # ######  ####### ######   #####  ######  ####### ####\
    ### \
    \n#     #  #   #  #     # #       #     # #     # #     # #     #    #    \
    \n#         # #   #     # #       #     # #       #     # #     #    #    \
    \n#          #    ######  #####   ######   #####  ######  #     #    #    \
    \n#          #    #     # #       #   #         # #       #     #    #    \
    \n#     #    #    #     # #       #    #  #     # #       #     #    #    \
    \n #####     #    ######  ####### #     #  #####  #       #######    #    \
    \n\
    \nCONFIGURATION REALISEE PAR ISSA - CYBERSPOT NETWORKS - INGENIEUR ROUTERO\
    S\
    \nCONTACT : (+225) 0778760390 - Email: Premiusimage@gmail.com"
/system ntp client
set enabled=yes primary-ntp=196.200.131.160 secondary-ntp=196.10.52.57
/system routerboard settings
set auto-upgrade=yes
/system scheduler
add interval=1w name=clear_userman_logs on-event=clear_userman_logs policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive start-date=\
    jun/29/2016 start-time=02:00:00
add disabled=yes interval=10m name=DDNS on-event=DDNS policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive start-date=\
    jun/29/2016 start-time=10:32:27
add interval=3d name=rebooter on-event=reboot policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=apr/05/2017 start-time=04:30:00
add comment="Monitor Profile JOUR" interval=2m14s name=JOUR on-event=":local d\
    ateint do={:local montharray ( \"jan\",\"feb\",\"mar\",\"apr\",\"may\",\"j\
    un\",\"jul\",\"aug\",\"sep\",\"oct\",\"nov\",\"dec\" );:local days [ :pick\
    \_\$d 4 6 ];:local month [ :pick \$d 0 3 ];:local year [ :pick \$d 7 11 ];\
    :local monthint ([ :find \$montharray \$month]);:local month (\$monthint +\
    \_1);:if ( [len \$month] = 1) do={:local zero (\"0\");:return [:tonum (\"\
    \$year\$zero\$month\$days\")];} else={:return [:tonum (\"\$year\$month\$da\
    ys\")];}}; :local timeint do={ :local hours [ :pick \$t 0 2 ]; :local minu\
    tes [ :pick \$t 3 5 ]; :return (\$hours * 60 + \$minutes) ; }; :local date\
    \_[ /system clock get date ]; :local time [ /system clock get time ]; :loc\
    al today [\$dateint d=\$date] ; :local curtime [\$timeint t=\$time] ; :for\
    each i in [ /ip hotspot user find where profile=\"JOUR\" ] do={ :local com\
    ment [ /ip hotspot user get \$i comment]; :local name [ /ip hotspot user g\
    et \$i name]; :local gettime [:pic \$comment 12 20]; :if ([:pic \$comment \
    3] = \"/\" and [:pic \$comment 6] = \"/\") do={:local expd [\$dateint d=\$\
    comment] ; :local expt [\$timeint t=\$gettime] ; :if ((\$expd < \$today an\
    d \$expt < \$curtime) or (\$expd < \$today and \$expt > \$curtime) or (\$e\
    xpd = \$today and \$expt < \$curtime)) do={ [ /ip hotspot user remove \$i \
    ]; [ /ip hotspot active remove [find where user=\$name] ];}}}" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=05:58:23
add comment="Monitor Profile 1-SEMAINE" interval=2m57s name=1-SEMAINE \
    on-event=":local dateint do={:local montharray ( \"jan\",\"feb\",\"mar\",\
    \"apr\",\"may\",\"jun\",\"jul\",\"aug\",\"sep\",\"oct\",\"nov\",\"dec\" );\
    :local days [ :pick \$d 4 6 ];:local month [ :pick \$d 0 3 ];:local year [\
    \_:pick \$d 7 11 ];:local monthint ([ :find \$montharray \$month]);:local \
    month (\$monthint + 1);:if ( [len \$month] = 1) do={:local zero (\"0\");:r\
    eturn [:tonum (\"\$year\$zero\$month\$days\")];} else={:return [:tonum (\"\
    \$year\$month\$days\")];}}; :local timeint do={ :local hours [ :pick \$t 0\
    \_2 ]; :local minutes [ :pick \$t 3 5 ]; :return (\$hours * 60 + \$minutes\
    ) ; }; :local date [ /system clock get date ]; :local time [ /system clock\
    \_get time ]; :local today [\$dateint d=\$date] ; :local curtime [\$timein\
    t t=\$time] ; :foreach i in [ /ip hotspot user find where profile=\"1-SEMA\
    INE\" ] do={ :local comment [ /ip hotspot user get \$i comment]; :local na\
    me [ /ip hotspot user get \$i name]; :local gettime [:pic \$comment 12 20]\
    ; :if ([:pic \$comment 3] = \"/\" and [:pic \$comment 6] = \"/\") do={:loc\
    al expd [\$dateint d=\$comment] ; :local expt [\$timeint t=\$gettime] ; :i\
    f ((\$expd < \$today and \$expt < \$curtime) or (\$expd < \$today and \$ex\
    pt > \$curtime) or (\$expd = \$today and \$expt < \$curtime)) do={ [ /ip h\
    otspot user remove \$i ]; [ /ip hotspot active remove [find where user=\$n\
    ame] ];}}}" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=05:34:42
add comment="Monitor Profile 2-SEMAINE" interval=2m33s name=2-SEMAINE \
    on-event=":local dateint do={:local montharray ( \"jan\",\"feb\",\"mar\",\
    \"apr\",\"may\",\"jun\",\"jul\",\"aug\",\"sep\",\"oct\",\"nov\",\"dec\" );\
    :local days [ :pick \$d 4 6 ];:local month [ :pick \$d 0 3 ];:local year [\
    \_:pick \$d 7 11 ];:local monthint ([ :find \$montharray \$month]);:local \
    month (\$monthint + 1);:if ( [len \$month] = 1) do={:local zero (\"0\");:r\
    eturn [:tonum (\"\$year\$zero\$month\$days\")];} else={:return [:tonum (\"\
    \$year\$month\$days\")];}}; :local timeint do={ :local hours [ :pick \$t 0\
    \_2 ]; :local minutes [ :pick \$t 3 5 ]; :return (\$hours * 60 + \$minutes\
    ) ; }; :local date [ /system clock get date ]; :local time [ /system clock\
    \_get time ]; :local today [\$dateint d=\$date] ; :local curtime [\$timein\
    t t=\$time] ; :foreach i in [ /ip hotspot user find where profile=\"2-SEMA\
    INE\" ] do={ :local comment [ /ip hotspot user get \$i comment]; :local na\
    me [ /ip hotspot user get \$i name]; :local gettime [:pic \$comment 12 20]\
    ; :if ([:pic \$comment 3] = \"/\" and [:pic \$comment 6] = \"/\") do={:loc\
    al expd [\$dateint d=\$comment] ; :local expt [\$timeint t=\$gettime] ; :i\
    f ((\$expd < \$today and \$expt < \$curtime) or (\$expd < \$today and \$ex\
    pt > \$curtime) or (\$expd = \$today and \$expt < \$curtime)) do={ [ /ip h\
    otspot user remove \$i ]; [ /ip hotspot active remove [find where user=\$n\
    ame] ];}}}" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=05:18:14
add comment="Monitor Profile MOIS" interval=2m26s name=MOIS on-event=":local d\
    ateint do={:local montharray ( \"jan\",\"feb\",\"mar\",\"apr\",\"may\",\"j\
    un\",\"jul\",\"aug\",\"sep\",\"oct\",\"nov\",\"dec\" );:local days [ :pick\
    \_\$d 4 6 ];:local month [ :pick \$d 0 3 ];:local year [ :pick \$d 7 11 ];\
    :local monthint ([ :find \$montharray \$month]);:local month (\$monthint +\
    \_1);:if ( [len \$month] = 1) do={:local zero (\"0\");:return [:tonum (\"\
    \$year\$zero\$month\$days\")];} else={:return [:tonum (\"\$year\$month\$da\
    ys\")];}}; :local timeint do={ :local hours [ :pick \$t 0 2 ]; :local minu\
    tes [ :pick \$t 3 5 ]; :return (\$hours * 60 + \$minutes) ; }; :local date\
    \_[ /system clock get date ]; :local time [ /system clock get time ]; :loc\
    al today [\$dateint d=\$date] ; :local curtime [\$timeint t=\$time] ; :for\
    each i in [ /ip hotspot user find where profile=\"MOIS\" ] do={ :local com\
    ment [ /ip hotspot user get \$i comment]; :local name [ /ip hotspot user g\
    et \$i name]; :local gettime [:pic \$comment 12 20]; :if ([:pic \$comment \
    3] = \"/\" and [:pic \$comment 6] = \"/\") do={:local expd [\$dateint d=\$\
    comment] ; :local expt [\$timeint t=\$gettime] ; :if ((\$expd < \$today an\
    d \$expt < \$curtime) or (\$expd < \$today and \$expt > \$curtime) or (\$e\
    xpd = \$today and \$expt < \$curtime)) do={ [ /ip hotspot user remove \$i \
    ]; [ /ip hotspot active remove [find where user=\$name] ];}}}" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=05:55:34
add comment="Monitor Profile 3-JOUR" interval=2m12s name=3-JOUR on-event=":loc\
    al dateint do={:local montharray ( \"jan\",\"feb\",\"mar\",\"apr\",\"may\"\
    ,\"jun\",\"jul\",\"aug\",\"sep\",\"oct\",\"nov\",\"dec\" );:local days [ :\
    pick \$d 4 6 ];:local month [ :pick \$d 0 3 ];:local year [ :pick \$d 7 11\
    \_];:local monthint ([ :find \$montharray \$month]);:local month (\$monthi\
    nt + 1);:if ( [len \$month] = 1) do={:local zero (\"0\");:return [:tonum (\
    \"\$year\$zero\$month\$days\")];} else={:return [:tonum (\"\$year\$month\$\
    days\")];}}; :local timeint do={ :local hours [ :pick \$t 0 2 ]; :local mi\
    nutes [ :pick \$t 3 5 ]; :return (\$hours * 60 + \$minutes) ; }; :local da\
    te [ /system clock get date ]; :local time [ /system clock get time ]; :lo\
    cal today [\$dateint d=\$date] ; :local curtime [\$timeint t=\$time] ; :fo\
    reach i in [ /ip hotspot user find where profile=\"3-JOUR\" ] do={ :local \
    comment [ /ip hotspot user get \$i comment]; :local name [ /ip hotspot use\
    r get \$i name]; :local gettime [:pic \$comment 12 20]; :if ([:pic \$comme\
    nt 3] = \"/\" and [:pic \$comment 6] = \"/\") do={:local expd [\$dateint d\
    =\$comment] ; :local expt [\$timeint t=\$gettime] ; :if ((\$expd < \$today\
    \_and \$expt < \$curtime) or (\$expd < \$today and \$expt > \$curtime) or \
    (\$expd = \$today and \$expt < \$curtime)) do={ [ /ip hotspot user remove \
    \$i ]; [ /ip hotspot active remove [find where user=\$name] ];}}}" \
    policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=05:38:51
add interval=1w name=C055 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/19/2022 start-time=09:46:23
add interval=4w2d name=88657986 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/20/2022 start-time=09:54:59
add interval=4w2d name=343655 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/29/2022 start-time=12:18:18
add interval=4w2d name=429893 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=oct/26/2022 start-time=16:47:18
add interval=4w2d name=97437666 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=09:21:51
add interval=4w2d name=96797749 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=09:36:23
add interval=4w2d name=474425 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=09:36:23
add interval=4w2d name=82887335 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=09:40:59
add interval=4w2d name=96994294 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=09:43:12
add interval=4w2d name=47388595 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=09:46:48
add interval=4w2d name=56632973 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=09:57:09
add interval=4w2d name=79932692 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:00:40
add interval=1w name=75624878 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:04:46
add interval=4w2d name=99277333 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:04:46
add interval=4w2d name=52548753 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:09:53
add interval=4w2d name=42824859 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:11:25
add interval=4w2d name=25745922 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:17:21
add interval=4w2d name=979849 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:17:22
add interval=4w2d name=58874467 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:17:22
add interval=4w2d name=63784383 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:17:40
add interval=4w2d name=772397 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:19:20
add interval=4w2d name=23269323 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:22:26
add interval=4w2d name=0150196333 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:25:44
add interval=4w2d name=28566586 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:30:14
add interval=4w2d name=27394329 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:30:14
add interval=4w2d name=49627793 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:30:25
add interval=4w2d name=22385788 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:32:05
add interval=4w2d name=29648669 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:32:05
add interval=2w name=7766 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:32:05
add interval=4w2d name=32885332 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:33:54
add interval=1w name=4298756 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:39:45
add interval=4w2d name=379586 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:39:45
add interval=4w2d name=68887787 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:41:40
add interval=4w2d name=879668 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:46:03
add interval=4w2d name=69683482 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:46:03
add interval=4w2d name=334924 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:48:04
add interval=1w name=24948226 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:48:04
add interval=4w2d name=57868624 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:50:13
add interval=4w2d name=92627275 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:50:13
add interval=4w2d name=79934836 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:52:16
add interval=4w2d name=43279836 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:54:28
add interval=1w name=26597744 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=10:56:45
add interval=1w name=8723533 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:00:30
add interval=4w2d name=64643859 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:00:42
add interval=4w2d name=68342993 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:00:42
add interval=4w2d name=26268447 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:02:46
add interval=4w2d name=52939272 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:02:46
add interval=4w2d name=724672 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:02:46
add interval=1w name=83636259 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:02:46
add interval=1w name=83576859 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:10:06
add interval=4w2d name=49789777 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:20:15
add interval=4w2d name=98852538 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:22:01
add interval=4w2d name=59334933 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:23:46
add interval=4w2d name=28756446 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:25:38
add interval=4w2d name=439726 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:25:47
add interval=4w2d name=77489346 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:35:29
add interval=1w name=4442428 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:35:29
add interval=1w name=2926938 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:37:25
add interval=4w2d name=952358 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:40:54
add interval=4w2d name=932788 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:44:08
add interval=4w2d name=55354899 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:44:08
add interval=4w2d name=75237776 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=11:47:53
add interval=4w2d name=579472 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:11:51
add interval=4w2d name=78424838 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:13:48
add interval=4w2d name=39473544 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:14:03
add interval=4w2d name=77662687 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:14:03
add interval=1w name=66384823 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:19:50
add interval=4w2d name=88934864 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:20:09
add interval=4w2d name=38524284 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:25:12
add interval=4w2d name=87557854 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:29:17
add interval=4w2d name=77978936 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:43:44
add interval=4w2d name=29278384 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:48:18
add interval=4w2d name=24828789 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:51:24
add interval=4w2d name=42499885 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:52:48
add interval=4w2d name=76982344 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=12:54:08
add interval=4w2d name=34695949 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=13:15:29
add interval=4w2d name=248462 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=13:17:19
add interval=4w2d name=272843 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=13:23:53
add interval=4w2d name=428398 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=13:37:38
add interval=4w2d name=29363755 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/21/2022 start-time=13:37:38
add interval=4w2d name=86827389 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/29/2022 start-time=17:26:47
add interval=4w2d name=42482887 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/29/2022 start-time=17:32:32
add interval=4w2d name=99539536 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/29/2022 start-time=17:33:03
add interval=1w name=77836923 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/29/2022 start-time=17:33:03
add interval=4w2d name=23352862 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/29/2022 start-time=17:37:54
add interval=1w name=57525874 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/29/2022 start-time=17:40:00
add interval=4w2d name=53683728 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/29/2022 start-time=17:40:01
add interval=4w2d name=22887363 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/29/2022 start-time=17:42:10
add interval=4w2d name=05932300 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/29/2022 start-time=17:42:32
add interval=4w2d name=24497659 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=08:52:29
add interval=4w2d name=73458843 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=09:40:56
add interval=4w2d name=78633599 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=09:46:13
add interval=4w2d name=26899458 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=09:51:02
add interval=4w2d name=74358759 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=09:53:21
add interval=4w2d name=45377527 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=09:53:21
add interval=4w2d name=49663354 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=09:53:21
add interval=4w2d name=46779348 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=09:56:51
add interval=1w name=96994499 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=09:56:51
add interval=4w2d name=96926886 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=09:56:51
add interval=4w2d name=72797946 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=09:57:07
add interval=4w2d name=22495298 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=09:59:13
add interval=4w2d name=97593983 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:01:35
add interval=4w2d name=47787958 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:03:23
add interval=4w2d name=72468379 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:05:57
add interval=4w2d name=75533895 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:08:24
add interval=1w name=55422568 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:16:00
add interval=1w name=45546257 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:23:10
add interval=4w2d name=84447427 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:25:54
add interval=1w name=7347946 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:25:54
add interval=4w2d name=83362746 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:28:15
add interval=1w name=39774762 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:32:24
add interval=4w2d name=87778455 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:37:14
add interval=4w2d name=24479557 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:41:21
add interval=1d name=23273587 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/02/2022 start-time=10:58:43
add interval=4w2d name=23343746 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/05/2022 start-time=10:33:02
add interval=4w2d name=72832334 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/05/2022 start-time=10:41:16
add interval=4w2d name=55683376 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/05/2022 start-time=11:00:50
add interval=4w2d name=97893332 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/05/2022 start-time=11:08:10
add interval=1w name=26456775 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/06/2022 start-time=10:02:30
add interval=4w2d name=87296759 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/06/2022 start-time=10:02:30
add interval=2w name=1206 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/06/2022 start-time=10:08:59
add interval=4w2d name=27944228 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/06/2022 start-time=10:10:30
add interval=4w2d name=84673377 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/06/2022 start-time=10:13:03
add interval=4w2d name=55698958 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/06/2022 start-time=10:13:03
add interval=1w name=98286653 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:11:56
add interval=4w2d name=29939364 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:13:49
add interval=4w2d name=89868492 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:13:49
add interval=4w2d name=39647994 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:15:42
add interval=4w2d name=73357626 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:21:04
add interval=1w name=53792245 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:26:14
add interval=4w2d name=24332966 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:26:14
add interval=4w2d name=23524829 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:26:14
add interval=4w2d name=78232294 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:26:14
add interval=4w2d name=66477744 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:26:14
add interval=4w2d name=52639997 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:26:14
add interval=4w2d name=53438743 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:26:14
add interval=1w name=24879878 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:26:14
add interval=4w2d name=67998844 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:26:14
add interval=1w name=82927226 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:41:28
add interval=4w2d name=95463484 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:41:28
add interval=4w2d name=45478523 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:53:22
add interval=4w2d name=53447893 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:54:57
add interval=4w2d name=59748246 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=10:54:57
add interval=1w name=72737499 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/24/2022 start-time=11:02:51
add interval=4w2d name=74952838 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/05/2023 start-time=11:20:43
add interval=4w2d name=37846999 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/05/2023 start-time=11:46:36
add interval=2w name=57293471 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/05/2023 start-time=11:48:19
add interval=4w2d name=33357297 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/14/2023 start-time=09:08:18
add interval=4w2d name=82876563 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/14/2023 start-time=09:22:43
add interval=4w2d name=22548442 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/14/2023 start-time=09:27:45
add interval=4w2d name=49299332 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/14/2023 start-time=09:30:13
add interval=4w2d name=97239379 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/14/2023 start-time=09:30:13
add interval=4w2d name=74344444 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=12:20:46
add interval=1w name=45643582 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=12:26:18
add interval=4w2d name=32595679 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=12:28:44
add interval=1w name=36869837 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=12:52:18
add interval=1w name=97448387 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=12:53:42
add interval=4w2d name=46562573 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=12:55:09
add interval=4w2d name=74726283 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=12:55:09
add interval=1w name=34364776 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:10:18
add interval=4w2d name=49767759 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:11:54
add interval=4w2d name=34449425 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:11:54
add interval=4w2d name=99592868 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:13:26
add interval=1w name=44978375 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:15:49
add interval=4w2d name=43838482 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:16:59
add interval=4w2d name=24632995 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:18:45
add interval=4w2d name=85977353 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:21:49
add interval=1w name=95946259 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:28:25
add interval=4w2d name=52952632 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:35:46
add interval=4w2d name=65692346 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:35:56
add interval=4w2d name=32656855 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:38:58
add interval=4w2d name=33456982 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:38:58
add interval=1w name=33339365 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:40:29
add interval=4w2d name=82563573 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:41:50
add interval=4w2d name=77654322 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:45:36
add interval=1w name=78458736 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=13:46:29
add interval=1w name=49333876 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=14:10:34
add interval=4w2d name=79396364 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=14:14:40
add interval=4w2d name=66379769 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=14:14:41
add interval=4w2d name=22682323 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=14:18:57
add interval=1w name=68965732 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=14:24:09
add interval=1w name=92235452 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=14:24:20
add interval=4w2d name=39354252 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=14:27:55
add interval=4w2d name=62365342 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=14:32:21
add interval=4w2d name=65643686 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=14:43:48
add interval=4w2d name=72364435 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=14:48:43
add interval=4w2d name=27653796 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=14:54:12
add interval=4w2d name=35942655 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=15:09:00
add interval=4w2d name=53868536 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=15:22:06
add interval=4w2d name=38377324 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=15:26:04
add interval=4w2d name=36828552 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=15:26:04
add interval=4w2d name=77378686 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=15:39:12
add interval=4w2d name=77369746 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=15:42:00
add interval=4w2d name=49428857 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=15:47:22
add interval=4w2d name=97294688 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=15:47:22
add interval=1w name=86752555 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=15:47:22
add interval=4w2d name=53342682 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=15:58:01
add interval=4w2d name=34435986 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=15:58:01
add interval=1w name=98893457 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=16:18:09
add interval=4w2d name=45656469 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=16:25:41
add interval=4w2d name=84789533 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=16:26:56
add interval=4w2d name=78832757 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=16:29:41
add interval=4w2d name=77482295 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=16:36:27
add interval=4w2d name=56253433 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=16:40:23
add interval=3d name=78667465 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/30/2023 start-time=16:46:25
add interval=4w2d name=22944852 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=09:46:45
add interval=1w name=53987954 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=10:12:57
add interval=4w2d name=42566658 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=10:26:31
add interval=4w2d name=94349284 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=10:52:08
add interval=4w2d name=73679682 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=11:04:11
add interval=4w2d name=28688226 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=11:11:19
add interval=4w2d name=97888354 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=11:17:23
add interval=3d name=66738462 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=11:18:42
add interval=4w2d name=24775244 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=11:20:23
add interval=4w2d name=83853982 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=11:32:47
add interval=1w name=49444385 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=11:34:06
add interval=4w2d name=94892263 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=11:34:14
add interval=4w2d name=22965267 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=11:34:14
add interval=2w name=6789 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=11:36:56
add interval=3d name=73927222 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=12:08:58
add interval=4w2d name=75735224 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=12:19:11
add interval=1w name=63225265 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=12:34:52
add interval=1w name=88938995 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=12:41:16
add interval=4w2d name=52266387 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=13:11:56
add interval=1w name=67683459 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=14:18:29
add interval=4w2d name=22946349 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=14:24:52
add interval=4w2d name=48336873 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=14:24:52
add interval=4w2d name=52425647 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=14:27:42
add interval=4w2d name=53258592 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=14:30:20
add interval=4w2d name=28935465 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=14:38:09
add interval=4w2d name=97554226 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=14:57:05
add interval=4w2d name=72347276 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=14:59:48
add interval=4w2d name=73493354 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=15:04:32
add interval=4w2d name=95844422 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=15:09:07
add interval=4w2d name=52395543 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=15:18:34
add interval=4w2d name=84362383 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=15:18:34
add interval=4w2d name=79569964 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=15:29:08
add interval=4w2d name=63785768 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=15:39:10
add interval=4w2d name=24674278 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=15:46:07
add interval=4w2d name=54453695 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=15:49:06
add interval=4w2d name=78952452 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=15:49:06
add interval=4w2d name=78948367 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=16:07:57
add interval=4w2d name=27684992 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=16:15:03
add interval=4w2d name=28369459 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=16:32:29
add interval=4w2d name=65947754 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=16:39:28
add interval=4w2d name=23967742 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=16:55:22
add interval=1w name=98286539 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=16:57:21
add interval=4w2d name=34363278 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=17:01:56
add interval=4w2d name=65737773 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/31/2023 start-time=17:10:58
add interval=4w2d name=87579864 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=09:57:07
add interval=4w2d name=82294853 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=10:14:15
add interval=1w name=93582424 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=10:32:52
add interval=1w name=43279756 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=10:37:55
add interval=1d name=78396943 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=10:47:35
add interval=1w name=86437674 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=10:47:35
add interval=4w2d name=47872799 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:01:33
add interval=1w name=29626826 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:10:43
add interval=4w2d name=55765443 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:17:18
add interval=4w2d name=69584787 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:35:00
add interval=1w name=63699998 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:38:31
add interval=1d name=79648253 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:38:31
add interval=1w name=29978687 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:38:31
add interval=4w2d name=53958367 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:44:27
add interval=4w2d name=74858483 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:44:27
add interval=1w name=94487553 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:53:53
add interval=4w2d name=66443627 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:54:03
add interval=1w name=95728226 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:55:20
add interval=4w2d name=93529924 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=11:57:28
add interval=4w2d name=47625697 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=12:26:29
add interval=4w2d name=98875254 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=12:30:23
add interval=1w name=55839993 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=12:32:04
add interval=1w name=59535867 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=12:37:04
add interval=3d name=79633548 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=12:44:09
add interval=4w2d name=95562726 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=12:50:00
add interval=4w2d name=27649996 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=12:54:57
add interval=1w name=55928974 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=12:58:40
add interval=4w2d name=34226397 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=13:00:16
add interval=4w2d name=66796299 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=13:33:53
add interval=1d name=43835834 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=13:53:19
add interval=4w2d name=79932658 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=14:18:15
add interval=4w2d name=97365476 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=15:00:38
add interval=4w2d name=94629724 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=15:06:29
add interval=4w2d name=38477823 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=15:38:32
add interval=1w name=62788545 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=15:42:08
add interval=4w2d name=26492698 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=15:45:58
add interval=4w2d name=49689863 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=15:48:10
add interval=1w name=52488273 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=16:43:26
add interval=4w2d name=26697269 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=17:01:22
add interval=1w name=53588429 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=17:04:42
add interval=4w2d name=69469363 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/01/2023 start-time=17:37:32
add interval=1w name=89426822 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=10:13:29
add interval=3d name=68474272 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=10:20:18
add interval=4w2d name=42347797 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=10:44:27
add interval=4w2d name=39683383 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=10:47:26
add interval=1w name=67665745 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=10:48:35
add interval=4w2d name=46724573 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=11:07:58
add interval=4w2d name=22595294 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=11:07:58
add interval=4w2d name=24736852 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=11:09:43
add interval=1w name=65978975 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=11:21:28
add interval=4w2d name=53877723 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=11:23:49
add interval=2w name=0203 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:18:10
add interval=4w2d name=97768736 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:19:45
add interval=1w name=9136266855 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:23:03
add interval=4w2d name=79668772 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:24:24
add interval=1w name=82249474 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:25:38
add interval=1w name=9155494438 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:25:42
add interval=1w name=57456877 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:29:10
add interval=4w2d name=26444779 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=12:31:55
add interval=1w name=22457442 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=12:34:29
add interval=1w name=9164969825 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=12:43:48
add interval=1d name=73395432 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=12:48:19
add interval=3d name=36883737 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=12:48:19
add interval=4w2d name=57957525 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=12:49:39
add interval=1w name=97556745 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=12:58:06
add interval=4w2d name=48532272 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=13:24:00
add interval=3d name=45753843 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=13:35:06
add interval=4w2d name=84667338 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=13:39:00
add interval=1w name=9164434875 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=13:43:46
add interval=4w2d name=32263565 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=13:44:59
add interval=4w2d name=63428997 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=14:00:18
add interval=1w name=96548623 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=14:15:59
add interval=1w name=64335838 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=15:17:17
add interval=1w name=9125786776 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=15:46:22
add interval=1w name=9169476957 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=15:48:24
add interval=3d name=79923847 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=16:01:35
add interval=4w2d name=26599322 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=16:40:00
add interval=4w2d name=29543854 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=17:06:53
add interval=1w name=9188575569 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=17:16:54
add interval=1w name=9173773485 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/02/2023 start-time=17:43:47
add interval=3d name=37387233 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=10:29:49
add interval=4w2d name=73482384 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=10:45:51
add interval=4w2d name=93868982 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=11:21:17
add interval=1w name=48887645 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=11:29:19
add interval=4w2d name=55964445 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=11:37:11
add interval=1w name=9184896238 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=12:04:12
add interval=4w2d name=37968569 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=14:58:33
add interval=1w name=9192389793 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=15:40:41
add interval=1w name=9153782476 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=15:44:28
add interval=1w name=55755562 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=16:39:18
add interval=1w name=99475223 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=16:44:41
add interval=4w2d name=59865752 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=16:47:07
add interval=1d name=38873423 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=17:05:33
add interval=4w2d name=24838825 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=17:12:56
add interval=4w2d name=34635446 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/03/2023 start-time=17:43:13
add interval=4w2d name=25357372 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=09:46:57
add interval=1w name=46925589 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=09:55:42
add interval=1w name=22356436 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=10:36:58
add interval=4w2d name=36267976 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=10:51:07
add interval=4w2d name=85785999 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=10:53:45
add interval=4w2d name=75937398 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=11:03:30
add interval=1w name=38363267 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=11:47:40
add interval=4w2d name=97757766 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=11:48:03
add interval=4w2d name=65872872 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=12:06:03
add interval=4w2d name=86758723 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=12:06:27
add interval=4w2d name=32493859 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=12:44:17
add interval=1w name=9194492953 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=12:50:27
add interval=1d name=39642486 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=12:57:02
add interval=1w name=9145249693 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=13:03:52
add interval=4w2d name=39472334 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=13:06:28
add interval=3d name=77994385 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=14:17:19
add interval=4w2d name=54596538 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=14:54:03
add interval=1w name=9148369259 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=15:13:42
add interval=4w2d name=99392459 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=15:28:40
add interval=4w2d name=92433534 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=16:16:46
add interval=4w2d name=69349657 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/04/2023 start-time=17:41:23
add interval=4w2d name=82757964 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=11:00:33
add interval=4w2d name=37258626 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=11:32:59
add interval=4w2d name=83722829 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=13:42:52
add interval=4w2d name=25567679 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=13:42:52
add interval=1w name=92659579 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=13:43:30
add interval=4w2d name=97769823 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=13:52:18
add interval=4w2d name=98363467 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=13:53:58
add interval=4w2d name=56672686 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=14:31:11
add interval=1w name=9175929532 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=14:39:46
add interval=4w2d name=43853386 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=14:47:41
add interval=4w2d name=54438669 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=15:15:05
add interval=1w name=9169694837 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=15:24:03
add interval=4w2d name=28527975 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=15:32:08
add interval=1w name=69534976 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=16:01:04
add interval=4w2d name=44986689 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=16:04:05
add interval=4w2d name=79242988 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=16:12:50
add interval=4w2d name=88263726 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/06/2023 start-time=16:50:37
add interval=4w2d name=57348977 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=17:48:56
add interval=3d name=25548894 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=09:37:21
add interval=1w name=49363622 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=10:15:48
add interval=4w2d name=36626773 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=10:48:33
add interval=1d name=49333326 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=11:04:45
add interval=1w name=97597225 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=11:23:12
add interval=3d name=69378959 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=12:05:23
add interval=4w2d name=44386488 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=12:10:08
add interval=4w2d name=62826777 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=12:51:29
add interval=4w2d name=22932283 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=13:09:23
add interval=4w2d name=52625292 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=13:51:40
add interval=4w2d name=49633686 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=14:36:48
add interval=1w name=9179484998 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=15:26:44
add interval=4w2d name=44426533 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=15:32:17
add interval=4w2d name=69942379 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=15:37:25
add interval=4w2d name=57448468 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=17:18:15
add interval=1w name=9124687232 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=17:29:03
add interval=3d name=43526897 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/07/2023 start-time=17:51:08
add interval=1w name=35252376 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=10:17:00
add interval=4w2d name=69925654 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=11:07:33
add interval=1w name=9154943385 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=11:11:18
add interval=4w2d name=95624355 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=11:11:29
add interval=1w name=78743434 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=11:30:40
add interval=4w2d name=93992424 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=11:33:38
add interval=1w name=9184658553 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=11:43:39
add interval=1w name=56635878 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=11:51:50
add interval=1w name=9146575494 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=12:47:23
add interval=4w2d name=56226894 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=13:15:21
add interval=1d name=49375528 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=13:48:59
add interval=1w name=23274433 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=15:12:19
add interval=4w2d name=58342637 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=15:36:28
add interval=4w2d name=77729625 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=16:14:32
add interval=4w2d name=99298885 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=17:15:27
add interval=4w2d name=79362969 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=17:24:02
add interval=1w name=9155832259 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=17:40:49
add interval=4w2d name=63738597 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=17:53:29
add interval=4w2d name=23565743 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/08/2023 start-time=17:54:54
add interval=1w name=9139475654 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=09:07:31
add interval=4w2d name=83625337 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=11:36:23
add interval=4w2d name=86335787 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=11:46:45
add interval=4w2d name=87346786 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=11:46:45
add interval=4w2d name=99942875 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=11:46:45
add interval=1w name=9183345569 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=11:51:16
add interval=1w name=74243582 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=11:54:41
add interval=1w name=9174294969 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=12:35:31
add interval=4w2d name=83976259 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=12:40:49
add interval=1d name=66532929 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=12:43:14
add interval=4w2d name=26976797 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=12:47:41
add interval=4w2d name=79755378 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=13:05:10
add interval=4w2d name=63487534 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=13:06:07
add interval=4w2d name=24288465 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=13:08:29
add interval=4w2d name=93686877 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=13:14:50
add interval=1d name=48572383 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=14:29:31
add interval=4w2d name=87695266 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=15:07:22
add interval=4w2d name=46794554 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=15:22:04
add interval=4w2d name=36585869 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=15:25:39
add interval=1w name=9144556492 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=15:31:41
add interval=1w name=9179237596 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=15:31:41
add interval=4w2d name=59968934 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/09/2023 start-time=18:08:39
add interval=4w2d name=63885833 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=09:59:27
add interval=1w name=9197629949 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=10:12:42
add interval=1w name=86775527 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=10:12:42
add interval=4w2d name=34642572 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=10:19:00
add interval=4w2d name=36729229 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=10:58:58
add interval=1w name=33867555 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=11:42:20
add interval=1w name=9135765282 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=11:44:34
add interval=1w name=9189278669 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=12:04:54
add interval=1d name=6024285878 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=12:24:42
add interval=1d name=6055996894 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=12:47:46
add interval=4w2d name=32397925 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=16:18:19
add interval=4w2d name=35655883 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=16:19:44
add interval=4w2d name=97442799 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=16:25:24
add interval=1d name=6097628884 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/10/2023 start-time=17:25:18
add interval=4w2d name=79634796 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/11/2023 start-time=10:08:14
add interval=1d name=6034288543 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/11/2023 start-time=10:27:52
add interval=1w name=9178934225 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/11/2023 start-time=10:32:33
add interval=1w name=35387827 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/11/2023 start-time=11:09:14
add interval=3d name=38725972 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/11/2023 start-time=11:15:00
add interval=1d name=53696862 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/11/2023 start-time=12:32:59
add interval=4w2d name=86333575 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/11/2023 start-time=12:39:54
add interval=1d name=43964949 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/11/2023 start-time=12:52:35
add interval=4w2d name=66844796 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/11/2023 start-time=14:09:35
add interval=4w2d name=57833873 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/11/2023 start-time=14:19:50
add interval=4w2d name=99424622 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/11/2023 start-time=15:07:18
add interval=4w2d name=22456938 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/11/2023 start-time=17:59:57
add interval=1w name=56282498 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/13/2023 start-time=10:23:02
add interval=1w name=9134786823 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/13/2023 start-time=10:41:00
add interval=4w2d name=59487234 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/13/2023 start-time=11:02:22
add interval=4w2d name=64275397 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/13/2023 start-time=11:10:55
add interval=4w2d name=39733398 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/13/2023 start-time=11:21:39
add interval=4w2d name=63283748 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/13/2023 start-time=11:27:19
add interval=4w2d name=35573793 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/13/2023 start-time=12:53:43
add interval=1w name=28695489 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/13/2023 start-time=14:15:45
add interval=4w2d name=59968937 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/13/2023 start-time=14:20:45
add interval=1w name=9179925985 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/13/2023 start-time=15:58:19
add interval=4w2d name=73255965 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/13/2023 start-time=16:31:57
add interval=1w name=9122334553 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/14/2023 start-time=12:32:42
add interval=4w2d name=82367437 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/14/2023 start-time=12:39:43
add interval=1w name=9129738249 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/14/2023 start-time=12:54:23
add interval=4w2d name=99582526 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/14/2023 start-time=13:26:53
add interval=1w name=85896493 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/14/2023 start-time=14:34:13
add interval=4w2d name=234935 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/14/2023 start-time=14:52:37
add interval=4w2d name=24865289 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/14/2023 start-time=15:22:04
add interval=1d name=6057548358 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/14/2023 start-time=15:33:27
add interval=4w2d name=67279742 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/14/2023 start-time=16:25:07
add interval=4w2d name=24769583 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/14/2023 start-time=17:32:06
add interval=4w2d name=837682 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/14/2023 start-time=17:35:33
add interval=4w2d name=87849879 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/14/2023 start-time=17:50:20
add interval=3d name=87258563 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/15/2023 start-time=08:47:09
add interval=4w2d name=36968345 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/15/2023 start-time=11:25:44
add interval=4w2d name=93949225 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/15/2023 start-time=11:51:48
add interval=4w2d name=75863248 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/15/2023 start-time=11:52:05
add interval=4w2d name=97895853 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/15/2023 start-time=12:34:45
add interval=1w name=63746943 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/15/2023 start-time=12:58:16
add interval=1w name=9198779835 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/15/2023 start-time=13:00:27
add interval=1w name=9143533256 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/15/2023 start-time=13:08:46
add interval=4w2d name=399249 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/15/2023 start-time=13:39:16
add interval=1w name=65324599 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/15/2023 start-time=14:03:09
add interval=4w2d name=95322789 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/16/2023 start-time=16:29:24
add interval=4w2d name=25487578 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/16/2023 start-time=17:36:47
add interval=4w2d name=52972393 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/17/2023 start-time=14:26:33
add interval=1w name=28385725 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/17/2023 start-time=15:08:56
add interval=1w name=35677243 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/17/2023 start-time=15:13:40
add interval=4w2d name=52945449 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/17/2023 start-time=15:15:05
add interval=4w2d name=33254937 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/17/2023 start-time=15:19:25
add interval=4w2d name=42366287 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/17/2023 start-time=16:50:46
add interval=4w2d name=54639954 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/17/2023 start-time=16:55:28
add interval=1w name=87699276 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/18/2023 start-time=10:41:52
add interval=1w name=9126844967 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/18/2023 start-time=13:07:52
add interval=4w2d name=59388756 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/18/2023 start-time=14:49:19
add interval=4w2d name=73493336 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/18/2023 start-time=15:29:04
add interval=4w2d name=62246875 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/18/2023 start-time=15:31:57
add interval=1w name=9146543956 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/18/2023 start-time=15:37:15
add interval=4w2d name=737625 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/18/2023 start-time=15:44:53
add interval=4w2d name=934878 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/18/2023 start-time=15:49:26
add interval=4w2d name=37369569 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/18/2023 start-time=16:08:43
add interval=4w2d name=67947245 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=10:57:40
add interval=4w2d name=88768953 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=12:09:23
add interval=1w name=9135799873 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=12:13:00
add interval=4w2d name=63563824 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=12:42:15
add interval=4w2d name=562554 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=14:51:17
add interval=4w2d name=447335 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=15:31:39
add interval=1w name=72895754 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=15:39:37
add interval=1d name=6032677742 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=15:47:22
add interval=4w2d name=36269397 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=16:20:30
add interval=1w name=58235793 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=16:21:33
add interval=4w2d name=86759266 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=16:50:18
add interval=4w2d name=78685845 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=16:54:05
add interval=4w2d name=793962 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/20/2023 start-time=16:56:39
add interval=4w2d name=43896767 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/21/2023 start-time=10:53:47
add interval=1d name=6025372337 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/21/2023 start-time=11:25:07
add interval=4w2d name=62357976 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/21/2023 start-time=11:38:38
add interval=1d name=6064943894 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/21/2023 start-time=11:38:38
add interval=4w2d name=26226525 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/21/2023 start-time=12:03:46
add interval=4w2d name=56975893 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/21/2023 start-time=12:06:48
add interval=4w2d name=97443659 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/21/2023 start-time=13:28:01
add interval=4w2d name=45643556 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/21/2023 start-time=16:48:50
add interval=4w2d name=25697333 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/21/2023 start-time=17:52:32
add interval=4w2d name=65498336 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/21/2023 start-time=17:53:01
add interval=1w name=9148292532 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=11:08:54
add interval=1w name=9178943399 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=11:31:19
add interval=1d name=6074372332 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=11:44:12
add interval=1w name=9195353834 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=12:55:14
add interval=4w2d name=43632353 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=13:28:39
add interval=1w name=33465523 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=14:38:51
add interval=1w name=48722627 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=14:53:23
add interval=1w name=75949878 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=15:14:26
add interval=1w name=96866362 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=15:25:34
add interval=1w name=55382393 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=15:28:18
add interval=1w name=52977443 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=15:29:41
add interval=4w2d name=72539422 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=15:49:39
add interval=1w name=93684764 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=16:06:13
add interval=4w2d name=45637542 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=16:12:56
add interval=4w2d name=56455897 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=16:17:06
add interval=4w2d name=99386797 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/22/2023 start-time=16:45:04
add interval=4w2d name=62947444 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=10:08:23
add interval=4w2d name=33672936 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=10:18:29
add interval=4w2d name=54268552 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=11:13:06
add interval=4w2d name=986646 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=11:21:40
add interval=4w2d name=62452767 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=12:39:22
add interval=4w2d name=65628858 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=13:59:28
add interval=1w name=9173994444 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=14:41:49
add interval=1w name=36586234 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=14:50:30
add interval=4w2d name=779457 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=15:34:47
add interval=1d name=6066253663 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=16:24:36
add interval=4w2d name=82338533 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=16:32:05
add interval=1w name=9123589389 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=17:08:00
add interval=4w2d name=87636785 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=17:11:36
add interval=4w2d name=68985323 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=17:19:03
add interval=4w2d name=63333855 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/23/2023 start-time=17:32:30
add interval=4w2d name=25235573 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/24/2023 start-time=07:37:23
add interval=2w name=040404 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/24/2023 start-time=07:42:41
add interval=1w name=66837422 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/24/2023 start-time=10:31:02
add interval=4w2d name=78454638 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/24/2023 start-time=10:33:21
add interval=4w2d name=478947 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/24/2023 start-time=11:05:44
add interval=4w2d name=96426643 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/24/2023 start-time=14:33:33
add interval=1w name=69728946 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/24/2023 start-time=14:45:27
add interval=1w name=63353392 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/24/2023 start-time=15:15:55
add interval=1w name=87952729 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/24/2023 start-time=15:33:47
add interval=4w2d name=29943466 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/25/2023 start-time=11:06:54
add interval=1w name=36488336 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/25/2023 start-time=11:26:24
add interval=4w2d name=73939324 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/25/2023 start-time=12:37:13
add interval=4w2d name=487754 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/25/2023 start-time=13:12:13
add interval=1w name=55924648 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/25/2023 start-time=13:36:58
add interval=1d name=68497967 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/25/2023 start-time=13:40:20
add interval=4w2d name=28796386 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/25/2023 start-time=17:19:07
add interval=1w name=54883266 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/25/2023 start-time=17:55:05
add interval=1w name=9148695858 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/27/2023 start-time=18:08:34
add interval=4w2d name=64838747 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/28/2023 start-time=17:29:47
add interval=1w name=35275629 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/01/2023 start-time=15:15:21
add interval=4w2d name=65576638 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/01/2023 start-time=16:18:26
add interval=1w name=26626482 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/01/2023 start-time=17:48:39
add interval=4w2d name=53379266 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/01/2023 start-time=17:52:35
add interval=1d name=6059364952 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/04/2023 start-time=13:01:24
add interval=1w name=34757949 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/04/2023 start-time=15:13:19
add interval=1w name=76472278 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/04/2023 start-time=16:30:01
add interval=4w2d name=83936 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/06/2023 start-time=17:59:52
add interval=1w name=76366 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/06/2023 start-time=18:00:02
add interval=1w name=75236 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/06/2023 start-time=18:03:00
add interval=1d name=62666 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=09:33:44
add interval=1w name=37658542 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=09:52:29
add interval=1d name=69448 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=09:57:39
add interval=1w name=95739 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=09:58:46
add interval=1w name=63833 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=10:12:53
add interval=1w name=44224 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=10:18:56
add interval=1w name=96369 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=10:39:42
add interval=1w name=43362 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=10:44:57
add interval=1w name=56744 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=10:55:55
add interval=1w name=49535 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=10:55:55
add interval=1w name=59865 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=16:44:09
add interval=1w name=89943 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=16:48:45
add interval=4w2d name=22934 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=17:20:32
add interval=1d name=27674 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/07/2023 start-time=17:28:06
add interval=1d name=93937 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/08/2023 start-time=10:08:43
add interval=4w2d name=75227747 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/08/2023 start-time=15:40:11
add interval=1w name=63378899 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/08/2023 start-time=15:53:51
add interval=1d name=77932 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/08/2023 start-time=16:09:03
add interval=4w2d name=93696 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/08/2023 start-time=17:07:10
add interval=1w name=73833 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=11:40:20
add interval=4w2d name=23379625 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=11:41:47
add interval=4w2d name=46877 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=11:41:47
add interval=1w name=93675 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=11:45:21
add interval=1w name=65769 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=12:10:49
add interval=1w name=63752 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=12:38:29
add interval=1w name=97293 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=12:38:29
add interval=4w2d name=42438984 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=12:39:46
add interval=1w name=84845 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=13:26:00
add interval=1w name=68622 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=13:49:43
add interval=4w2d name=95926383 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=13:51:34
add interval=1d name=43593 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=13:51:34
add interval=4w2d name=38598 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=13:55:00
add interval=4w2d name=25455269 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=13:55:00
add interval=4w2d name=88634 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=13:55:00
add interval=4w2d name=84254835 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=13:55:01
add interval=4w2d name=23779 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=14:11:05
add interval=1w name=63545348 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=14:37:33
add interval=4w2d name=55562 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=15:09:40
add interval=4w2d name=58824445 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=16:07:08
add interval=4w2d name=28935 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=16:14:20
add interval=4w2d name=42933 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/09/2023 start-time=16:17:39
add interval=1w name=47749 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/10/2023 start-time=14:33:06
add interval=1w name=64646 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/10/2023 start-time=15:40:02
add interval=1w name=84954 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/10/2023 start-time=16:33:06
add interval=4w2d name=39967358 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/10/2023 start-time=16:33:06
add interval=1w name=88873 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/10/2023 start-time=16:39:06
add interval=4w2d name=34639 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/10/2023 start-time=17:54:32
add interval=1w name=43949 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=12:34:13
add interval=1w name=23658 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=13:04:26
add interval=4w2d name=22397 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=14:11:46
add interval=4w2d name=87494 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=14:34:40
add interval=4w2d name=84664 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=14:46:59
add interval=1w name=46863 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=14:47:01
add interval=1d name=45355 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=15:48:29
add interval=4w2d name=89697 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=16:12:51
add interval=4w2d name=44594 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=16:13:18
add interval=1w name=57976 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=16:28:35
add interval=4w2d name=26897 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=16:28:35
add interval=4w2d name=77446276 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=16:28:39
add interval=4w2d name=94455 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=16:29:08
add interval=4w2d name=82267 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=16:41:20
add interval=4w2d name=47982995 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=17:28:38
add interval=4w2d name=86337 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/11/2023 start-time=18:10:50
add interval=4w2d name=74443646 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/13/2023 start-time=11:53:03
add interval=1w name=9123324644 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/13/2023 start-time=11:53:03
add interval=1w name=28833 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/13/2023 start-time=12:10:33
add interval=4w2d name=29658 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/13/2023 start-time=12:10:34
add interval=1w name=32297 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/13/2023 start-time=14:25:15
add interval=1d name=63574 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/13/2023 start-time=15:27:47
add interval=1w name=88882 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=11:53:25
add interval=4w2d name=87562 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=12:17:54
add interval=1w name=44726 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=12:17:54
add interval=1d name=99949 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=12:49:59
add interval=4w2d name=77755 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=12:59:43
add interval=4w2d name=97384 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=13:04:28
add interval=4w2d name=39746778 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=14:10:23
add interval=4w2d name=33977 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=14:38:24
add interval=1w name=65298 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=15:19:55
add interval=4w2d name=46394 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=15:21:21
add interval=1w name=72252 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=15:31:27
add interval=1w name=77447 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=15:56:58
add interval=1w name=34566 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=15:58:18
add interval=4w2d name=78799 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=16:01:01
add interval=1w name=86346 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=16:26:59
add interval=1w name=73453 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2023 start-time=16:36:39
add interval=1w name=32435 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/15/2023 start-time=12:43:50
add interval=1w name=26589 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/15/2023 start-time=13:40:10
add interval=1w name=23388 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/15/2023 start-time=14:23:54
add interval=4w2d name=67835 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/15/2023 start-time=15:52:24
add interval=4w2d name=99849 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/15/2023 start-time=16:00:58
add interval=1w name=42978 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/15/2023 start-time=16:04:16
add interval=1d name=75893 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/15/2023 start-time=16:11:43
add interval=4w2d name=57683 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/15/2023 start-time=16:17:00
add interval=1w name=56659 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/15/2023 start-time=16:24:56
add interval=1w name=98343 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/15/2023 start-time=16:32:22
add interval=4w2d name=67995 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/15/2023 start-time=16:50:23
add interval=4w2d name=56729 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/15/2023 start-time=17:06:25
add interval=1w name=46463 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=08:33:47
add interval=1w name=85365 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=08:51:25
add interval=1w name=84672 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=09:01:24
add interval=4w2d name=38259 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=09:17:25
add interval=4w2d name=73657 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=09:30:31
add interval=1w name=73583 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=09:30:31
add interval=1w name=77962 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=09:35:23
add interval=4w2d name=58628 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=09:53:28
add interval=1w name=84959 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=09:56:27
add interval=4w2d name=49866 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=09:56:27
add interval=4w2d name=22949 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=09:56:28
add interval=1w name=54393 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=09:59:23
add interval=1w name=45555 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=10:10:24
add interval=4w2d name=34798 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=10:10:24
add interval=4w2d name=77287 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=10:16:50
add interval=4w2d name=65235 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=10:18:35
add interval=4w2d name=83822 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=10:18:35
add interval=1w name=95429 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=10:22:06
add interval=4w2d name=72996 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=10:22:06
add interval=1w name=9135795233 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=10:23:41
add interval=4w2d name=62274 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=10:26:42
add interval=1w name=25224 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=10:44:06
add interval=4w2d name=42878 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=10:45:49
add interval=1d name=98538 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=10:54:58
add interval=4w2d name=48863 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=11:02:32
add interval=1w name=82368 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=11:02:32
add interval=4w2d name=36724 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=11:06:19
add interval=1w name=98644 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=11:11:10
add interval=1w name=92935 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=11:11:10
add interval=1w name=83478 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=11:12:32
add interval=1w name=86422 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=11:18:21
add interval=1w name=56282 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=11:22:38
add interval=1w name=22583 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=12:38:08
add interval=4w2d name=76342 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=12:38:08
add interval=1d name=47594 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=13:33:29
add interval=1w name=39638 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=15:24:56
add interval=1w name=32348 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=17:00:38
add interval=4w2d name=34486 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/16/2023 start-time=17:50:22
add interval=1w name=44239 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/17/2023 start-time=11:07:22
add interval=1w name=89467 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/17/2023 start-time=11:49:19
add interval=4w2d name=75325 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/17/2023 start-time=11:51:30
add interval=1w name=47928 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/17/2023 start-time=14:42:54
add interval=1w name=56539 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/17/2023 start-time=14:49:19
add interval=1w name=32298 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/18/2023 start-time=11:29:19
add interval=1w name=84662 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/18/2023 start-time=11:29:19
add interval=1w name=85229 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/18/2023 start-time=12:03:11
add interval=1w name=97683 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/18/2023 start-time=12:24:53
add interval=1w name=25457 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/18/2023 start-time=12:49:14
add interval=1w name=84828 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/18/2023 start-time=13:03:23
add interval=1w name=44233 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/18/2023 start-time=13:16:52
add interval=4w2d name=96237 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/18/2023 start-time=13:20:13
add interval=1w name=85454 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/18/2023 start-time=13:24:51
add interval=4w2d name=93657 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/18/2023 start-time=13:24:51
add interval=1w name=32992 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/18/2023 start-time=13:28:46
add interval=1w name=25239 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/18/2023 start-time=17:15:33
add interval=1w name=55347 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/20/2023 start-time=08:36:32
add interval=1d name=89452 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/20/2023 start-time=09:37:42
add interval=4w2d name=69267 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/20/2023 start-time=10:02:42
add interval=4w2d name=83272 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=10:30:54
add interval=4w2d name=93982 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=10:33:30
add interval=4w2d name=78835 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/20/2023 start-time=11:32:30
add interval=4w2d name=34745 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/20/2023 start-time=11:32:30
add interval=1w name=33852 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/20/2023 start-time=12:17:46
add interval=1w name=35725 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/20/2023 start-time=12:25:21
add interval=1w name=54228595 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/20/2023 start-time=12:29:40
add interval=4w2d name=36623 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/20/2023 start-time=12:31:07
add interval=4w2d name=92865 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/20/2023 start-time=12:31:17
add interval=4w2d name=93779 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/20/2023 start-time=12:54:06
add interval=4w2d name=66432 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/20/2023 start-time=13:06:52
add interval=3d name=56542 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/22/2023 start-time=14:12:30
add interval=1d name=48947 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/22/2023 start-time=14:13:40
add interval=4w2d name=85824 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/22/2023 start-time=15:06:35
add interval=1w name=58536 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/22/2023 start-time=15:11:55
add interval=1w name=74946 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/22/2023 start-time=15:23:09
add interval=1w name=44569 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/22/2023 start-time=15:58:24
add interval=4w2d name=64228 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=08:41:39
add interval=4w2d name=22995 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=09:07:27
add interval=1w name=63588 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=09:15:33
add interval=1w name=43288 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=09:19:45
add interval=1d name=86552 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=10:10:25
add interval=4w2d name=33595 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=10:15:21
add interval=1w name=88436 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:09:03
add interval=4w2d name=68889 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:09:03
add interval=1w name=58284 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:16:21
add interval=4w2d name=88932 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:16:21
add interval=1w name=77785 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:20:57
add interval=1w name=66373 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:20:57
add interval=1w name=95832 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:24:48
add interval=4w2d name=93797 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:24:48
add interval=4w2d name=88574 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:24:48
add interval=1w name=33742 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:24:48
add interval=1w name=66973 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=12:28:35
add interval=1w name=87769 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:28:35
add interval=1w name=68232 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:28:35
add interval=1d name=76722 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:28:35
add interval=1w name=43532 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=12:36:48
add interval=1w name=88958 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=12:54:38
add interval=1w name=55696 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=14:25:35
add interval=4w2d name=44257 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=14:29:58
add interval=4w2d name=98839 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=14:30:05
add interval=4w2d name=86388 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=14:30:05
add interval=1w name=95652 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=14:39:56
add interval=4w2d name=57466 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=14:52:32
add interval=1w name=24439 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=16:31:19
add interval=4w2d name=89748 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=16:33:27
add interval=4w2d name=36278 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/23/2023 start-time=16:57:58
add interval=1d name=74449 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:01:18
add interval=1w name=27665 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/24/2023 start-time=12:06:58
add interval=4w2d name=52559 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/24/2023 start-time=12:55:44
add interval=1d name=86639 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/24/2023 start-time=13:03:23
add interval=1w name=45337 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/24/2023 start-time=13:36:13
add interval=1w name=95757 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/24/2023 start-time=14:19:32
add interval=4w2d name=32797 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=15:48:28
add interval=1w name=24236 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=15:48:28
add interval=1d name=79635 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/24/2023 start-time=16:06:33
add interval=1w name=44346 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/24/2023 start-time=16:08:55
add interval=4w2d name=75573 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/24/2023 start-time=16:28:48
add interval=1d name=75527 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/25/2023 start-time=10:05:59
add interval=4w2d name=86258 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=10:31:12
add interval=4w2d name=68926 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=10:33:57
add interval=1w name=43892 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=10:49:24
add interval=1w name=73979 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=10:49:30
add interval=1w name=28732 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=11:26:52
add interval=1w name=73785 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=11:35:19
add interval=1w name=88455 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=12:10:53
add interval=4w2d name=68875 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=12:27:03
add interval=1w name=23646 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=12:36:47
add interval=4w2d name=99785 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=12:45:07
add interval=4w2d name=93668 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=13:35:10
add interval=4w2d name=85728 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=14:40:19
add interval=4w2d name=78833 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=15:03:15
add interval=1w name=42892 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=17:06:04
add interval=1w name=28694 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/27/2023 start-time=17:45:59
add interval=1w name=83676 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/28/2023 start-time=12:34:50
add interval=2w name=498929 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/28/2023 start-time=13:04:00
add interval=1w name=57238 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/28/2023 start-time=13:24:45
add interval=1w name=55235 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/28/2023 start-time=13:26:19
add interval=1w name=23622 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/28/2023 start-time=14:37:51
add interval=4w2d name=62977 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/28/2023 start-time=14:39:33
add interval=1w name=82823 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/28/2023 start-time=15:30:27
add interval=4w2d name=23736 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/28/2023 start-time=15:42:00
add interval=1w name=48587 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/28/2023 start-time=15:50:31
add interval=1w name=84566 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/28/2023 start-time=15:50:31
add interval=1w name=67229 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/30/2023 start-time=17:03:09
add interval=4w2d name=56463 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/30/2023 start-time=17:19:41
add interval=4w2d name=28769 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=apr/13/2023 start-time=14:54:47
add interval=4w2d name=76655 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=apr/14/2023 start-time=15:18:51
add interval=4w2d name=25647 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=apr/14/2023 start-time=15:20:04
add interval=1w name=82477 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=apr/14/2023 start-time=15:59:28
add interval=1w name=24942889 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=apr/19/2023 start-time=15:21:19
add interval=1d name=67763 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/03/2023 start-time=13:33:09
add interval=4w2d name=54364 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/03/2023 start-time=15:20:12
add interval=2w name=567826 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/03/2023 start-time=15:20:12
add interval=4w2d name=33655 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/03/2023 start-time=15:20:12
add interval=4w2d name=88449 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/03/2023 start-time=15:20:12
add interval=1w name=69843468 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/11/2023 start-time=13:45:38
add interval=4w2d name=52339789 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/11/2023 start-time=14:06:03
add interval=1w name=38238994 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/11/2023 start-time=14:07:46
add interval=1w name=9138658484 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/11/2023 start-time=14:09:28
add interval=4w2d name=25849 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/11/2023 start-time=14:09:28
add interval=4w2d name=62666853 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/11/2023 start-time=14:13:00
add interval=4w2d name=52785562 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/11/2023 start-time=14:34:14
add interval=1w name=79978884 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/11/2023 start-time=14:38:26
add interval=4w2d name=98852 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/11/2023 start-time=15:05:08
add interval=1w name=33833 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/11/2023 start-time=15:44:03
add interval=1d name=82233353 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/11/2023 start-time=17:09:51
add interval=1w name=9132832456 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/11/2023 start-time=18:02:41
add interval=1d name=55765655 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/15/2023 start-time=14:37:45
add interval=1w name=52768 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/15/2023 start-time=15:14:34
add interval=1d name=97525473 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/15/2023 start-time=15:16:58
add interval=1w name=69749 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/16/2023 start-time=12:35:31
add interval=1d name=93557929 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/16/2023 start-time=12:59:26
add interval=1w name=75376 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/16/2023 start-time=13:19:56
add interval=4w2d name=46795889 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/16/2023 start-time=14:23:46
add interval=4w2d name=54269 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/16/2023 start-time=14:23:52
add interval=4w2d name=27282959 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/16/2023 start-time=14:23:54
add interval=4w2d name=42752885 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/16/2023 start-time=14:47:14
add interval=1w name=35425456 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/16/2023 start-time=14:47:32
add interval=4w2d name=39542967 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/16/2023 start-time=15:03:53
add interval=1w name=6836859 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/17/2023 start-time=13:53:10
add interval=4w2d name=53996 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/17/2023 start-time=14:03:02
add interval=4w2d name=37989466 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/17/2023 start-time=15:21:43
add interval=1w name=9157682297 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/17/2023 start-time=15:23:46
add interval=4w2d name=26925 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/17/2023 start-time=15:54:33
add interval=4w2d name=33783996 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/17/2023 start-time=16:02:23
add interval=4w2d name=35726885 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/17/2023 start-time=16:02:28
add interval=4w2d name=33257 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/17/2023 start-time=16:18:12
add interval=1w name=8283556 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/18/2023 start-time=17:04:40
add interval=4w2d name=39267592 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/20/2023 start-time=13:20:07
add interval=4w2d name=42326 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/20/2023 start-time=15:28:20
add interval=1d name=92464582 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/20/2023 start-time=16:22:00
add interval=4w2d name=34387998 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=13:28:54
add interval=2w name=287886 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=13:36:11
add interval=1w name=36892 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=13:47:06
add interval=1w name=8856563 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=13:57:14
add interval=1w name=3353928 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=14:33:00
add interval=1w name=8494364 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=14:33:30
add interval=1w name=7676742 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=14:43:34
add interval=1w name=3774596 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=15:22:02
add interval=4w2d name=33592594 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=15:23:11
add interval=4w2d name=38889979 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=15:32:31
add interval=4w2d name=86275276 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=15:54:21
add interval=4w2d name=44465273 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=16:10:54
add interval=4w2d name=22564834 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=16:23:33
add interval=1w name=8682385 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=16:23:33
add interval=4w2d name=37363847 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=17:16:11
add interval=1w name=3755947 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=17:16:22
add interval=4w2d name=66242 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=17:23:54
add interval=4w2d name=45926827 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=17:35:44
add interval=4w2d name=95947 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/22/2023 start-time=17:35:44
add interval=1w name=6977256 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/23/2023 start-time=11:06:35
add interval=4w2d name=29982778 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/23/2023 start-time=11:39:19
add interval=1w name=2936955 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/23/2023 start-time=11:53:46
add interval=1w name=4258774 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/23/2023 start-time=11:55:24
add interval=4w2d name=75547 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/23/2023 start-time=12:36:17
add interval=1w name=2392777 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/23/2023 start-time=13:27:22
add interval=4w2d name=46652723 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/23/2023 start-time=14:02:52
add interval=4w2d name=95687537 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/23/2023 start-time=14:16:36
add interval=1w name=9175655869 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/23/2023 start-time=14:21:08
add interval=1w name=53442 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/23/2023 start-time=14:30:48
add interval=1w name=9524676 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/23/2023 start-time=14:42:09
add interval=4w2d name=24744 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/23/2023 start-time=15:08:31
add interval=1d name=88962 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/25/2023 start-time=09:03:26
add interval=1d name=79885 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/25/2023 start-time=09:31:39
add interval=1w name=2756967 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/25/2023 start-time=10:12:18
add interval=1w name=6962399 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:53:25
add interval=4w2d name=38865 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:53:28
add interval=4w2d name=22558898 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:53:28
add interval=4w2d name=94297457 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:53:28
add interval=4w2d name=66945687 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:56:17
add interval=1w name=5349729 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:56:17
add interval=1w name=5334426 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:56:17
add interval=1w name=7772269 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:57:47
add interval=4w2d name=36882392 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:57:47
add interval=4w2d name=75894 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:57:47
add interval=1w name=9123992557 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:57:47
add interval=4w2d name=44993792 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:57:47
add interval=1w name=84647 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=12:59:18
add interval=4w2d name=36774644 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=13:00:50
add interval=4w2d name=73823 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=13:00:50
add interval=4w2d name=56898227 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/25/2023 start-time=15:58:39
add interval=1d name=33796 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/25/2023 start-time=16:10:25
add interval=1w name=6353862 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/25/2023 start-time=17:27:07
add interval=1w name=4834553 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/26/2023 start-time=14:32:55
add interval=4w2d name=65967747 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/26/2023 start-time=14:36:34
add interval=4w2d name=32739674 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/26/2023 start-time=15:06:11
add interval=1d name=63325899 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/26/2023 start-time=15:20:16
add interval=1w name=5433253 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/26/2023 start-time=15:31:18
add interval=1w name=48875754 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/26/2023 start-time=15:36:45
add interval=1w name=4293532 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/26/2023 start-time=15:40:44
add interval=2w name=336472 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/26/2023 start-time=16:19:27
add interval=1d name=79762274 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/26/2023 start-time=16:24:19
add interval=1w name=9388925 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/26/2023 start-time=17:01:45
add interval=4w2d name=39253277 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/26/2023 start-time=17:36:04
add interval=1w name=4852922 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/26/2023 start-time=17:45:22
add interval=1w name=4999955 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/27/2023 start-time=14:18:53
add interval=1w name=2326649 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/27/2023 start-time=14:57:59
add interval=1w name=7623777 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/27/2023 start-time=16:06:18
add interval=1w name=8295498 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/27/2023 start-time=16:41:47
add interval=1w name=8778589 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/29/2023 start-time=15:45:07
add interval=1w name=9659897 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/29/2023 start-time=15:55:45
add interval=1d name=27865 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/29/2023 start-time=16:17:23
add interval=4w2d name=39694799 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/29/2023 start-time=16:18:17
add interval=1w name=8582546 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/29/2023 start-time=17:23:09
add interval=1w name=3835739 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/29/2023 start-time=17:59:57
add interval=1w name=4627585 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/30/2023 start-time=15:36:15
add interval=4w2d name=34277387 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/30/2023 start-time=15:58:50
add interval=4w2d name=36549337 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/30/2023 start-time=16:00:46
add interval=1w name=7992479 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/31/2023 start-time=12:20:02
add interval=4w2d name=35894867 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/31/2023 start-time=14:24:54
add interval=4w2d name=35376756 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=15:08:24
add interval=4w2d name=54856283 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=15:39:14
add interval=1d name=59785 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=15:55:02
add interval=1w name=8763559 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=16:18:09
add interval=4w2d name=37582366 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=16:25:01
add interval=1w name=9185428732 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=16:27:26
add interval=1d name=29677 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=16:32:47
add interval=4w2d name=39554433 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=16:32:47
add interval=1w name=4254582 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=16:41:11
add interval=1w name=4994684 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=16:41:18
add interval=4w2d name=46773 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=16:41:18
add interval=1w name=7297226 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=16:41:18
add interval=4w2d name=49529 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=16:42:16
add interval=4w2d name=66752268 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=17:01:07
add interval=1d name=32864 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/01/2023 start-time=17:11:24
add interval=1d name=45928 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/02/2023 start-time=12:08:45
add interval=1w name=3869372 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/02/2023 start-time=12:41:37
add interval=4w2d name=37297356 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/02/2023 start-time=12:44:04
add interval=4w2d name=39334579 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/02/2023 start-time=13:51:29
add interval=1w name=8574934 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/02/2023 start-time=13:56:49
add interval=1d name=59863 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/03/2023 start-time=13:11:33
add interval=4w2d name=79942343 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/03/2023 start-time=14:31:59
add interval=4w2d name=62584792 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/03/2023 start-time=14:40:02
add interval=4w2d name=78729264 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/03/2023 start-time=14:54:37
add interval=1w name=2596482 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/03/2023 start-time=15:36:10
add interval=1w name=9896634 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/03/2023 start-time=17:38:32
add interval=1w name=7458539 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/05/2023 start-time=16:23:56
add interval=1w name=9439578 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/05/2023 start-time=16:23:57
add interval=4w2d name=32825627 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/06/2023 start-time=13:41:48
add interval=1w name=9724588 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/06/2023 start-time=14:07:49
add interval=4w2d name=99658359 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/06/2023 start-time=14:32:48
add interval=1w name=2738583 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/06/2023 start-time=15:50:12
add interval=1w name=9499453 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/06/2023 start-time=16:20:06
add interval=4w2d name=92445 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/06/2023 start-time=16:27:10
add interval=4w2d name=92257549 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/06/2023 start-time=16:55:05
add interval=1w name=6642543 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/06/2023 start-time=16:55:08
add interval=1w name=3388955 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/06/2023 start-time=17:29:16
add interval=4w2d name=74857889 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/06/2023 start-time=17:56:24
add interval=1w name=6856938 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/07/2023 start-time=13:43:09
add interval=1w name=3556793 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=sep/16/2022 start-time=14:28:44
add interval=1w name=8699598 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/07/2023 start-time=15:52:44
add interval=1w name=3459778 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/07/2023 start-time=15:54:30
add interval=1w name=5456462 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=09:01:29
add interval=4w2d name=34332334 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=09:10:29
add interval=1w name=9229579 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=09:21:41
add interval=1d name=97976 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=09:45:50
add interval=4w2d name=39247727 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=12:04:19
add interval=1w name=3228973 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=12:05:28
add interval=4w2d name=37277239 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=12:42:20
add interval=4w2d name=52258886 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=12:52:01
add interval=1w name=8472737 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=13:04:08
add interval=1d name=45262 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=13:06:19
add interval=1w name=9137627435 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=14:16:08
add interval=4w2d name=37967422 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=16:59:23
add interval=1d name=89695 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/10/2023 start-time=17:28:47
add interval=1w name=5225377 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/12/2023 start-time=12:22:21
add interval=4w2d name=72262532 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=07:44:05
add interval=4w2d name=87642497 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=08:37:37
add interval=4w2d name=36368546 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=08:55:25
add interval=4w2d name=33776424 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=09:28:47
add interval=1w name=3637546 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=10:41:42
add interval=1w name=9729388 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=10:54:54
add interval=4w2d name=34922396 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=11:15:12
add interval=4w2d name=D234234 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=11:50:17
add interval=4w2d name=34247569 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=12:18:15
add interval=2w name=259323 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=14:14:43
add interval=1w name=5496298 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=14:17:59
add interval=4w2d name=35528579 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=14:21:43
add interval=1w name=6878685 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=14:21:43
add interval=1w name=D27398 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=14:22:32
add interval=1w name=3359468 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=14:39:14
add interval=1w name=8582768 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=14:42:48
add interval=1w name=5955676 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=14:45:18
add interval=4w2d name=39937246 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=15:23:10
add interval=4w2d name=39894572 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=15:33:17
add interval=4w2d name=D693845 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=15:47:55
add interval=1w name=4765933 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=15:47:56
add interval=4w2d name=45433388 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=16:11:57
add interval=4w2d name=78728294 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/13/2023 start-time=16:23:36
add interval=1w name=2363292 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/14/2023 start-time=09:33:59
add interval=1w name=9666283 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/14/2023 start-time=10:10:22
add interval=4w2d name=39726238 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/14/2023 start-time=13:59:57
add interval=1w name=6346832 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/14/2023 start-time=14:01:18
add interval=1w name=8527494 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/14/2023 start-time=15:59:56
add interval=1w name=9349354 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/15/2023 start-time=08:42:24
add interval=1w name=9485452 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=10:51:54
add interval=1w name=D43536 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/15/2023 start-time=11:04:52
add interval=1w name=D97472 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/15/2023 start-time=11:11:46
add interval=4w2d name=87529268 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/15/2023 start-time=14:45:37
add interval=1w name=7594448 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/15/2023 start-time=15:37:15
add interval=4w2d name=75978 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/16/2023 start-time=15:33:01
add interval=1w name=5939339 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/16/2023 start-time=18:18:04
add interval=3d name=26248 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/17/2023 start-time=16:06:19
add interval=4w2d name=36385272 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=09:10:01
add interval=1w name=D88929 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=09:50:17
add interval=4w2d name=35267947 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=09:52:46
add interval=4w2d name=38927433 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=10:05:45
add interval=4w2d name=35895587 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=10:11:26
add interval=1w name=8928659 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=10:11:37
add interval=4w2d name=36545565 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=10:55:37
add interval=1w name=4376785 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=10:57:16
add interval=4w2d name=36497499 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=11:08:59
add interval=1d name=96669 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=11:41:13
add interval=1w name=D94323 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=12:44:02
add interval=4w2d name=D969757 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=13:46:13
add interval=1w name=D46324 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=15:23:02
add interval=4w2d name=35259535 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=15:50:14
add interval=1w name=D85956 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=16:55:24
add interval=4w2d name=32732693 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=16:57:11
add interval=4w2d name=D252523 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=16:58:43
add interval=4w2d name=D542529 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/19/2023 start-time=17:23:37
add interval=4w2d name=D956777 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=10:02:16
add interval=1w name=D56768 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=10:02:39
add interval=4w2d name=35399 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=11:02:15
add interval=4w2d name=38567252 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=11:02:21
add interval=1w name=5923878 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=11:03:45
add interval=1w name=9128798553 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=11:03:45
add interval=1w name=2684527 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=11:09:16
add interval=1w name=D57384 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=11:16:42
add interval=1w name=D73893 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=11:35:01
add interval=1w name=D35486 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=12:36:54
add interval=1d name=26537 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=13:01:11
add interval=1w name=D28299 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=13:21:37
add interval=4w2d name=34733586 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=13:28:36
add interval=1w name=D65588 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=13:53:04
add interval=4w2d name=33277686 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=14:01:11
add interval=4w2d name=49362654 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=14:09:09
add interval=4w2d name=37586896 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/20/2023 start-time=16:53:04
add interval=1w name=8597949 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/21/2023 start-time=11:36:47
add interval=1w name=D23738 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/21/2023 start-time=11:54:54
add interval=4w2d name=33994644 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/21/2023 start-time=12:11:24
add interval=1w name=D35538 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/21/2023 start-time=13:50:59
add interval=1w name=D76789 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/21/2023 start-time=14:39:51
add interval=4w2d name=38462385 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/21/2023 start-time=15:03:36
add interval=1w name=6297697 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/21/2023 start-time=15:21:00
add interval=1w name=8748464 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/21/2023 start-time=15:30:46
add interval=1w name=D75398 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/21/2023 start-time=15:49:08
add interval=4w2d name=35769575 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/21/2023 start-time=16:46:00
add interval=4w2d name=D455833 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/22/2023 start-time=14:27:55
add interval=4w2d name=D225372 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/22/2023 start-time=14:41:42
add interval=1d name=86653 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/22/2023 start-time=17:21:12
add interval=4w2d name=D553379 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/24/2023 start-time=08:20:40
add interval=1w name=D85924 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/24/2023 start-time=09:52:58
add interval=4w2d name=38559927 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/24/2023 start-time=10:31:13
add interval=4w2d name=39828236 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/24/2023 start-time=10:42:07
add interval=4w2d name=33789656 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/24/2023 start-time=14:04:31
add interval=1w name=D52695 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/24/2023 start-time=14:57:01
add interval=1w name=D76826 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/24/2023 start-time=15:30:38
add interval=4w2d name=D989724 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/24/2023 start-time=16:03:03
add interval=1w name=D68426 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/24/2023 start-time=17:29:23
add interval=1d name=83336 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/26/2023 start-time=10:16:24
add interval=1w name=D67434 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/26/2023 start-time=10:39:09
add interval=1w name=D44583 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/26/2023 start-time=10:55:58
add interval=1d name=63763486 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/26/2023 start-time=11:59:54
add interval=4w2d name=D458783 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/26/2023 start-time=12:13:55
add interval=1d name=54426533 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/26/2023 start-time=13:44:54
add interval=1w name=D72734 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/26/2023 start-time=15:22:27
add interval=4w2d name=D374945 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/26/2023 start-time=15:41:15
add interval=1w name=D43279 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/26/2023 start-time=16:38:52
add interval=1w name=D72445 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/26/2023 start-time=16:42:16
add interval=1d name=42544647 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/27/2023 start-time=13:18:29
add interval=1w name=D64677 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/27/2023 start-time=13:56:35
add interval=1w name=D34376 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/27/2023 start-time=14:54:29
add interval=1w name=D32959 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/01/2023 start-time=09:26:35
add interval=1w name=D95938 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/03/2023 start-time=13:57:45
add interval=1w name=D23535 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/03/2023 start-time=13:58:47
add interval=1w name=D49999 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/03/2023 start-time=14:17:06
add interval=2w name=475452 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/03/2023 start-time=14:47:46
add interval=4w2d name=37442538 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/03/2023 start-time=14:58:45
add interval=1w name=D35648 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/03/2023 start-time=15:05:20
add interval=4w2d name=D292274 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/03/2023 start-time=16:26:45
add interval=1w name=D43672 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/04/2023 start-time=11:17:16
add interval=2w name=494298 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/04/2023 start-time=11:21:12
add interval=1w name=D86939 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/04/2023 start-time=11:39:26
add interval=1w name=D86977 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/04/2023 start-time=12:03:59
add interval=1d name=82353698 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/04/2023 start-time=13:26:52
add interval=1w name=D77989 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/04/2023 start-time=14:01:51
add interval=1w name=8666658 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/04/2023 start-time=14:32:58
add interval=4w2d name=D588645 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/04/2023 start-time=14:43:06
add interval=4w2d name=32347796 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/04/2023 start-time=15:00:41
add interval=1w name=D62762 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=16:10:14
add interval=4w2d name=D752977 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=16:14:56
add interval=4w2d name=495524 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=16:17:46
add interval=1w name=D32299 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/04/2023 start-time=16:22:42
add interval=1w name=D66768 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/04/2023 start-time=16:58:21
add interval=4w2d name=D728885 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=10:50:17
add interval=1w name=D33947 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=11:03:30
add interval=2w name=497933 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=11:43:03
add interval=1w name=D37233 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=11:44:21
add interval=4w2d name=D327622 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=11:47:37
add interval=1w name=D46392 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=12:40:11
add interval=4w2d name=D445589 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=12:43:01
add interval=1w name=D79923 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=12:48:22
add interval=1d name=54582795 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=13:28:26
add interval=4w2d name=D866723 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=13:33:07
add interval=1w name=D98472 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=13:51:32
add interval=1w name=D48753 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=16:10:06
add interval=1w name=D26528 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=16:16:33
add interval=4w2d name=D247455 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2023 start-time=18:03:17
add interval=1w name=D83973 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/06/2023 start-time=12:48:22
add interval=4w2d name=D824639 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/06/2023 start-time=13:06:57
add interval=1w name=2542832 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/06/2023 start-time=15:32:26
add interval=4w2d name=D952744 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/06/2023 start-time=15:33:48
add interval=1w name=D97797 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/06/2023 start-time=16:09:56
add interval=1w name=D36345 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/06/2023 start-time=17:08:07
add interval=1w name=D82458 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=11:50:07
add interval=4w2d name=D226477 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=11:56:10
add interval=4w2d name=D276643 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=12:20:22
add interval=4w2d name=D843224 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=12:27:53
add interval=1w name=3228383 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=12:29:34
add interval=4w2d name=D638296 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=12:40:52
add interval=1w name=D85589 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=12:45:23
add interval=1w name=D82284 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=12:57:32
add interval=4w2d name=34872792 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=13:39:04
add interval=4w2d name=D845883 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=13:57:39
add interval=1d name=23574 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=14:25:29
add interval=4w2d name=D957557 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=14:41:51
add interval=1d name=39797 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=15:45:26
add interval=1w name=D64948 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=15:48:05
add interval=1w name=D74947 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=15:51:37
add interval=4w2d name=D375875 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=16:05:26
add interval=1w name=D23865 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=16:26:46
add interval=4w2d name=D884793 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=17:38:44
add interval=1d name=22775 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/07/2023 start-time=17:43:20
add interval=1w name=D27974 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/08/2023 start-time=09:42:30
add interval=4w2d name=D767346 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/08/2023 start-time=13:28:30
add interval=1w name=D39998 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/08/2023 start-time=13:51:59
add interval=1d name=77559 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/08/2023 start-time=14:10:57
add interval=4w2d name=D732966 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/08/2023 start-time=17:36:24
add interval=4w2d name=D964644 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/08/2023 start-time=17:38:20
add interval=1w name=D93872 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/08/2023 start-time=17:40:03
add interval=1w name=D77228 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=11:24:07
add interval=1w name=D89486 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=11:41:43
add interval=1w name=D32667 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=12:10:55
add interval=1d name=63842 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=13:20:32
add interval=1w name=D73444 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=14:28:43
add interval=4w2d name=D424262 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=14:40:48
add interval=4w2d name=D944468 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=14:46:50
add interval=1w name=D33942 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=15:51:03
add interval=1w name=D73656 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=15:55:31
add interval=1w name=D58558 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=16:27:27
add interval=1w name=D83442 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=16:35:17
add interval=1w name=D62782 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=17:14:03
add interval=1w name=D99645 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/10/2023 start-time=17:16:50
add interval=1w name=D64983 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/11/2023 start-time=09:04:37
add interval=1w name=D98945 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/11/2023 start-time=09:11:54
add interval=4w2d name=D944596 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/11/2023 start-time=10:34:00
add interval=1d name=59975 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/11/2023 start-time=11:21:22
add interval=4w2d name=D998836 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/11/2023 start-time=15:01:20
add interval=1w name=D37736 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/11/2023 start-time=15:15:18
add interval=1w name=D89989 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/11/2023 start-time=16:24:38
add interval=1w name=D65568 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/11/2023 start-time=17:22:20
add interval=1w name=D83336 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/12/2023 start-time=11:54:38
add interval=1w name=D49586 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/12/2023 start-time=11:58:35
add interval=1w name=D96828 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/12/2023 start-time=13:11:10
add interval=1w name=D78337 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/12/2023 start-time=14:17:14
add interval=4w2d name=D496932 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/12/2023 start-time=15:10:11
add interval=1w name=3836933 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/12/2023 start-time=15:50:53
add interval=1w name=D55457 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/12/2023 start-time=16:10:59
add interval=4w2d name=74976245 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/12/2023 start-time=16:20:34
add interval=4w2d name=D787577 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/13/2023 start-time=08:54:18
add interval=1w name=D76456 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/13/2023 start-time=13:06:36
add interval=1w name=D27584 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/13/2023 start-time=15:27:14
add interval=1w name=D59575 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/13/2023 start-time=16:17:06
add interval=1w name=D48468 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/13/2023 start-time=16:38:26
add interval=4w2d name=D259884 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/13/2023 start-time=16:52:21
add interval=4w2d name=D298386 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/13/2023 start-time=17:42:29
add interval=1w name=D22293 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/14/2023 start-time=09:38:42
add interval=1w name=D22294 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/14/2023 start-time=11:47:34
add interval=4w2d name=D757289 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/14/2023 start-time=14:09:46
add interval=1w name=D93395 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/14/2023 start-time=14:56:48
add interval=4w2d name=D867986 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/14/2023 start-time=15:25:35
add interval=4w2d name=D922274 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/14/2023 start-time=15:26:46
add interval=1d name=46977 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/14/2023 start-time=16:04:39
add interval=1w name=D92647 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/14/2023 start-time=17:32:07
add interval=1w name=D54483 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/15/2023 start-time=10:02:12
add interval=1w name=D57465 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/15/2023 start-time=10:21:31
add interval=1w name=D89294 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/15/2023 start-time=10:38:45
add interval=1d name=87525 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/15/2023 start-time=13:21:17
add interval=4w2d name=D848448 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/15/2023 start-time=15:15:50
add interval=4w2d name=D683924 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/15/2023 start-time=15:57:11
add interval=4w2d name=D894849 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/15/2023 start-time=16:42:27
add interval=1w name=D65295 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/15/2023 start-time=16:57:18
add interval=1w name=D78855 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=11:13:43
add interval=1d name=77869 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=12:00:29
add interval=4w2d name=Batougoune policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=12:19:23
add interval=4w2d name=Batougoune1 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=12:23:41
add interval=1d name=25535 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=12:33:36
add interval=1w name=D47925 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=12:55:06
add interval=4w2d name=D634392 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=13:56:55
add interval=1w name=D79827 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=13:59:19
add interval=1w name=D42834 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=14:00:35
add interval=1w name=D39254 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=14:04:51
add interval=4w2d name=D625572 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=14:14:27
add interval=1d name=92727 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=14:29:21
add interval=1w name=D54446 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=14:34:03
add interval=1w name=D86484 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=14:50:29
add interval=1d name=34988 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=15:00:24
add interval=4w2d name=D525593 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=15:17:23
add interval=4w2d name=D673526 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=15:51:27
add interval=4w2d name=D746398 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=16:04:22
add interval=1w name=D49685 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=16:13:13
add interval=1w name=D25752 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=16:18:07
add interval=1w name=D82667 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=16:30:28
add interval=4w2d name=D238557 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/17/2023 start-time=16:45:49
add interval=1w name=D57756 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=10:25:51
add interval=1w name=D55526 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=11:15:32
add interval=1w name=D34529 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=11:53:41
add interval=1w name=D35995 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=11:54:55
add interval=1d name=44585 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=12:15:07
add interval=1w name=D98957 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=12:22:20
add interval=1w name=D45227 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=13:11:10
add interval=1w name=D35758 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=13:27:33
add interval=1d name=82788 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=13:27:43
add interval=1w name=D44793 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=14:09:01
add interval=1w name=D74324 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=14:13:33
add interval=1w name=D56638 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=15:06:03
add interval=4w2d name=0545227250 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=15:15:02
add interval=4w2d name=D293793 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=15:24:17
add interval=1w name=D46263 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=15:27:36
add interval=1w name=D29477 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=15:36:50
add interval=1w name=D52699 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=15:46:11
add interval=1w name=D52226 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=16:04:00
add interval=4w2d name=D597279 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=16:22:40
add interval=1w name=D97637 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/18/2023 start-time=16:29:46
add interval=4w2d name=D832332 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=17:24:01
add interval=1w name=D56572 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=17:24:33
add interval=1d name=85248 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=17:24:49
add interval=4w2d name=D949225 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=17:25:02
add interval=1w name=D26567 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/19/2023 start-time=09:48:11
add interval=1d name=27838722 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/19/2023 start-time=11:24:15
add interval=1w name=D26292 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/19/2023 start-time=12:29:18
add interval=1w name=D84764 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/19/2023 start-time=13:20:07
add interval=1w name=D85646 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/19/2023 start-time=13:24:58
add interval=1w name=D67824 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/19/2023 start-time=13:29:14
add interval=4w2d name=D379925 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/19/2023 start-time=13:52:12
add interval=1w name=D97656 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/19/2023 start-time=14:02:36
add interval=1w name=D38533 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/19/2023 start-time=14:22:52
add interval=1w name=D58287 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/19/2023 start-time=15:09:51
add interval=1w name=D32957 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=16:09:35
add interval=1w name=D22855 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=16:19:28
add interval=1w name=D68758 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/19/2023 start-time=17:37:13
add interval=1w name=D58439 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2023 start-time=08:43:33
add interval=1w name=D52935 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2023 start-time=10:19:25
add interval=1d name=37228 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2023 start-time=10:24:45
add interval=1w name=D67464 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2023 start-time=10:59:34
add interval=4w2d name=D357678 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2023 start-time=11:33:11
add interval=1w name=D46782 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2023 start-time=11:44:42
add interval=1w name=D44923 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2023 start-time=12:08:25
add interval=1w name=D74938 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2023 start-time=12:09:43
add interval=1w name=D77334 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2023 start-time=12:22:11
add interval=4w2d name=D945862 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2023 start-time=12:57:24
add interval=4w2d name=D676952 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2023 start-time=13:02:01
add interval=1d name=38627574 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=15:41:43
add interval=1d name=2020 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=15:48:37
add interval=1w name=D39879 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2023 start-time=16:52:34
add interval=1w name=D32349 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/21/2023 start-time=08:59:49
add interval=4w2d name=D354842 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/21/2023 start-time=09:49:42
add interval=1w name=D92633 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/21/2023 start-time=11:20:26
add interval=4w2d name=D788599 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/21/2023 start-time=14:54:44
add interval=1w name=D29836 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/21/2023 start-time=17:27:59
add interval=1w name=D95268 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/22/2023 start-time=12:06:42
add interval=1w name=D75247 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/22/2023 start-time=14:55:58
add interval=1w name=D44376 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/22/2023 start-time=15:26:22
add interval=4w2d name=D282493 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/22/2023 start-time=16:40:24
add interval=4w2d name=D524666 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/22/2023 start-time=17:49:46
add interval=1w name=D56523 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=11:35:30
add interval=1w name=D99796 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=11:48:19
add interval=1w name=D65599 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=11:56:45
add interval=1w name=D35956 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=12:02:00
add interval=1w name=D92574 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=12:06:48
add interval=4w2d name=D486672 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=12:30:21
add interval=1w name=D65994 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=13:07:40
add interval=1w name=D52229 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=13:35:05
add interval=1w name=D73392 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=14:39:33
add interval=1w name=D98363 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=15:21:49
add interval=4w2d name=D433575 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=16:09:42
add interval=1w name=D32579 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=16:14:21
add interval=4w2d name=D224426 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=16:45:23
add interval=4w2d name=D646765 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=17:00:22
add interval=1w name=D24955 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=17:07:05
add interval=1d name=33655936 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=17:29:32
add interval=1w name=D49377 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2023 start-time=17:35:35
add interval=4w2d name=D698293 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=10:32:03
add interval=1w name=3372745 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=11:46:59
add interval=1w name=7688756 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=11:49:26
add interval=1w name=D77863 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=11:49:31
add interval=1w name=7395773 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=11:52:24
add interval=1w name=7456288 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=11:55:36
add interval=1w name=D25244 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=13:27:12
add interval=1w name=D58356 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=14:46:35
add interval=1d name=48332476 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=16:12:27
add interval=4w2d name=D363262 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=16:23:01
add interval=1w name=D64536 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=16:30:00
add interval=1w name=D55596 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=16:34:59
add interval=4w2d name=D532558 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/25/2023 start-time=17:09:45
add interval=1w name=D26572 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=09:05:32
add interval=1d name=43252 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=09:49:56
add interval=1w name=D62846 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=10:14:55
add interval=1d name=48469 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=10:32:09
add interval=1w name=D28555 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=10:35:59
add interval=1w name=D68283 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=10:37:13
add interval=1w name=D29845 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=10:42:25
add interval=1w name=4479747 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=10:45:03
add interval=4w2d name=D623983 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=11:10:56
add interval=1w name=D83698 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=12:03:59
add interval=1w name=D28969 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=12:28:40
add interval=4w2d name=D629476 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=12:28:40
add interval=1d name=82699796 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=12:44:23
add interval=1w name=D39588 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=13:33:08
add interval=1w name=D57562 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=13:44:08
add interval=4w2d name=D674732 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=14:56:37
add interval=1w name=D62658 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=14:57:29
add interval=1w name=D93835 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=14:58:58
add interval=1w name=D49499 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=15:00:40
add interval=1w name=D63562 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=15:30:33
add interval=1w name=D22243 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=15:43:07
add interval=1w name=D93292 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=15:47:24
add interval=1w name=D55668 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=16:00:50
add interval=1d name=49755789 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=17:02:14
add interval=1w name=2537997 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2023 start-time=17:23:11
add interval=4w2d name=D469583 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2023 start-time=12:09:05
add interval=1w name=D36682 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2023 start-time=14:43:43
add interval=1w name=D49383 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2023 start-time=14:45:32
add interval=4w2d name=D498226 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2023 start-time=15:30:47
add interval=1d name=72347 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2023 start-time=15:31:38
add interval=1d name=85825936 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2023 start-time=16:08:30
add interval=1w name=D92428 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/28/2023 start-time=13:59:33
add interval=4w2d name=D586855 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/28/2023 start-time=14:00:40
add interval=1w name=D99445 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/28/2023 start-time=14:00:41
add interval=1w name=D24253 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/28/2023 start-time=16:13:38
add interval=1w name=D22878 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/29/2023 start-time=11:32:04
add interval=1d name=79749252 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/29/2023 start-time=11:51:29
add interval=1w name=D33385 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/29/2023 start-time=12:06:37
add interval=4w2d name=D228245 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/29/2023 start-time=13:10:55
add interval=1d name=94397657 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/29/2023 start-time=13:44:58
add interval=4w2d name=64829 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/29/2023 start-time=14:07:02
add interval=1w name=D63949 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/29/2023 start-time=14:21:23
add interval=1w name=D92484 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/29/2023 start-time=15:56:17
add interval=1d name=96238994 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/31/2023 start-time=10:40:48
add interval=1w name=D46359 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/31/2023 start-time=12:22:52
add interval=1w name=D39958 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/31/2023 start-time=12:27:34
add interval=1w name=D67562 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/31/2023 start-time=13:22:09
add interval=1d name=32466396 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/31/2023 start-time=13:23:07
add interval=4w2d name=D455647 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/31/2023 start-time=14:46:22
add interval=1w name=D49453 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/31/2023 start-time=15:02:10
add interval=1w name=2939267 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/31/2023 start-time=15:22:36
add interval=4w2d name=D374436 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/31/2023 start-time=16:21:17
add interval=1w name=D85433 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2023 start-time=09:57:00
add interval=1w name=D57955 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2023 start-time=11:31:32
add interval=1w name=D96766 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2023 start-time=11:33:29
add interval=1d name=0768 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2023 start-time=11:49:08
add interval=1w name=D52245 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2023 start-time=12:04:54
add interval=1w name=D35859 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2023 start-time=12:10:50
add interval=1w name=D85484 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2023 start-time=12:10:50
add interval=1d name=26484 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2023 start-time=12:14:25
add interval=1w name=D83839 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2023 start-time=13:33:46
add interval=4w2d name=D634438 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2023 start-time=13:43:52
add interval=1w name=D98647 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2023 start-time=14:01:07
add interval=4w2d name=D985865 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=16:28:11
add interval=1d name=52924 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=16:32:07
add interval=4w2d name=D936785 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2023 start-time=18:07:53
add interval=1w name=D33592 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/02/2023 start-time=12:15:37
add interval=1w name=D54898 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/02/2023 start-time=12:55:47
add interval=1w name=D63253 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/02/2023 start-time=14:02:53
add interval=1w name=D83858 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/02/2023 start-time=14:13:57
add interval=1w name=D27355 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/02/2023 start-time=14:42:23
add interval=1w name=D52232 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/02/2023 start-time=16:29:59
add interval=4w2d name=D926764 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/02/2023 start-time=16:33:52
add interval=1d name=1234 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/02/2023 start-time=16:54:37
add interval=1w name=D44264 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/03/2023 start-time=11:54:46
add interval=1w name=D49954 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/03/2023 start-time=12:03:05
add interval=1w name=D66563 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/03/2023 start-time=12:11:50
add interval=1w name=D89474 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/03/2023 start-time=12:21:27
add interval=1w name=D65366 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/03/2023 start-time=13:17:54
add interval=4w2d name=D956434 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/03/2023 start-time=13:26:42
add interval=4w2d name=D689269 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/03/2023 start-time=15:07:03
add interval=1w name=D78436 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/03/2023 start-time=16:26:51
add interval=1w name=D35336 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/03/2023 start-time=16:39:07
add interval=1w name=D62843 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/03/2023 start-time=17:10:13
add interval=1d name=52646883 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/04/2023 start-time=12:55:44
add interval=1w name=D45535 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/04/2023 start-time=13:05:00
add interval=4w2d name=D284863 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/04/2023 start-time=13:24:51
add interval=1w name=D34559 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/04/2023 start-time=14:41:35
add interval=4w2d name=D674888 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/04/2023 start-time=15:20:06
add interval=1w name=D96553 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/04/2023 start-time=15:36:50
add interval=1w name=D54948 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/04/2023 start-time=15:41:18
add interval=1w name=D89924 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/04/2023 start-time=15:45:52
add interval=4w2d name=D375422 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/04/2023 start-time=16:30:21
add interval=1w name=D29586 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/04/2023 start-time=16:42:18
add interval=1w name=D35689 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/04/2023 start-time=17:32:06
add interval=4w2d name=D595642 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/05/2023 start-time=12:43:49
add interval=4w2d name=D228225 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/05/2023 start-time=13:09:45
add interval=1w name=D77235 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/05/2023 start-time=13:36:49
add interval=1w name=D93297 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/05/2023 start-time=13:59:56
add interval=1d name=44555352 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/05/2023 start-time=14:03:32
add interval=1w name=D63967 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=11:18:41
add interval=4w2d name=D852389 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=11:27:46
add interval=1w name=D59673 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=12:04:47
add interval=1w name=D32944 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=12:31:54
add interval=4w2d name=95244 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=12:40:58
add interval=1w name=D98845 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=12:55:36
add interval=4w2d name=D998994 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=13:56:13
add interval=1w name=D37923 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=14:23:22
add interval=1w name=D47867 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=14:57:49
add interval=1w name=D92732 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=15:13:03
add interval=1w name=D88597 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=15:29:42
add interval=4w2d name=D795843 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=16:11:49
add interval=4w2d name=D798765 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/07/2023 start-time=17:49:32
add interval=4w2d name=D755687 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/08/2023 start-time=09:14:41
add interval=1w name=D37399 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/08/2023 start-time=12:32:39
add interval=1w name=D49736 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/08/2023 start-time=18:21:44
add interval=4w2d name=D935296 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=09:19:21
add interval=1w name=D82259 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=10:34:36
add interval=1w name=D54824 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=11:44:53
add interval=1w name=D59438 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=12:00:59
add interval=1d name=44 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=13:20:14
add interval=1w name=D37869 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=13:50:16
add interval=1w name=D84354 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=14:04:28
add interval=1w name=D57734 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=14:13:18
add interval=1w name=D78933 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=14:43:11
add interval=1w name=D94975 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=15:19:39
add interval=1w name=D22689 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=15:25:30
add interval=4w2d name=D428732 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=15:40:21
add interval=1w name=D32293 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=15:54:27
add interval=4w2d name=D384953 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=15:59:14
add interval=4w2d name=D963469 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=16:46:11
add interval=1w name=D58576 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/09/2023 start-time=17:20:48
add interval=1w name=D25493 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/10/2023 start-time=11:36:15
add interval=1w name=D97278 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/10/2023 start-time=12:29:21
add interval=4w2d name=D488832 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/10/2023 start-time=13:40:09
add interval=4w2d name=D485565 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/10/2023 start-time=14:14:39
add interval=1w name=D32798 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/10/2023 start-time=15:41:38
add interval=4w2d name=D948539 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/10/2023 start-time=16:02:41
add interval=1w name=D59496 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/10/2023 start-time=16:33:03
add interval=1w name=D59955 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/10/2023 start-time=16:39:30
add interval=1d name=73923653 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/10/2023 start-time=17:04:36
add interval=4w2d name=D949423 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/10/2023 start-time=17:10:34
add interval=1w name=D45762 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/11/2023 start-time=14:25:14
add interval=1w name=D58472 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/11/2023 start-time=14:45:05
add interval=1w name=D24465 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/11/2023 start-time=15:24:39
add interval=1w name=D76987 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/11/2023 start-time=16:00:52
add interval=4w2d name=D636325 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/11/2023 start-time=16:38:50
add interval=1w name=D66384 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/11/2023 start-time=17:22:46
add interval=4w2d name=D283873 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/12/2023 start-time=11:22:06
add interval=4w2d name=D999427 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/12/2023 start-time=12:57:15
add interval=1w name=D98797 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/12/2023 start-time=13:13:37
add interval=1w name=D78398 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/12/2023 start-time=14:09:13
add interval=1d name=28496822 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/12/2023 start-time=16:34:52
add interval=1w name=D65875 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/12/2023 start-time=16:38:24
add interval=1d name=77695749 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/12/2023 start-time=16:54:38
add interval=1w name=D53768 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/14/2023 start-time=15:37:02
add interval=4w2d name=D875329 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/14/2023 start-time=15:57:05
add interval=1w name=D69756 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/14/2023 start-time=16:00:45
add interval=1w name=D93857 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=11:32:23
add interval=4w2d name=D872673 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=12:53:22
add interval=1w name=D78624 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=13:10:11
add interval=1w name=D92665 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=13:26:22
add interval=4w2d name=D869384 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=13:57:39
add interval=1w name=D73264 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=14:02:33
add interval=1w name=D43434 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=14:45:47
add interval=1w name=D37756 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=14:46:42
add interval=4w2d name=D879754 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=15:09:16
add interval=4w2d name=D389527 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=15:32:56
add interval=1w name=D42279 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=16:54:21
add interval=1w name=D36677 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=17:40:54
add interval=4w2d name=D265784 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=18:03:22
add interval=1d name=22589935 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/15/2023 start-time=18:08:36
add interval=1w name=D26382 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/16/2023 start-time=09:13:34
add interval=1w name=2295589 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/16/2023 start-time=12:48:41
add interval=1w name=D85827 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/16/2023 start-time=14:20:50
add interval=4w2d name=D289479 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/16/2023 start-time=16:10:55
add interval=1w name=D53863 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/16/2023 start-time=16:41:07
add interval=4w2d name=D423447 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=17:38:48
add interval=1w name=D49882 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=17:39:45
add interval=1d name=48933527 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=17:42:20
add interval=4w2d name=mohamed policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/17/2023 start-time=11:56:00
add interval=1w name=D52995 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/17/2023 start-time=11:59:33
add interval=1d name=82685 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/17/2023 start-time=13:31:43
add interval=1w name=D58886 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/17/2023 start-time=13:36:07
add interval=1w name=D63268 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/17/2023 start-time=13:38:39
add interval=4w2d name=D952594 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/17/2023 start-time=15:32:45
add interval=1w name=D46533 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/18/2023 start-time=13:51:47
add interval=1w name=D88367 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/18/2023 start-time=13:58:18
add interval=4w2d name=D286743 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/18/2023 start-time=14:29:28
add interval=1w name=D93639 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/18/2023 start-time=15:40:25
add interval=1d name=78464639 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/18/2023 start-time=16:02:51
add interval=1w name=D56355 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/18/2023 start-time=16:10:24
add interval=1w name=D22227 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/18/2023 start-time=16:19:02
add interval=1w name=D56885 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/18/2023 start-time=17:46:24
add interval=4w2d name=D854237 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/18/2023 start-time=17:47:48
add interval=1w name=D74665 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/18/2023 start-time=17:52:43
add interval=1w name=D89746 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/19/2023 start-time=11:11:51
add interval=1w name=D89273 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/19/2023 start-time=12:47:06
add interval=1d name=54378567 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/19/2023 start-time=13:19:07
add interval=1w name=D38373 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/19/2023 start-time=14:45:19
add interval=1w name=D26543 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/19/2023 start-time=15:04:05
add interval=1d name=66565463 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/19/2023 start-time=15:53:06
add interval=1w name=D64693 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/19/2023 start-time=15:57:28
add interval=1w name=D57675 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/19/2023 start-time=16:49:42
add interval=1d name=29295986 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/19/2023 start-time=17:02:58
add interval=4w2d name=D886348 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/19/2023 start-time=17:50:09
add interval=1w name=D24339 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/19/2023 start-time=18:06:29
add interval=4w2d name=D842388 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/21/2023 start-time=12:12:17
add interval=4w2d name=D748486 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/21/2023 start-time=13:59:42
add interval=1w name=D44896 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/21/2023 start-time=15:12:06
add interval=1w name=D59326 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/21/2023 start-time=15:54:07
add interval=1w name=D24638 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/21/2023 start-time=16:40:08
add interval=4w2d name=D938345 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/21/2023 start-time=17:02:53
add interval=1w name=D36354 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/21/2023 start-time=17:06:31
add interval=4w2d name=D637753 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/21/2023 start-time=17:18:22
add interval=1w name=D52874 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/21/2023 start-time=17:21:10
add interval=4w2d name=D468353 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/21/2023 start-time=17:27:07
add interval=4w2d name=D428433 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:41:47
add interval=1d name=56896962 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:41:47
add interval=4w2d name=D723786 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:41:47
add interval=4w2d name=D836468 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:41:48
add interval=4w2d name=D764484 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:43:21
add interval=4w2d name=D752223 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:43:21
add interval=4w2d name=D665263 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:43:21
add interval=1w name=D59744 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:43:21
add interval=1w name=D74885 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:44:59
add interval=1w name=G43688 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:46:42
add interval=4w2d name=D465387 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:46:42
add interval=1w name=D87284 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:48:24
add interval=4w2d name=D657736 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:48:24
add interval=1w name=G96878 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:48:24
add interval=1w name=D32238 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:48:24
add interval=4w2d name=D564364 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:55:00
add interval=1w name=G94383 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=11:56:07
add interval=4w2d name=D887942 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/09/2023 start-time=12:00:22
add interval=4w2d name=D958925 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/16/2023 start-time=12:37:07
add interval=1w name=7456755 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/18/2023 start-time=16:23:06
add interval=4w2d name=D467995 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/18/2023 start-time=16:23:06
add interval=1w name=944383 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/18/2023 start-time=16:23:06
add interval=1w name=6495463 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/18/2023 start-time=16:25:41
add interval=1d name=47253374 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/18/2023 start-time=16:28:36
add interval=4w2d name=D962725 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/18/2023 start-time=16:39:52
add interval=1w name=4875278 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/18/2023 start-time=16:44:45
add interval=4w2d name=0575361746 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/18/2023 start-time=16:59:51
add interval=1w name=436294 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=nov/18/2023 start-time=17:04:40
add interval=4w2d name=ffht344 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/16/2024 start-time=10:52:37
add interval=4w2d name=ymtc857 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=feb/16/2024 start-time=10:52:37
add interval=1w name=upty868 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2024 start-time=16:15:23
add interval=4w2d name=SA9DFERE policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2024 start-time=16:15:23
add interval=4w2d name=000 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2024 start-time=16:15:23
add interval=1w name=4957897 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2024 start-time=16:22:59
add interval=4w2d name=sidibe policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/20/2024 start-time=16:22:59
add interval=4w2d name=BZ6WTW7W policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2024 start-time=13:43:38
add interval=1w name=jnmp325 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2024 start-time=13:46:00
add interval=4w2d name=89A3WHE2 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/24/2024 start-time=13:47:36
add interval=1w name=entd439 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2024 start-time=07:47:56
add interval=1d name=wdj25 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2024 start-time=08:52:54
add interval=1w name=dgjm895 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/26/2024 start-time=08:59:55
add interval=1w name=jyvz938 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2024 start-time=10:17:57
add interval=4w2d name=BD33Z556 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2024 start-time=10:22:45
add interval=4w2d name=bgzd8294 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2024 start-time=10:22:45
add interval=1w name=uhsy795 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2024 start-time=10:28:06
add interval=1w name=tvyx399 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2024 start-time=10:28:06
add interval=1w name=rtzd663 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2024 start-time=10:28:06
add interval=4w2d name=GRT2AVCH policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2024 start-time=10:28:06
add interval=4w2d name=Kezzy policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2024 start-time=10:28:06
add interval=1w name=yezv992 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2024 start-time=10:40:34
add interval=1w name=ngpg788 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/27/2024 start-time=10:42:50
add interval=4w2d name=Navisnavis30 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2024 start-time=15:15:29
add interval=1w name=vnwr596 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2024 start-time=15:32:23
add interval=4w2d name=G96662252 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2024 start-time=15:35:00
add interval=4w2d name=hvgs9556 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2024 start-time=15:35:00
add interval=4w2d name=akon4 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/01/2024 start-time=15:35:00
add interval=1d name=A52374 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/20/2024 start-time=10:15:35
add interval=1w name=A9822569 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/26/2024 start-time=11:02:41
add interval=1w name=bxha985 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=oct/25/2024 start-time=14:25:52
add interval=4w2d name=97342925 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=oct/31/2024 start-time=16:14:41
add interval=4w2d name=isuf policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/03/2024 start-time=15:05:08
add interval=1w name=6323549 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/03/2024 start-time=15:19:59
add interval=4w2d name=CRLH8653 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=dec/03/2024 start-time=15:19:59
add interval=4w2d name=TLUV8563 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jan/10/2025 start-time=11:13:58
add interval=1w name=zmpu554 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=apr/22/2025 start-time=09:46:10
add interval=1w name=RAE959 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/06/2025 start-time=10:12:25
add interval=4w2d name=czkn9647 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/08/2025 start-time=12:44:03
add interval=1w name=WEM528 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=may/20/2025 start-time=09:26:25
add comment="Monitor Profile 3-MOIS" interval=2m47s name=3-MOIS on-event=":loc\
    al dateint do={:local montharray ( \"jan\",\"feb\",\"mar\",\"apr\",\"may\"\
    ,\"jun\",\"jul\",\"aug\",\"sep\",\"oct\",\"nov\",\"dec\" );:local days [ :\
    pick \$d 4 6 ];:local month [ :pick \$d 0 3 ];:local year [ :pick \$d 7 11\
    \_];:local monthint ([ :find \$montharray \$month]);:local month (\$monthi\
    nt + 1);:if ( [len \$month] = 1) do={:local zero (\"0\");:return [:tonum (\
    \"\$year\$zero\$month\$days\")];} else={:return [:tonum (\"\$year\$month\$\
    days\")];}}; :local timeint do={ :local hours [ :pick \$t 0 2 ]; :local mi\
    nutes [ :pick \$t 3 5 ]; :return (\$hours * 60 + \$minutes) ; }; :local da\
    te [ /system clock get date ]; :local time [ /system clock get time ]; :lo\
    cal today [\$dateint d=\$date] ; :local curtime [\$timeint t=\$time] ; :fo\
    reach i in [ /ip hotspot user find where profile=\"3-MOIS\" ] do={ :local \
    comment [ /ip hotspot user get \$i comment]; :local name [ /ip hotspot use\
    r get \$i name]; :local gettime [:pic \$comment 12 20]; :if ([:pic \$comme\
    nt 3] = \"/\" and [:pic \$comment 6] = \"/\") do={:local expd [\$dateint d\
    =\$comment] ; :local expt [\$timeint t=\$gettime] ; :if ((\$expd < \$today\
    \_and \$expt < \$curtime) or (\$expd < \$today and \$expt > \$curtime) or \
    (\$expd = \$today and \$expt < \$curtime)) do={ [ /ip hotspot user remove \
    \$i ]; [ /ip hotspot active remove [find where user=\$name] ];}}}" \
    policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2025 start-time=04:28:58
add comment="Monitor Profile 2mois" interval=2m14s name=2mois on-event=":local\
    \_dateint do={:local montharray ( \"jan\",\"feb\",\"mar\",\"apr\",\"may\",\
    \"jun\",\"jul\",\"aug\",\"sep\",\"oct\",\"nov\",\"dec\" );:local days [ :p\
    ick \$d 4 6 ];:local month [ :pick \$d 0 3 ];:local year [ :pick \$d 7 11 \
    ];:local monthint ([ :find \$montharray \$month]);:local month (\$monthint\
    \_+ 1);:if ( [len \$month] = 1) do={:local zero (\"0\");:return [:tonum (\
    \"\$year\$zero\$month\$days\")];} else={:return [:tonum (\"\$year\$month\$\
    days\")];}}; :local timeint do={ :local hours [ :pick \$t 0 2 ]; :local mi\
    nutes [ :pick \$t 3 5 ]; :return (\$hours * 60 + \$minutes) ; }; :local da\
    te [ /system clock get date ]; :local time [ /system clock get time ]; :lo\
    cal today [\$dateint d=\$date] ; :local curtime [\$timeint t=\$time] ; :fo\
    reach i in [ /ip hotspot user find where profile=\"2mois\" ] do={ :local c\
    omment [ /ip hotspot user get \$i comment]; :local name [ /ip hotspot user\
    \_get \$i name]; :local gettime [:pic \$comment 12 20]; :if ([:pic \$comme\
    nt 3] = \"/\" and [:pic \$comment 6] = \"/\") do={:local expd [\$dateint d\
    =\$comment] ; :local expt [\$timeint t=\$gettime] ; :if ((\$expd < \$today\
    \_and \$expt < \$curtime) or (\$expd < \$today and \$expt > \$curtime) or \
    (\$expd = \$today and \$expt < \$curtime)) do={ [ /ip hotspot user remove \
    \$i ]; [ /ip hotspot active remove [find where user=\$name] ];}}}" \
    policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jul/05/2025 start-time=01:15:23
add interval=1w name=edfz532 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=oct/31/2025 start-time=09:33:26
add interval=4w2d name=x58ie8ye policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=mar/14/2026 start-time=10:29:38
add interval=1w name=wrg364 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=apr/08/2026 start-time=13:14:33
add interval=4w2d name=k45ag7hn policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=apr/27/2026 start-time=11:05:10
add interval=4w2d name=86252363 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=jun/16/2026 start-time=12:40:21
add interval=4w2d name=69962535 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/29/2026 start-time=08:05:29
add interval=1w name=ufvi757 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/29/2026 start-time=08:09:42
add interval=4w2d name=77740 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/29/2026 start-time=08:09:42
add interval=1w name=durc366 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/29/2026 start-time=08:13:30
add interval=1w name=shai792 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/29/2026 start-time=08:17:09
add interval=4w2d name=nafisa policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/29/2026 start-time=08:23:58
add interval=1w name=zpdp776 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/29/2026 start-time=08:27:18
add interval=1d name=A7849 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-date=aug/29/2026 start-time=15:29:00
/system script
add dont-require-permissions=no name=clear_userman_logs owner=admin policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive source=":log er\
    ror \"Clearing Data Base Logs ...  It may take some time & CPU if Logs are\
    \_huge in size.......\"\r\
    \n/tool user-manager database clear-log\r\
    \n:log warning \"Data Base Cleared ... Now Rebuilding Data Base , It may t\
    ake some time & CPU if Logs are huge in size.......\"\r\
    \n/tool user-manager database rebuild\r\
    \n:log warning \"Data Base Rebuild Complete....\""
add dont-require-permissions=no name=DDNS owner=admin policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive source=\
    "/ip cloud force-update"
add dont-require-permissions=no name=reboot owner=admin policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=\
    "/system reboot"
add comment=mikhmon dont-require-permissions=no name="jul/23/2025-|-12:29:02-|\
    -Mfrancis-|-3000-|-10.10.11.253-|-FA:33:C8:7A:A3:1C-|-60d-|-2mois-|-" \
    owner=jul2025 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=\
    jul/23/2025
add comment=mikhmon dont-require-permissions=no name="sep/15/2025-|-12:18:48-|\
    -Francis-|-3000-|-10.10.11.112-|-96:38:5C:CE:9A:44-|-60d-|-2mois-|-" \
    owner=sep2025 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=\
    sep/15/2025
add comment=mikhmon dont-require-permissions=no name="sep/27/2025-|-12:04:57-|\
    -Mfrancis-|-3000-|-10.10.11.216-|-FA:33:C8:7A:A3:1C-|-60d-|-2mois-|-" \
    owner=sep2025 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=\
    sep/27/2025
add comment=mikhmon dont-require-permissions=no name="oct/07/2025-|-15:30:56-|\
    -felix-|-7000-|-10.10.10.163-|-FC:42:03:7D:6E:51-|-90d-|-3-MOIS-|-" \
    owner=oct2025 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=\
    oct/07/2025
add comment=mikhmon dont-require-permissions=no name="nov/15/2025-|-14:57:13-|\
    -Francis-|-3000-|-10.10.10.73-|-96:38:5C:CE:9A:44-|-60d-|-2mois-|-" \
    owner=nov2025 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=\
    nov/15/2025
add comment=mikhmon dont-require-permissions=no name="nov/29/2025-|-11:30:24-|\
    -Mfrancis-|-3000-|-10.10.11.46-|-FA:33:C8:7A:A3:1C-|-60d-|-2mois-|-" \
    owner=nov2025 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=\
    nov/29/2025
add comment=mikhmon dont-require-permissions=no name="jan/15/2026-|-11:31:55-|\
    -Francis-|-3000-|-10.10.11.79-|-96:38:5C:CE:9A:44-|-60d-|-2mois-|-" \
    owner=jan2026 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=\
    jan/15/2026
add comment=mikhmon dont-require-permissions=no name="jan/29/2026-|-11:33:35-|\
    -Mfrancis-|-3000-|-10.10.10.190-|-FA:33:C8:7A:A3:1C-|-60d-|-2mois-|-" \
    owner=jan2026 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=\
    jan/29/2026
add comment=mikhmon dont-require-permissions=no name="mar/16/2026-|-14:13:15-|\
    -Francis-|-3000-|-10.10.10.205-|-62:6F:E8:17:60:D2-|-60d-|-2mois-|-" \
    owner=mar2026 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=\
    mar/16/2026
add comment=mikhmon dont-require-permissions=no name="may/18/2026-|-14:25:23-|\
    -Francis-|-3000-|-10.10.10.129-|-62:6F:E8:17:60:D2-|-60d-|-2mois-|-" \
    owner=may2026 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=\
    may/18/2026
add comment=mikhmon dont-require-permissions=no name="jul/18/2026-|-16:26:04-|\
    -Francis-|-3000-|-10.10.10.208-|-62:6F:E8:17:60:D2-|-60d-|-2mois-|-" \
    owner=jul2026 policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=\
    jul/18/2026
/tool romon
set enabled=yes
/tool user-manager database
set db-path=user-manager
/tool user-manager profile profile-limitation
add from-time=0s limitation="30 MIN" profile="30 MIN" till-time=23h59m59s \
    weekdays=sunday,monday,tuesday,wednesday,thursday,friday,saturday
add from-time=0s limitation="45 MIN" profile="45 MIN" till-time=23h59m59s \
    weekdays=sunday,monday,tuesday,wednesday,thursday,friday,saturday
add from-time=0s limitation=1H profile=1H till-time=23h59m59s weekdays=\
    sunday,monday,tuesday,wednesday,thursday,friday,saturday
add from-time=0s limitation=2H profile=2H till-time=23h59m59s weekdays=\
    sunday,monday,tuesday,wednesday,thursday,friday,saturday
add from-time=0s limitation=3H profile=3H till-time=23h59m59s weekdays=\
    sunday,monday,tuesday,wednesday,thursday,friday,saturday
add from-time=0s limitation=5H profile=5H till-time=23h59m59s weekdays=\
    sunday,monday,tuesday,wednesday,thursday,friday,saturday
add from-time=0s limitation=10H profile=10H till-time=23h59m59s weekdays=\
    sunday,monday,tuesday,wednesday,thursday,friday,saturday
add from-time=0s limitation="1 JOUR" profile="1 JOUR" till-time=23h59m59s \
    weekdays=sunday,monday,tuesday,wednesday,thursday,friday,saturday
add from-time=0s limitation="3 JOURS" profile="3 JOURS" till-time=23h59m59s \
    weekdays=sunday,monday,tuesday,wednesday,thursday,friday,saturday
add from-time=0s limitation="7 JOURS" profile="1 SEMAINE" till-time=23h59m59s \
    weekdays=sunday,monday,tuesday,wednesday,thursday,friday,saturday
add from-time=0s limitation="1 MOIS" profile="1 MOIS" till-time=23h59m59s \
    weekdays=sunday,monday,tuesday,wednesday,thursday,friday,saturday
/tool user-manager router
add coa-port=1700 customer=admin disabled=no ip-address=127.0.0.1 log=\
    auth-fail name=Mikrotik shared-secret=1234 use-coa=no
