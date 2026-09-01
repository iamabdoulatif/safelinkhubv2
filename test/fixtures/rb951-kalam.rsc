# 2026-09-01 12:52:18 by RouterOS 7.24.1
# software id = AAKM-B0IM
#
# model = RB951Ui-2HnD
# serial number = HD3086WEFC0
/interface bridge
add name=DOCKERS
add name=SAFELINKHUB-BRIDGE
/interface ethernet
set [ find default-name=ether1 ] name=E1-WAN-FAI
/interface wireless
set [ find default-name=wlan1 ] band=2ghz-b/g/n channel-width=20/40mhz-XX \
    country=no_country_set disabled=no frequency=auto frequency-mode=\
    manual-txpower mode=ap-bridge ssid="KALAM WIFI" wps-mode=disabled
/interface wireguard
add listen-port=51821 mtu=1420 name=safelinkhub-wg0
/interface list
add name=WAN
add name=LAN
/interface wireless security-profiles
set [ find default=yes ] supplicant-identity=MikroTik
/ip hotspot profile
add dns-name=kalam-wifi.net hotspot-address=10.10.10.1 \
    html-directory-override=hotspot http-cookie-lifetime=52w1d \
    install-hotspot-queue=yes login-by=cookie,http-chap,http-pap,mac-cookie \
    name=KALAM-WIFI
/ip hotspot user profile
set [ find default=yes ] mac-cookie-timeout=52w1d
/ip pool
add name=POOL-HOTSPOT ranges=10.10.8.1-10.10.11.254
/ip dhcp-server
add address-pool=POOL-HOTSPOT interface=SAFELINKHUB-BRIDGE name=dhcp1
/ip hotspot user profile
add address-pool=POOL-HOTSPOT mac-cookie-timeout=52w1d name=05-HEURES \
    on-login=":put (\",remc,100,5h,100,,Enable,\"); {:local datamitha;:local d\
    ate [ /system clock get date ];:if ([:pick \$date 4 5] = \"-\") do={:local\
    \_arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"\
    05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\
    \"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pick \$date 8 1\
    0];:local bulan [:pick \$date 5 7];:local tahun [:pick \$date 0 4];:local \
    bln (\$arraybln->\$bulan);:set \$date (\$bln.\"/\".\$tgl.\"/\".\$tahun);};\
    :local year [ :pick \$date 7 11 ];:local month [ :pick \$date 0 3 ];:local\
    \_comment [ /ip hotspot user get [/ip hotspot user find where name=\"\$use\
    r\"] comment]; :local ucode [:pic \$comment 0 2]; :if (\$ucode = \"vc\" or\
    \_\$ucode = \"up\" or \$comment = \"\") do={ /sys sch add name=\"\$user\" \
    disable=no start-date=\$date interval=\"5h\"; :delay 5s; :local exp [ /sys\
    \_sch get [ /sys sch find where name=\"\$user\" ] next-run];:if ([:pick \$\
    exp 10 11] = \" \") do={:local arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"0\
    3\"=\"mar\";\"04\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"\
    08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};\
    :local tgl [:pick \$exp 8 10];:local bulan [:pick \$exp 5 7];:local tahun \
    [:pick \$exp 0 4];:local bln (\$arraybln->\$bulan);:local jam [:pick \$exp\
    \_11 19];:set \$exp (\$bln.\"/\".\$tgl.\"/\".\$tahun.\" \".\$jam);} else={\
    :if ([:pick \$exp 2 3] = \"-\") do={:local arraybln {\"01\"=\"jan\";\"02\"\
    =\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\
    \"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"1\
    2\"=\"dec\"};:local tgl [:pick \$exp 3 5];:local bulan [:pick \$exp 0 2];:\
    local bln (\$arraybln->\$bulan);:local jam [:pick \$exp 6 14];:set \$exp (\
    \$bln.\"/\".\$tgl.\" \".\$jam);};:if ([:pick \$exp 4 5] = \"-\") do={:loca\
    l arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"\
    05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\
    \"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pick \$exp 8 10\
    ];:local bulan [:pick \$exp 5 7];:local tahun [:pick \$exp 0 4];:local bln\
    \_(\$arraybln->\$bulan);:local jam [:pick \$exp 6 14];:set \$exp (\$bln.\"\
    /\".\$tgl.\"/\".\$tahun.\" \".\$jam);};};:local getxp [len \$exp]; :if (\$\
    getxp = 15) do={ :local d [:pic \$exp 0 6]; :local t [:pic \$exp 7 16]; :l\
    ocal s (\"/\"); :local exp (\"\$d\$s\$year \$t\"); /ip hotspot user set co\
    mment=\$exp [find where name=\"\$user\"];:set datamitha (\"\$d\$s\$year \$\
    t\");}; :if (\$getxp = 8) do={ /ip hotspot user set comment=\"\$date \$exp\
    \" [find where name=\"\$user\"];:set datamitha \"\$date \$exp\";}; :if (\$\
    getxp > 15) do={ /ip hotspot user set comment=\$exp [find where name=\"\$u\
    ser\"];:set datamitha \"\$exp\";};:local waktu [/system clock get time ];:\
    local macmitha \$\"mac-address\";:local profilemitha [ /ip hotspot user ge\
    t [/ip hotspot user find where name=\"\$user\"] profile];/sys sch remove [\
    find where name=\"\$user\"]; :local mac \$\"mac-address\"; :local time [/s\
    ystem clock get time ]; /system script add name=\"\$date-|-\$time-|-\$user\
    -|-100-|-\$address-|-\$mac-|-5h-|-05-HEURES-|-\$comment\" owner=\"\$month\
    \$year\" source=\$date comment=mikhmon}}\
    \n" parent-queue=none
add address-pool=POOL-HOTSPOT mac-cookie-timeout=52w1d name=01-JOUR on-login="\
    :put (\",remc,300,1d,300,,Enable,\"); {:local datamitha;:local date [ /sys\
    tem clock get date ];:if ([:pick \$date 4 5] = \"-\") do={:local arraybln \
    {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"05\"=\"may\
    \";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"oc\
    t\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pick \$date 8 10];:local b\
    ulan [:pick \$date 5 7];:local tahun [:pick \$date 0 4];:local bln (\$arra\
    ybln->\$bulan);:set \$date (\$bln.\"/\".\$tgl.\"/\".\$tahun);};:local year\
    \_[ :pick \$date 7 11 ];:local month [ :pick \$date 0 3 ];:local comment [\
    \_/ip hotspot user get [/ip hotspot user find where name=\"\$user\"] comme\
    nt]; :local ucode [:pic \$comment 0 2]; :if (\$ucode = \"vc\" or \$ucode =\
    \_\"up\" or \$comment = \"\") do={ /sys sch add name=\"\$user\" disable=no\
    \_start-date=\$date interval=\"1d\"; :delay 5s; :local exp [ /sys sch get \
    [ /sys sch find where name=\"\$user\" ] next-run];:if ([:pick \$exp 10 11]\
    \_= \" \") do={:local arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\
    \";\"04\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"au\
    g\";\"09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tg\
    l [:pick \$exp 8 10];:local bulan [:pick \$exp 5 7];:local tahun [:pick \$\
    exp 0 4];:local bln (\$arraybln->\$bulan);:local jam [:pick \$exp 11 19];:\
    set \$exp (\$bln.\"/\".\$tgl.\"/\".\$tahun.\" \".\$jam);} else={:if ([:pic\
    k \$exp 2 3] = \"-\") do={:local arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\
    \"03\"=\"mar\";\"04\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\"\
    ;\"08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\
    \"};:local tgl [:pick \$exp 3 5];:local bulan [:pick \$exp 0 2];:local bln\
    \_(\$arraybln->\$bulan);:local jam [:pick \$exp 6 14];:set \$exp (\$bln.\"\
    /\".\$tgl.\" \".\$jam);};:if ([:pick \$exp 4 5] = \"-\") do={:local arrayb\
    ln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"05\"=\"m\
    ay\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"\
    oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pick \$exp 8 10];:local \
    bulan [:pick \$exp 5 7];:local tahun [:pick \$exp 0 4];:local bln (\$array\
    bln->\$bulan);:local jam [:pick \$exp 6 14];:set \$exp (\$bln.\"/\".\$tgl.\
    \"/\".\$tahun.\" \".\$jam);};};:local getxp [len \$exp]; :if (\$getxp = 15\
    ) do={ :local d [:pic \$exp 0 6]; :local t [:pic \$exp 7 16]; :local s (\"\
    /\"); :local exp (\"\$d\$s\$year \$t\"); /ip hotspot user set comment=\$ex\
    p [find where name=\"\$user\"];:set datamitha (\"\$d\$s\$year \$t\");}; :i\
    f (\$getxp = 8) do={ /ip hotspot user set comment=\"\$date \$exp\" [find w\
    here name=\"\$user\"];:set datamitha \"\$date \$exp\";}; :if (\$getxp > 15\
    ) do={ /ip hotspot user set comment=\$exp [find where name=\"\$user\"];:se\
    t datamitha \"\$exp\";};:local waktu [/system clock get time ];:local macm\
    itha \$\"mac-address\";:local profilemitha [ /ip hotspot user get [/ip hot\
    spot user find where name=\"\$user\"] profile];/sys sch remove [find where\
    \_name=\"\$user\"]; :local mac \$\"mac-address\"; :local time [/system clo\
    ck get time ]; /system script add name=\"\$date-|-\$time-|-\$user-|-300-|-\
    \$address-|-\$mac-|-1d-|-01-JOUR-|-\$comment\" owner=\"\$month\$year\" sou\
    rce=\$date comment=mikhmon}}\
    \n" parent-queue=none
add address-pool=POOL-HOTSPOT mac-cookie-timeout=52w1d name=04-JOURS \
    on-login=":put (\",remc,500,4d,500,,Enable,\"); {:local datamitha;:local d\
    ate [ /system clock get date ];:if ([:pick \$date 4 5] = \"-\") do={:local\
    \_arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"\
    05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\
    \"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pick \$date 8 1\
    0];:local bulan [:pick \$date 5 7];:local tahun [:pick \$date 0 4];:local \
    bln (\$arraybln->\$bulan);:set \$date (\$bln.\"/\".\$tgl.\"/\".\$tahun);};\
    :local year [ :pick \$date 7 11 ];:local month [ :pick \$date 0 3 ];:local\
    \_comment [ /ip hotspot user get [/ip hotspot user find where name=\"\$use\
    r\"] comment]; :local ucode [:pic \$comment 0 2]; :if (\$ucode = \"vc\" or\
    \_\$ucode = \"up\" or \$comment = \"\") do={ /sys sch add name=\"\$user\" \
    disable=no start-date=\$date interval=\"4d\"; :delay 5s; :local exp [ /sys\
    \_sch get [ /sys sch find where name=\"\$user\" ] next-run];:if ([:pick \$\
    exp 10 11] = \" \") do={:local arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"0\
    3\"=\"mar\";\"04\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"\
    08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};\
    :local tgl [:pick \$exp 8 10];:local bulan [:pick \$exp 5 7];:local tahun \
    [:pick \$exp 0 4];:local bln (\$arraybln->\$bulan);:local jam [:pick \$exp\
    \_11 19];:set \$exp (\$bln.\"/\".\$tgl.\"/\".\$tahun.\" \".\$jam);} else={\
    :if ([:pick \$exp 2 3] = \"-\") do={:local arraybln {\"01\"=\"jan\";\"02\"\
    =\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\
    \"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"1\
    2\"=\"dec\"};:local tgl [:pick \$exp 3 5];:local bulan [:pick \$exp 0 2];:\
    local bln (\$arraybln->\$bulan);:local jam [:pick \$exp 6 14];:set \$exp (\
    \$bln.\"/\".\$tgl.\" \".\$jam);};:if ([:pick \$exp 4 5] = \"-\") do={:loca\
    l arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"\
    05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\
    \"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pick \$exp 8 10\
    ];:local bulan [:pick \$exp 5 7];:local tahun [:pick \$exp 0 4];:local bln\
    \_(\$arraybln->\$bulan);:local jam [:pick \$exp 6 14];:set \$exp (\$bln.\"\
    /\".\$tgl.\"/\".\$tahun.\" \".\$jam);};};:local getxp [len \$exp]; :if (\$\
    getxp = 15) do={ :local d [:pic \$exp 0 6]; :local t [:pic \$exp 7 16]; :l\
    ocal s (\"/\"); :local exp (\"\$d\$s\$year \$t\"); /ip hotspot user set co\
    mment=\$exp [find where name=\"\$user\"];:set datamitha (\"\$d\$s\$year \$\
    t\");}; :if (\$getxp = 8) do={ /ip hotspot user set comment=\"\$date \$exp\
    \" [find where name=\"\$user\"];:set datamitha \"\$date \$exp\";}; :if (\$\
    getxp > 15) do={ /ip hotspot user set comment=\$exp [find where name=\"\$u\
    ser\"];:set datamitha \"\$exp\";};:local waktu [/system clock get time ];:\
    local macmitha \$\"mac-address\";:local profilemitha [ /ip hotspot user ge\
    t [/ip hotspot user find where name=\"\$user\"] profile];/sys sch remove [\
    find where name=\"\$user\"]; :local mac \$\"mac-address\"; :local time [/s\
    ystem clock get time ]; /system script add name=\"\$date-|-\$time-|-\$user\
    -|-500-|-\$address-|-\$mac-|-4d-|-04-JOURS-|-\$comment\" owner=\"\$month\$\
    year\" source=\$date comment=mikhmon}}\
    \n" parent-queue=none
add address-pool=POOL-HOTSPOT mac-cookie-timeout=52w1d name=01-SEMAINE \
    on-login=":put (\",remc,800,7d,800,,Enable,\"); {:local datamitha;:local d\
    ate [ /system clock get date ];:if ([:pick \$date 4 5] = \"-\") do={:local\
    \_arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"\
    05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\
    \"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pick \$date 8 1\
    0];:local bulan [:pick \$date 5 7];:local tahun [:pick \$date 0 4];:local \
    bln (\$arraybln->\$bulan);:set \$date (\$bln.\"/\".\$tgl.\"/\".\$tahun);};\
    :local year [ :pick \$date 7 11 ];:local month [ :pick \$date 0 3 ];:local\
    \_comment [ /ip hotspot user get [/ip hotspot user find where name=\"\$use\
    r\"] comment]; :local ucode [:pic \$comment 0 2]; :if (\$ucode = \"vc\" or\
    \_\$ucode = \"up\" or \$comment = \"\") do={ /sys sch add name=\"\$user\" \
    disable=no start-date=\$date interval=\"7d\"; :delay 5s; :local exp [ /sys\
    \_sch get [ /sys sch find where name=\"\$user\" ] next-run];:if ([:pick \$\
    exp 10 11] = \" \") do={:local arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"0\
    3\"=\"mar\";\"04\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"\
    08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};\
    :local tgl [:pick \$exp 8 10];:local bulan [:pick \$exp 5 7];:local tahun \
    [:pick \$exp 0 4];:local bln (\$arraybln->\$bulan);:local jam [:pick \$exp\
    \_11 19];:set \$exp (\$bln.\"/\".\$tgl.\"/\".\$tahun.\" \".\$jam);} else={\
    :if ([:pick \$exp 2 3] = \"-\") do={:local arraybln {\"01\"=\"jan\";\"02\"\
    =\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\
    \"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"1\
    2\"=\"dec\"};:local tgl [:pick \$exp 3 5];:local bulan [:pick \$exp 0 2];:\
    local bln (\$arraybln->\$bulan);:local jam [:pick \$exp 6 14];:set \$exp (\
    \$bln.\"/\".\$tgl.\" \".\$jam);};:if ([:pick \$exp 4 5] = \"-\") do={:loca\
    l arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"\
    05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\
    \"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pick \$exp 8 10\
    ];:local bulan [:pick \$exp 5 7];:local tahun [:pick \$exp 0 4];:local bln\
    \_(\$arraybln->\$bulan);:local jam [:pick \$exp 6 14];:set \$exp (\$bln.\"\
    /\".\$tgl.\"/\".\$tahun.\" \".\$jam);};};:local getxp [len \$exp]; :if (\$\
    getxp = 15) do={ :local d [:pic \$exp 0 6]; :local t [:pic \$exp 7 16]; :l\
    ocal s (\"/\"); :local exp (\"\$d\$s\$year \$t\"); /ip hotspot user set co\
    mment=\$exp [find where name=\"\$user\"];:set datamitha (\"\$d\$s\$year \$\
    t\");}; :if (\$getxp = 8) do={ /ip hotspot user set comment=\"\$date \$exp\
    \" [find where name=\"\$user\"];:set datamitha \"\$date \$exp\";}; :if (\$\
    getxp > 15) do={ /ip hotspot user set comment=\$exp [find where name=\"\$u\
    ser\"];:set datamitha \"\$exp\";};:local waktu [/system clock get time ];:\
    local macmitha \$\"mac-address\";:local profilemitha [ /ip hotspot user ge\
    t [/ip hotspot user find where name=\"\$user\"] profile];/sys sch remove [\
    find where name=\"\$user\"]; :local mac \$\"mac-address\"; :local time [/s\
    ystem clock get time ]; /system script add name=\"\$date-|-\$time-|-\$user\
    -|-800-|-\$address-|-\$mac-|-7d-|-01-SEMAINE-|-\$comment\" owner=\"\$month\
    \$year\" source=\$date comment=mikhmon}}\
    \n" parent-queue=none
add address-pool=POOL-HOTSPOT mac-cookie-timeout=52w1d name=01-MOIS on-login="\
    :put (\",remc,3000,30d,3000,,Enable,\"); {:local datamitha;:local date [ /\
    system clock get date ];:if ([:pick \$date 4 5] = \"-\") do={:local arrayb\
    ln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"05\"=\"m\
    ay\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"\
    oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pick \$date 8 10];:local\
    \_bulan [:pick \$date 5 7];:local tahun [:pick \$date 0 4];:local bln (\$a\
    rraybln->\$bulan);:set \$date (\$bln.\"/\".\$tgl.\"/\".\$tahun);};:local y\
    ear [ :pick \$date 7 11 ];:local month [ :pick \$date 0 3 ];:local comment\
    \_[ /ip hotspot user get [/ip hotspot user find where name=\"\$user\"] com\
    ment]; :local ucode [:pic \$comment 0 2]; :if (\$ucode = \"vc\" or \$ucode\
    \_= \"up\" or \$comment = \"\") do={ /sys sch add name=\"\$user\" disable=\
    no start-date=\$date interval=\"30d\"; :delay 5s; :local exp [ /sys sch ge\
    t [ /sys sch find where name=\"\$user\" ] next-run];:if ([:pick \$exp 10 1\
    1] = \" \") do={:local arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"ma\
    r\";\"04\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"a\
    ug\";\"09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local t\
    gl [:pick \$exp 8 10];:local bulan [:pick \$exp 5 7];:local tahun [:pick \
    \$exp 0 4];:local bln (\$arraybln->\$bulan);:local jam [:pick \$exp 11 19]\
    ;:set \$exp (\$bln.\"/\".\$tgl.\"/\".\$tahun.\" \".\$jam);} else={:if ([:p\
    ick \$exp 2 3] = \"-\") do={:local arraybln {\"01\"=\"jan\";\"02\"=\"feb\"\
    ;\"03\"=\"mar\";\"04\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\
    \";\"08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"de\
    c\"};:local tgl [:pick \$exp 3 5];:local bulan [:pick \$exp 0 2];:local bl\
    n (\$arraybln->\$bulan);:local jam [:pick \$exp 6 14];:set \$exp (\$bln.\"\
    /\".\$tgl.\" \".\$jam);};:if ([:pick \$exp 4 5] = \"-\") do={:local arrayb\
    ln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"05\"=\"m\
    ay\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"\
    oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pick \$exp 8 10];:local \
    bulan [:pick \$exp 5 7];:local tahun [:pick \$exp 0 4];:local bln (\$array\
    bln->\$bulan);:local jam [:pick \$exp 6 14];:set \$exp (\$bln.\"/\".\$tgl.\
    \"/\".\$tahun.\" \".\$jam);};};:local getxp [len \$exp]; :if (\$getxp = 15\
    ) do={ :local d [:pic \$exp 0 6]; :local t [:pic \$exp 7 16]; :local s (\"\
    /\"); :local exp (\"\$d\$s\$year \$t\"); /ip hotspot user set comment=\$ex\
    p [find where name=\"\$user\"];:set datamitha (\"\$d\$s\$year \$t\");}; :i\
    f (\$getxp = 8) do={ /ip hotspot user set comment=\"\$date \$exp\" [find w\
    here name=\"\$user\"];:set datamitha \"\$date \$exp\";}; :if (\$getxp > 15\
    ) do={ /ip hotspot user set comment=\$exp [find where name=\"\$user\"];:se\
    t datamitha \"\$exp\";};:local waktu [/system clock get time ];:local macm\
    itha \$\"mac-address\";:local profilemitha [ /ip hotspot user get [/ip hot\
    spot user find where name=\"\$user\"] profile];/sys sch remove [find where\
    \_name=\"\$user\"]; :local mac \$\"mac-address\"; :local time [/system clo\
    ck get time ]; /system script add name=\"\$date-|-\$time-|-\$user-|-3000-|\
    -\$address-|-\$mac-|-30d-|-01-MOIS-|-\$comment\" owner=\"\$month\$year\" s\
    ource=\$date comment=mikhmon}}\
    \n" parent-queue=none
/system script
add dont-require-permissions=no name=export-all owner=safelinkhub-api policy=\
    ftp,read,write,policy,test,sensitive source=""
add comment=mikhmon dont-require-permissions=no name="sep/01/2026-|-12:43:08-|\
    -5h972798-|-100-|-10.10.11.251-|-2E:6E:8E:25:A8:2E-|-5h-|-05-HEURES-|-vc-4\
    05-09.01.26" owner=*sys policy=ftp,reboot,read,write,test,romon source=\
    sep/01/2026
add comment=mikhmon dont-require-permissions=no name="sep/01/2026-|-12:43:58-|\
    -5h222932-|-100-|-10.10.11.249-|-B2:AC:7C:7D:10:7A-|-5h-|-05-HEURES-|-vc-4\
    05-09.01.26" owner=*sys policy=ftp,reboot,read,write,test,romon source=\
    sep/01/2026
/user group
add name=safelinkhub-group policy="ssh,ftp,read,write,policy,test,sensitive,ap\
    i,!local,!telnet,!reboot,!winbox,!password,!web,!sniff,!romon,!rest-api"
/interface bridge port
add bridge=SAFELINKHUB-BRIDGE interface=ether2
add bridge=SAFELINKHUB-BRIDGE interface=ether3
add bridge=SAFELINKHUB-BRIDGE interface=ether4
add bridge=SAFELINKHUB-BRIDGE interface=ether5
add bridge=SAFELINKHUB-BRIDGE interface=wlan1
/interface list member
add interface=E1-WAN-FAI list=WAN
add interface=SAFELINKHUB-BRIDGE list=LAN
/interface wireguard peers
add allowed-address=10.66.0.0/24 endpoint-address=relay.safelinkhub.io \
    endpoint-port=51820 interface=safelinkhub-wg0 name=peer1 \
    persistent-keepalive=25s public-key=\
    "LTCXBicJJZmoWXOFwAJyKKgqc0kSkFoNPTBMB8kAMAw="
/ip address
add address=10.66.0.48 interface=safelinkhub-wg0 network=10.66.0.48
add address=10.10.10.1/22 interface=SAFELINKHUB-BRIDGE network=10.10.8.0
/ip cloud
set ddns-enabled=yes
/ip dhcp-client
add interface=E1-WAN-FAI name=client1
/ip dhcp-server network
add address=10.10.8.0/22 dns-server=10.10.10.1,1.1.1.1 gateway=10.10.10.1 \
    netmask=22
/ip dns
set allow-remote-requests=yes servers=208.67.222.222,8.8.8.8
/ip firewall filter
add action=accept chain=input comment=\
    "Allow SSH/SFTP via SafeLinkHub tunnel (safelinkhub-wg0)" dst-port=22 \
    in-interface=safelinkhub-wg0 protocol=tcp
add action=passthrough chain=unused-hs-chain comment=\
    "place hotspot rules here" disabled=yes
/ip firewall mangle
add action=change-ttl chain=postrouting new-ttl=set:1 out-interface=\
    SAFELINKHUB-BRIDGE passthrough=no
/ip firewall nat
add action=passthrough chain=unused-hs-chain comment=\
    "place hotspot rules here" disabled=yes
add action=masquerade chain=srcnat out-interface=E1-WAN-FAI
add action=masquerade chain=srcnat comment="masquerade hotspot network" \
    src-address=10.10.8.0/22
/ip firewall raw
add action=accept chain=prerouting dst-port=8291 in-interface-list=WAN \
    protocol=tcp
add action=drop chain=prerouting dst-port=8728 in-interface-list=WAN \
    protocol=tcp
add action=drop chain=prerouting dst-port=22 in-interface-list=WAN protocol=\
    tcp
add action=drop chain=prerouting dst-port=21 in-interface-list=WAN protocol=\
    tcp
add action=drop chain=prerouting dst-port=23 in-interface-list=WAN protocol=\
    tcp
add action=drop chain=prerouting dst-port=80 in-interface-list=WAN protocol=\
    tcp
add action=drop chain=prerouting dst-port=443 in-interface-list=WAN protocol=\
    tcp
add action=drop chain=prerouting dst-port=8080 in-interface-list=WAN \
    protocol=tcp
add action=drop chain=prerouting dst-port=8729 in-interface-list=WAN \
    protocol=tcp
add action=drop chain=prerouting dst-port=8087 in-interface-list=WAN \
    protocol=tcp
add action=drop chain=prerouting dst-port=8089 in-interface-list=WAN \
    protocol=tcp
add action=drop chain=prerouting dst-port=53 in-interface-list=WAN protocol=\
    udp
add action=drop chain=prerouting dst-port=162 in-interface-list=WAN protocol=\
    udp
add action=drop chain=prerouting dst-port=161 in-interface-list=WAN protocol=\
    udp
/ip hotspot
add address-pool=POOL-HOTSPOT addresses-per-mac=1 disabled=no interface=\
    SAFELINKHUB-BRIDGE name=hotspot1 profile=KALAM-WIFI
/ip hotspot user
add name=admin
add comment="sep/01/2026 17:43:03" name=5h972798 profile=05-HEURES server=\
    hotspot1
add comment="sep/01/2026 17:43:53" name=5h222932 profile=05-HEURES server=\
    hotspot1
add comment=vc-405-09.01.26 name=5h747249 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h993873 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h779493 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h634357 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h237696 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h558374 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h894295 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h857245 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h968373 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h925892 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h846795 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h353334 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h525653 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h367426 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h398348 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h373967 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h359578 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h959452 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h236899 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h959942 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h755643 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h238292 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h255738 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h226338 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h277577 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h743387 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h473525 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h695344 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h259593 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h388366 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h248983 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h884552 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h393477 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h654545 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h644298 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h857926 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h883348 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h362543 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h376282 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h463974 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h327892 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h946426 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h555844 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h688748 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h967587 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h235545 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h624864 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h543227 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h869437 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h273542 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h572873 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h728585 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h425288 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h625969 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h658474 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h773595 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h245982 profile=05-HEURES server=hotspot1
add comment=vc-405-09.01.26 name=5h574459 profile=05-HEURES server=hotspot1
/ip hotspot walled-garden
add comment="place hotspot rules here" disabled=yes
add comment=safelinkhub-walled-garden dst-host=safelinkhub.io
add comment=safelinkhub-walled-garden dst-host=safelinkhub.io
add comment=safelinkhub-walled-garden dst-host=*.safelinkhub.io
add comment=safelinkhub-walled-garden dst-host=*.safelinkhub.io
add comment=safelinkhub-walled-garden dst-host=pay.genius.ci
add comment=safelinkhub-walled-garden dst-host=pay.genius.ci
add comment=safelinkhub-walled-garden dst-host=*.genius.ci
add comment=safelinkhub-walled-garden dst-host=*.genius.ci
add comment=safelinkhub-walled-garden dst-host=geniuspay.ci
add comment=safelinkhub-walled-garden dst-host=geniuspay.ci
add comment=safelinkhub-walled-garden dst-host=*.geniuspay.ci
add comment=safelinkhub-walled-garden dst-host=*.geniuspay.ci
add comment=safelinkhub-walled-garden dst-host=cdn.tailwindcss.com
add comment=safelinkhub-walled-garden dst-host=cdn.tailwindcss.com
add comment=safelinkhub-walled-garden dst-host=cdn.jsdelivr.net
add comment=safelinkhub-walled-garden dst-host=cdn.jsdelivr.net
add comment=safelinkhub-walled-garden dst-host=fonts.googleapis.com
add comment=safelinkhub-walled-garden dst-host=fonts.googleapis.com
add comment=safelinkhub-walled-garden dst-host=fonts.gstatic.com
add comment=safelinkhub-walled-garden dst-host=fonts.gstatic.com
add comment=safelinkhub-walled-garden dst-host=paystack.com
add comment=safelinkhub-walled-garden dst-host=paystack.com
add comment=safelinkhub-walled-garden dst-host=*.paystack.com
add comment=safelinkhub-walled-garden dst-host=*.paystack.com
add comment=safelinkhub-walled-garden dst-host=paystack.co
add comment=safelinkhub-walled-garden dst-host=paystack.co
add comment=safelinkhub-walled-garden dst-host=*.paystack.co
add comment=safelinkhub-walled-garden dst-host=*.paystack.co
add comment=safelinkhub-walled-garden dst-host=checkout.paystack.com
add comment=safelinkhub-walled-garden dst-host=checkout.paystack.com
add comment=safelinkhub-walled-garden dst-host=cinetpay.com
add comment=safelinkhub-walled-garden dst-host=cinetpay.com
add comment=safelinkhub-walled-garden dst-host=*.cinetpay.com
add comment=safelinkhub-walled-garden dst-host=*.cinetpay.com
add comment=safelinkhub-walled-garden dst-host=pawapay.io
add comment=safelinkhub-walled-garden dst-host=pawapay.io
add comment=safelinkhub-walled-garden dst-host=*.pawapay.io
add comment=safelinkhub-walled-garden dst-host=*.pawapay.io
add comment=safelinkhub-walled-garden dst-host=wave.com
add comment=safelinkhub-walled-garden dst-host=wave.com
add comment=safelinkhub-walled-garden dst-host=*.wave.com
add comment=safelinkhub-walled-garden dst-host=*.wave.com
add comment=safelinkhub-walled-garden dst-host=webpayment.orange-money.com
add comment=safelinkhub-walled-garden dst-host=webpayment.orange-money.com
add comment=safelinkhub-walled-garden dst-host=*.orange-money.com
add comment=safelinkhub-walled-garden dst-host=*.orange-money.com
add comment=safelinkhub-walled-garden dst-host=*.orange.ci
add comment=safelinkhub-walled-garden dst-host=*.orange.ci
add comment=safelinkhub-walled-garden dst-host=moov-africa.ci
add comment=safelinkhub-walled-garden dst-host=moov-africa.ci
add comment=safelinkhub-walled-garden dst-host=*.moov-africa.ci
add comment=safelinkhub-walled-garden dst-host=*.moov-africa.ci
add comment=safelinkhub-walled-garden dst-host=*.moov-africa.com
add comment=safelinkhub-walled-garden dst-host=*.moov-africa.com
add comment=safelinkhub-walled-garden dst-host=momo.mtn.com
add comment=safelinkhub-walled-garden dst-host=momo.mtn.com
add comment=safelinkhub-walled-garden dst-host=*.mtn.com
add comment=safelinkhub-walled-garden dst-host=*.mtn.com
add comment=safelinkhub-walled-garden dst-host=*.mtn.ci
add comment=safelinkhub-walled-garden dst-host=*.mtn.ci
/ip hotspot walled-garden ip
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    safelinkhub.io dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    safelinkhub.io dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    safelinkhub.io dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    safelinkhub.io dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    pay.genius.ci dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    pay.genius.ci dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    pay.genius.ci dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    pay.genius.ci dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    geniuspay.ci dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    geniuspay.ci dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    geniuspay.ci dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    geniuspay.ci dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    cdn.tailwindcss.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    cdn.tailwindcss.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    cdn.tailwindcss.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    cdn.tailwindcss.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    cdn.jsdelivr.net dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    cdn.jsdelivr.net dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    cdn.jsdelivr.net dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    cdn.jsdelivr.net dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    fonts.googleapis.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    fonts.googleapis.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    fonts.googleapis.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    fonts.googleapis.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    fonts.gstatic.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    fonts.gstatic.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    fonts.gstatic.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    fonts.gstatic.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    paystack.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    paystack.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    paystack.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    paystack.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    paystack.co dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    paystack.co dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    paystack.co dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    paystack.co dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    checkout.paystack.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    checkout.paystack.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    checkout.paystack.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    checkout.paystack.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    cinetpay.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    cinetpay.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    cinetpay.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    cinetpay.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    pawapay.io dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    pawapay.io dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    pawapay.io dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    pawapay.io dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    wave.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    wave.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    wave.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    wave.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    webpayment.orange-money.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    webpayment.orange-money.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    webpayment.orange-money.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    webpayment.orange-money.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    moov-africa.ci dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    moov-africa.ci dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    moov-africa.ci dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    moov-africa.ci dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    momo.mtn.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    momo.mtn.com dst-port=443 protocol=tcp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    momo.mtn.com dst-port=443 protocol=udp
add action=accept comment=safelinkhub-walled-garden disabled=no dst-host=\
    momo.mtn.com dst-port=443 protocol=udp
/ip route
add dst-address=10.66.0.0/24 gateway=safelinkhub-wg0
/ip service
set ftp disabled=yes
set ssh available-from=10.66.0.0/24
set telnet disabled=yes
set www port=85
set api available-from=10.66.0.0/24,11.11.11.0/28
set api-ssl disabled=yes
/system clock
set time-zone-name=Africa/Abidjan
/system identity
set name=HSPT-KALAM
/system logging
add action=disk prefix=-> topics=hotspot,info,debug
/system ntp client
set enabled=yes
/system ntp client servers
add address=196.200.131.160
add address=196.10.52.57
/system scheduler
add comment="Monitor Profile 05-HEURES" !days interval=2m46s name=05-HEURES \
    on-event=":local dateint do={:local montharray ( \"jan\",\"feb\",\"mar\",\
    \"apr\",\"may\",\"jun\",\"jul\",\"aug\",\"sep\",\"oct\",\"nov\",\"dec\" );\
    :local days [ :pick \$d 4 6 ];:local month [ :pick \$d 0 3 ];:local year [\
    \_:pick \$d 7 11 ];:local monthint ([ :find \$montharray \$month]);:local \
    month (\$monthint + 1);:if ( [len \$month] = 1) do={:local zero (\"0\");:r\
    eturn [:tonum (\"\$year\$zero\$month\$days\")];} else={:return [:tonum (\"\
    \$year\$month\$days\")];}}; :local timeint do={ :local hours [ :pick \$t 0\
    \_2 ]; :local minutes [ :pick \$t 3 5 ]; :return (\$hours * 60 + \$minutes\
    ) ; }; :local date [ /system clock get date ];:if ([:pick \$date 4 5] = \"\
    -\") do={:local arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"0\
    4\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"\
    09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pi\
    ck \$date 8 10];:local bulan [:pick \$date 5 7];:local tahun [:pick \$date\
    \_0 4];:local bln (\$arraybln->\$bulan);:set \$date (\$bln.\"/\".\$tgl.\"/\
    \".\$tahun);}; :local time [ /system clock get time ]; :local today [\$dat\
    eint d=\$date] ; :local curtime [\$timeint t=\$time] ; :foreach i in [ /ip\
    \_hotspot user find where profile=\"05-HEURES\" ] do={ :local comment [ /i\
    p hotspot user get \$i comment]; :local name [ /ip hotspot user get \$i na\
    me]; :local gettime [:pic \$comment 12 20]; :if ([:pic \$comment 3] = \"/\
    \" and [:pic \$comment 6] = \"/\") do={:local expd [\$dateint d=\$comment]\
    \_; :local expt [\$timeint t=\$gettime] ; :if ((\$expd < \$today and \$exp\
    t < \$curtime) or (\$expd < \$today and \$expt > \$curtime) or (\$expd = \
    \$today and \$expt < \$curtime)) do={ [ /ip hotspot user remove \$i ]; [ /\
    ip hotspot active remove [find where user=\$name] ];}}}\
    \n" policy=ftp,read,write,policy,test,sensitive start-date=2024-01-01 \
    start-time=00:00:00
add comment="Monitor Profile 01-JOUR" !days interval=2m32s name=01-JOUR \
    on-event=":local dateint do={:local montharray ( \"jan\",\"feb\",\"mar\",\
    \"apr\",\"may\",\"jun\",\"jul\",\"aug\",\"sep\",\"oct\",\"nov\",\"dec\" );\
    :local days [ :pick \$d 4 6 ];:local month [ :pick \$d 0 3 ];:local year [\
    \_:pick \$d 7 11 ];:local monthint ([ :find \$montharray \$month]);:local \
    month (\$monthint + 1);:if ( [len \$month] = 1) do={:local zero (\"0\");:r\
    eturn [:tonum (\"\$year\$zero\$month\$days\")];} else={:return [:tonum (\"\
    \$year\$month\$days\")];}}; :local timeint do={ :local hours [ :pick \$t 0\
    \_2 ]; :local minutes [ :pick \$t 3 5 ]; :return (\$hours * 60 + \$minutes\
    ) ; }; :local date [ /system clock get date ];:if ([:pick \$date 4 5] = \"\
    -\") do={:local arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"0\
    4\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"\
    09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pi\
    ck \$date 8 10];:local bulan [:pick \$date 5 7];:local tahun [:pick \$date\
    \_0 4];:local bln (\$arraybln->\$bulan);:set \$date (\$bln.\"/\".\$tgl.\"/\
    \".\$tahun);}; :local time [ /system clock get time ]; :local today [\$dat\
    eint d=\$date] ; :local curtime [\$timeint t=\$time] ; :foreach i in [ /ip\
    \_hotspot user find where profile=\"01-JOUR\" ] do={ :local comment [ /ip \
    hotspot user get \$i comment]; :local name [ /ip hotspot user get \$i name\
    ]; :local gettime [:pic \$comment 12 20]; :if ([:pic \$comment 3] = \"/\" \
    and [:pic \$comment 6] = \"/\") do={:local expd [\$dateint d=\$comment] ; \
    :local expt [\$timeint t=\$gettime] ; :if ((\$expd < \$today and \$expt < \
    \$curtime) or (\$expd < \$today and \$expt > \$curtime) or (\$expd = \$tod\
    ay and \$expt < \$curtime)) do={ [ /ip hotspot user remove \$i ]; [ /ip ho\
    tspot active remove [find where user=\$name] ];}}}\
    \n" policy=ftp,read,write,policy,test,sensitive start-date=2024-01-01 \
    start-time=00:00:00
add comment="Monitor Profile 04-JOURS" !days interval=2m38s name=04-JOURS \
    on-event=":local dateint do={:local montharray ( \"jan\",\"feb\",\"mar\",\
    \"apr\",\"may\",\"jun\",\"jul\",\"aug\",\"sep\",\"oct\",\"nov\",\"dec\" );\
    :local days [ :pick \$d 4 6 ];:local month [ :pick \$d 0 3 ];:local year [\
    \_:pick \$d 7 11 ];:local monthint ([ :find \$montharray \$month]);:local \
    month (\$monthint + 1);:if ( [len \$month] = 1) do={:local zero (\"0\");:r\
    eturn [:tonum (\"\$year\$zero\$month\$days\")];} else={:return [:tonum (\"\
    \$year\$month\$days\")];}}; :local timeint do={ :local hours [ :pick \$t 0\
    \_2 ]; :local minutes [ :pick \$t 3 5 ]; :return (\$hours * 60 + \$minutes\
    ) ; }; :local date [ /system clock get date ];:if ([:pick \$date 4 5] = \"\
    -\") do={:local arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"0\
    4\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"\
    09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pi\
    ck \$date 8 10];:local bulan [:pick \$date 5 7];:local tahun [:pick \$date\
    \_0 4];:local bln (\$arraybln->\$bulan);:set \$date (\$bln.\"/\".\$tgl.\"/\
    \".\$tahun);}; :local time [ /system clock get time ]; :local today [\$dat\
    eint d=\$date] ; :local curtime [\$timeint t=\$time] ; :foreach i in [ /ip\
    \_hotspot user find where profile=\"04-JOURS\" ] do={ :local comment [ /ip\
    \_hotspot user get \$i comment]; :local name [ /ip hotspot user get \$i na\
    me]; :local gettime [:pic \$comment 12 20]; :if ([:pic \$comment 3] = \"/\
    \" and [:pic \$comment 6] = \"/\") do={:local expd [\$dateint d=\$comment]\
    \_; :local expt [\$timeint t=\$gettime] ; :if ((\$expd < \$today and \$exp\
    t < \$curtime) or (\$expd < \$today and \$expt > \$curtime) or (\$expd = \
    \$today and \$expt < \$curtime)) do={ [ /ip hotspot user remove \$i ]; [ /\
    ip hotspot active remove [find where user=\$name] ];}}}\
    \n" policy=ftp,read,write,policy,test,sensitive start-date=2024-01-01 \
    start-time=00:00:00
add comment="Monitor Profile 01-SEMAINE" !days interval=2m46s name=01-SEMAINE \
    on-event=":local dateint do={:local montharray ( \"jan\",\"feb\",\"mar\",\
    \"apr\",\"may\",\"jun\",\"jul\",\"aug\",\"sep\",\"oct\",\"nov\",\"dec\" );\
    :local days [ :pick \$d 4 6 ];:local month [ :pick \$d 0 3 ];:local year [\
    \_:pick \$d 7 11 ];:local monthint ([ :find \$montharray \$month]);:local \
    month (\$monthint + 1);:if ( [len \$month] = 1) do={:local zero (\"0\");:r\
    eturn [:tonum (\"\$year\$zero\$month\$days\")];} else={:return [:tonum (\"\
    \$year\$month\$days\")];}}; :local timeint do={ :local hours [ :pick \$t 0\
    \_2 ]; :local minutes [ :pick \$t 3 5 ]; :return (\$hours * 60 + \$minutes\
    ) ; }; :local date [ /system clock get date ];:if ([:pick \$date 4 5] = \"\
    -\") do={:local arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"0\
    4\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"\
    09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pi\
    ck \$date 8 10];:local bulan [:pick \$date 5 7];:local tahun [:pick \$date\
    \_0 4];:local bln (\$arraybln->\$bulan);:set \$date (\$bln.\"/\".\$tgl.\"/\
    \".\$tahun);}; :local time [ /system clock get time ]; :local today [\$dat\
    eint d=\$date] ; :local curtime [\$timeint t=\$time] ; :foreach i in [ /ip\
    \_hotspot user find where profile=\"01-SEMAINE\" ] do={ :local comment [ /\
    ip hotspot user get \$i comment]; :local name [ /ip hotspot user get \$i n\
    ame]; :local gettime [:pic \$comment 12 20]; :if ([:pic \$comment 3] = \"/\
    \" and [:pic \$comment 6] = \"/\") do={:local expd [\$dateint d=\$comment]\
    \_; :local expt [\$timeint t=\$gettime] ; :if ((\$expd < \$today and \$exp\
    t < \$curtime) or (\$expd < \$today and \$expt > \$curtime) or (\$expd = \
    \$today and \$expt < \$curtime)) do={ [ /ip hotspot user remove \$i ]; [ /\
    ip hotspot active remove [find where user=\$name] ];}}}\
    \n" policy=ftp,read,write,policy,test,sensitive start-date=2024-01-01 \
    start-time=00:00:00
add comment="Monitor Profile 01-MOIS" !days interval=2m34s name=01-MOIS \
    on-event=":local dateint do={:local montharray ( \"jan\",\"feb\",\"mar\",\
    \"apr\",\"may\",\"jun\",\"jul\",\"aug\",\"sep\",\"oct\",\"nov\",\"dec\" );\
    :local days [ :pick \$d 4 6 ];:local month [ :pick \$d 0 3 ];:local year [\
    \_:pick \$d 7 11 ];:local monthint ([ :find \$montharray \$month]);:local \
    month (\$monthint + 1);:if ( [len \$month] = 1) do={:local zero (\"0\");:r\
    eturn [:tonum (\"\$year\$zero\$month\$days\")];} else={:return [:tonum (\"\
    \$year\$month\$days\")];}}; :local timeint do={ :local hours [ :pick \$t 0\
    \_2 ]; :local minutes [ :pick \$t 3 5 ]; :return (\$hours * 60 + \$minutes\
    ) ; }; :local date [ /system clock get date ];:if ([:pick \$date 4 5] = \"\
    -\") do={:local arraybln {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"0\
    4\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"\
    09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"};:local tgl [:pi\
    ck \$date 8 10];:local bulan [:pick \$date 5 7];:local tahun [:pick \$date\
    \_0 4];:local bln (\$arraybln->\$bulan);:set \$date (\$bln.\"/\".\$tgl.\"/\
    \".\$tahun);}; :local time [ /system clock get time ]; :local today [\$dat\
    eint d=\$date] ; :local curtime [\$timeint t=\$time] ; :foreach i in [ /ip\
    \_hotspot user find where profile=\"01-MOIS\" ] do={ :local comment [ /ip \
    hotspot user get \$i comment]; :local name [ /ip hotspot user get \$i name\
    ]; :local gettime [:pic \$comment 12 20]; :if ([:pic \$comment 3] = \"/\" \
    and [:pic \$comment 6] = \"/\") do={:local expd [\$dateint d=\$comment] ; \
    :local expt [\$timeint t=\$gettime] ; :if ((\$expd < \$today and \$expt < \
    \$curtime) or (\$expd < \$today and \$expt > \$curtime) or (\$expd = \$tod\
    ay and \$expt < \$curtime)) do={ [ /ip hotspot user remove \$i ]; [ /ip ho\
    tspot active remove [find where user=\$name] ];}}}\
    \n" policy=ftp,read,write,policy,test,sensitive start-date=2024-01-01 \
    start-time=00:00:00
add !days interval=1d name=CLEAN_JOB on-event="/sys sch rem [find where on-eve\
    nt=\"\"];/sys scr job rem [find where owner~\"sys\"]" policy=\
    ftp,read,write,policy,test,sensitive start-date=2024-01-01 start-time=\
    00:00:05
