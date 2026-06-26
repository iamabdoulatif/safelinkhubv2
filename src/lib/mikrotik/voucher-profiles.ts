// Auto-generated from a real MikHmon/RouterOS export (Mamba template).
// Each hotspot user profile encodes its own expiry logic in `on-login`
// (creates a one-shot /system scheduler job that removes the user when
// its voucher duration elapses) plus a companion always-on scheduler job
// that sweeps already-expired users on a fixed interval as a safety net.
export type VoucherProfile = {
  name: string;
  label: string;
  durationCode: string;
  onLogin: string;
  monitorInterval: string;
  monitorOnEvent: string;
};

const LABELS: Record<string, { label: string; durationCode: string }> = {
  "05-MINS": { label: "5 minutes", durationCode: "5m" },
  "01-JOUR": { label: "1 jour", durationCode: "1d" },
  "05-JOURS": { label: "5 jours", durationCode: "5d" },
  "01-SEMAINE": { label: "1 semaine", durationCode: "7d" },
  "02-SEMAINES": { label: "2 semaines", durationCode: "14d" },
  "01-MOIS": { label: "1 mois", durationCode: "30d" },
};

export const VOUCHER_PROFILES: VoucherProfile[] = [
  {
    name: "01-JOUR",
    ...LABELS["01-JOUR"],
    onLogin: `:put (",remc,200,1d,200,,Enable,"); {:local datamitha;:local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);};:local year [ :pick $date 7 11 ];:local month [ :pick $date 0 3 ];:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment]; :local ucode [:pic $comment 0 2]; :if ($ucode = "vc" or $ucode = "up" or $comment = "") do={ /sys sch add name="$user" disable=no start-date=$date interval="1d"; :delay 5s; :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run];:if ([:pick $exp 10 11] = " ") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 11 19];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);} else={:if ([:pick $exp 2 3] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 3 5];:local bulan [:pick $exp 0 2];:local bln ($arraybln->$bulan);:local jam [:pick $exp 6 14];:set $exp ($bln."/".$tgl." ".$jam);};:if ([:pick $exp 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 6 14];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);};};:local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pic $exp 0 6]; :local t [:pic $exp 7 16]; :local s ("/"); :local exp ("$d$s$year $t"); /ip hotspot user set comment=$exp [find where name="$user"];:set datamitha ("$d$s$year $t");}; :if ($getxp = 8) do={ /ip hotspot user set comment="$date $exp" [find where name="$user"];:set datamitha "$date $exp";}; :if ($getxp > 15) do={ /ip hotspot user set comment=$exp [find where name="$user"];:set datamitha "$exp";};:local waktu [/system clock get time ];:local macmitha $"mac-address";:local profilemitha [ /ip hotspot user get [/ip hotspot user find where name="$user"] profile];/sys sch remove [find where name="$user"]; :local mac $"mac-address"; :local time [/system clock get time ]; /system script add name="$date-|-$time-|-$user-|-200-|-$address-|-$mac-|-1d-|-01-JOUR-|-$comment" owner="$month$year" source=$date comment=mikhmon}}
`,
    monitorInterval: "2m24s",
    monitorOnEvent: `:local dateint do={:local montharray ( "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec" );:local days [ :pick $d 4 6 ];:local month [ :pick $d 0 3 ];:local year [ :pick $d 7 11 ];:local monthint ([ :find $montharray $month]);:local month ($monthint + 1);:if ( [len $month] = 1) do={:local zero ("0");:return [:tonum ("$year$zero$month$days")];} else={:return [:tonum ("$year$month$days")];}}; :local timeint do={ :local hours [ :pick $t 0 2 ]; :local minutes [ :pick $t 3 5 ]; :return ($hours * 60 + $minutes) ; }; :local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);}; :local time [ /system clock get time ]; :local today [$dateint d=$date] ; :local curtime [$timeint t=$time] ; :foreach i in [ /ip hotspot user find where profile="01-JOUR" ] do={ :local comment [ /ip hotspot user get $i comment]; :local name [ /ip hotspot user get $i name]; :local gettime [:pic $comment 12 20]; :if ([:pic $comment 3] = "/" and [:pic $comment 6] = "/") do={:local expd [$dateint d=$comment] ; :local expt [$timeint t=$gettime] ; :if (($expd < $today and $expt < $curtime) or ($expd < $today and $expt > $curtime) or ($expd = $today and $expt < $curtime)) do={ [ /ip hotspot user remove $i ]; [ /ip hotspot active remove [find where user=$name] ];}}}
`,
  },
  {
    name: "05-JOURS",
    ...LABELS["05-JOURS"],
    onLogin: `:put (",remc,500,5d,500,,Enable,"); {:local datamitha;:local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);};:local year [ :pick $date 7 11 ];:local month [ :pick $date 0 3 ];:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment]; :local ucode [:pic $comment 0 2]; :if ($ucode = "vc" or $ucode = "up" or $comment = "") do={ /sys sch add name="$user" disable=no start-date=$date interval="5d"; :delay 5s; :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run];:if ([:pick $exp 10 11] = " ") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 11 19];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);} else={:if ([:pick $exp 2 3] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 3 5];:local bulan [:pick $exp 0 2];:local bln ($arraybln->$bulan);:local jam [:pick $exp 6 14];:set $exp ($bln."/".$tgl." ".$jam);};:if ([:pick $exp 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 6 14];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);};};:local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pic $exp 0 6]; :local t [:pic $exp 7 16]; :local s ("/"); :local exp ("$d$s$year $t"); /ip hotspot user set comment=$exp [find where name="$user"];:set datamitha ("$d$s$year $t");}; :if ($getxp = 8) do={ /ip hotspot user set comment="$date $exp" [find where name="$user"];:set datamitha "$date $exp";}; :if ($getxp > 15) do={ /ip hotspot user set comment=$exp [find where name="$user"];:set datamitha "$exp";};:local waktu [/system clock get time ];:local macmitha $"mac-address";:local profilemitha [ /ip hotspot user get [/ip hotspot user find where name="$user"] profile];/sys sch remove [find where name="$user"]; :local mac $"mac-address"; :local time [/system clock get time ]; /system script add name="$date-|-$time-|-$user-|-500-|-$address-|-$mac-|-5d-|-05-JOURS-|-$comment" owner="$month$year" source=$date comment=mikhmon}}
`,
    monitorInterval: "2m27s",
    monitorOnEvent: `:local dateint do={:local montharray ( "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec" );:local days [ :pick $d 4 6 ];:local month [ :pick $d 0 3 ];:local year [ :pick $d 7 11 ];:local monthint ([ :find $montharray $month]);:local month ($monthint + 1);:if ( [len $month] = 1) do={:local zero ("0");:return [:tonum ("$year$zero$month$days")];} else={:return [:tonum ("$year$month$days")];}}; :local timeint do={ :local hours [ :pick $t 0 2 ]; :local minutes [ :pick $t 3 5 ]; :return ($hours * 60 + $minutes) ; }; :local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);}; :local time [ /system clock get time ]; :local today [$dateint d=$date] ; :local curtime [$timeint t=$time] ; :foreach i in [ /ip hotspot user find where profile="05-JOURS" ] do={ :local comment [ /ip hotspot user get $i comment]; :local name [ /ip hotspot user get $i name]; :local gettime [:pic $comment 12 20]; :if ([:pic $comment 3] = "/" and [:pic $comment 6] = "/") do={:local expd [$dateint d=$comment] ; :local expt [$timeint t=$gettime] ; :if (($expd < $today and $expt < $curtime) or ($expd < $today and $expt > $curtime) or ($expd = $today and $expt < $curtime)) do={ [ /ip hotspot user remove $i ]; [ /ip hotspot active remove [find where user=$name] ];}}}
`,
  },
  {
    name: "01-SEMAINE",
    ...LABELS["01-SEMAINE"],
    onLogin: `:put (",remc,700,7d,700,,Enable,"); {:local datamitha;:local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);};:local year [ :pick $date 7 11 ];:local month [ :pick $date 0 3 ];:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment]; :local ucode [:pic $comment 0 2]; :if ($ucode = "vc" or $ucode = "up" or $comment = "") do={ /sys sch add name="$user" disable=no start-date=$date interval="7d"; :delay 5s; :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run];:if ([:pick $exp 10 11] = " ") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 11 19];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);} else={:if ([:pick $exp 2 3] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 3 5];:local bulan [:pick $exp 0 2];:local bln ($arraybln->$bulan);:local jam [:pick $exp 6 14];:set $exp ($bln."/".$tgl." ".$jam);};:if ([:pick $exp 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 6 14];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);};};:local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pic $exp 0 6]; :local t [:pic $exp 7 16]; :local s ("/"); :local exp ("$d$s$year $t"); /ip hotspot user set comment=$exp [find where name="$user"];:set datamitha ("$d$s$year $t");}; :if ($getxp = 8) do={ /ip hotspot user set comment="$date $exp" [find where name="$user"];:set datamitha "$date $exp";}; :if ($getxp > 15) do={ /ip hotspot user set comment=$exp [find where name="$user"];:set datamitha "$exp";};:local waktu [/system clock get time ];:local macmitha $"mac-address";:local profilemitha [ /ip hotspot user get [/ip hotspot user find where name="$user"] profile];/sys sch remove [find where name="$user"]; :local mac $"mac-address"; :local time [/system clock get time ]; /system script add name="$date-|-$time-|-$user-|-700-|-$address-|-$mac-|-7d-|-01-SEMAINE-|-$comment" owner="$month$year" source=$date comment=mikhmon}}
`,
    monitorInterval: "2m20s",
    monitorOnEvent: `:local dateint do={:local montharray ( "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec" );:local days [ :pick $d 4 6 ];:local month [ :pick $d 0 3 ];:local year [ :pick $d 7 11 ];:local monthint ([ :find $montharray $month]);:local month ($monthint + 1);:if ( [len $month] = 1) do={:local zero ("0");:return [:tonum ("$year$zero$month$days")];} else={:return [:tonum ("$year$month$days")];}}; :local timeint do={ :local hours [ :pick $t 0 2 ]; :local minutes [ :pick $t 3 5 ]; :return ($hours * 60 + $minutes) ; }; :local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);}; :local time [ /system clock get time ]; :local today [$dateint d=$date] ; :local curtime [$timeint t=$time] ; :foreach i in [ /ip hotspot user find where profile="01-SEMAINE" ] do={ :local comment [ /ip hotspot user get $i comment]; :local name [ /ip hotspot user get $i name]; :local gettime [:pic $comment 12 20]; :if ([:pic $comment 3] = "/" and [:pic $comment 6] = "/") do={:local expd [$dateint d=$comment] ; :local expt [$timeint t=$gettime] ; :if (($expd < $today and $expt < $curtime) or ($expd < $today and $expt > $curtime) or ($expd = $today and $expt < $curtime)) do={ [ /ip hotspot user remove $i ]; [ /ip hotspot active remove [find where user=$name] ];}}}

`,
  },
  {
    name: "02-SEMAINES",
    ...LABELS["02-SEMAINES"],
    onLogin: `:put (",remc,1000,14d,1000,,Enable,"); {:local datamitha;:local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);};:local year [ :pick $date 7 11 ];:local month [ :pick $date 0 3 ];:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment]; :local ucode [:pic $comment 0 2]; :if ($ucode = "vc" or $ucode = "up" or $comment = "") do={ /sys sch add name="$user" disable=no start-date=$date interval="14d"; :delay 5s; :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run];:if ([:pick $exp 10 11] = " ") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 11 19];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);} else={:if ([:pick $exp 2 3] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 3 5];:local bulan [:pick $exp 0 2];:local bln ($arraybln->$bulan);:local jam [:pick $exp 6 14];:set $exp ($bln."/".$tgl." ".$jam);};:if ([:pick $exp 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 6 14];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);};};:local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pic $exp 0 6]; :local t [:pic $exp 7 16]; :local s ("/"); :local exp ("$d$s$year $t"); /ip hotspot user set comment=$exp [find where name="$user"];:set datamitha ("$d$s$year $t");}; :if ($getxp = 8) do={ /ip hotspot user set comment="$date $exp" [find where name="$user"];:set datamitha "$date $exp";}; :if ($getxp > 15) do={ /ip hotspot user set comment=$exp [find where name="$user"];:set datamitha "$exp";};:local waktu [/system clock get time ];:local macmitha $"mac-address";:local profilemitha [ /ip hotspot user get [/ip hotspot user find where name="$user"] profile];/sys sch remove [find where name="$user"]; :local mac $"mac-address"; :local time [/system clock get time ]; /system script add name="$date-|-$time-|-$user-|-1000-|-$address-|-$mac-|-14d-|-02-SEMAINES-|-$comment" owner="$month$year" source=$date comment=mikhmon}}
`,
    monitorInterval: "2m39s",
    monitorOnEvent: `:local dateint do={:local montharray ( "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec" );:local days [ :pick $d 4 6 ];:local month [ :pick $d 0 3 ];:local year [ :pick $d 7 11 ];:local monthint ([ :find $montharray $month]);:local month ($monthint + 1);:if ( [len $month] = 1) do={:local zero ("0");:return [:tonum ("$year$zero$month$days")];} else={:return [:tonum ("$year$month$days")];}}; :local timeint do={ :local hours [ :pick $t 0 2 ]; :local minutes [ :pick $t 3 5 ]; :return ($hours * 60 + $minutes) ; }; :local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);}; :local time [ /system clock get time ]; :local today [$dateint d=$date] ; :local curtime [$timeint t=$time] ; :foreach i in [ /ip hotspot user find where profile="02-SEMAINES" ] do={ :local comment [ /ip hotspot user get $i comment]; :local name [ /ip hotspot user get $i name]; :local gettime [:pic $comment 12 20]; :if ([:pic $comment 3] = "/" and [:pic $comment 6] = "/") do={:local expd [$dateint d=$comment] ; :local expt [$timeint t=$gettime] ; :if (($expd < $today and $expt < $curtime) or ($expd < $today and $expt > $curtime) or ($expd = $today and $expt < $curtime)) do={ [ /ip hotspot user remove $i ]; [ /ip hotspot active remove [find where user=$name] ];}}}
`,
  },
  {
    name: "01-MOIS",
    ...LABELS["01-MOIS"],
    onLogin: `:put (",remc,2000,30d,2000,,Enable,"); {:local datamitha;:local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);};:local year [ :pick $date 7 11 ];:local month [ :pick $date 0 3 ];:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment]; :local ucode [:pic $comment 0 2]; :if ($ucode = "vc" or $ucode = "up" or $comment = "") do={ /sys sch add name="$user" disable=no start-date=$date interval="30d"; :delay 5s; :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run];:if ([:pick $exp 10 11] = " ") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 11 19];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);} else={:if ([:pick $exp 2 3] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 3 5];:local bulan [:pick $exp 0 2];:local bln ($arraybln->$bulan);:local jam [:pick $exp 6 14];:set $exp ($bln."/".$tgl." ".$jam);};:if ([:pick $exp 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 6 14];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);};};:local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pic $exp 0 6]; :local t [:pic $exp 7 16]; :local s ("/"); :local exp ("$d$s$year $t"); /ip hotspot user set comment=$exp [find where name="$user"];:set datamitha ("$d$s$year $t");}; :if ($getxp = 8) do={ /ip hotspot user set comment="$date $exp" [find where name="$user"];:set datamitha "$date $exp";}; :if ($getxp > 15) do={ /ip hotspot user set comment=$exp [find where name="$user"];:set datamitha "$exp";};:local waktu [/system clock get time ];:local macmitha $"mac-address";:local profilemitha [ /ip hotspot user get [/ip hotspot user find where name="$user"] profile];/sys sch remove [find where name="$user"]; :local mac $"mac-address"; :local time [/system clock get time ]; /system script add name="$date-|-$time-|-$user-|-2000-|-$address-|-$mac-|-30d-|-01-MOIS-|-$comment" owner="$month$year" source=$date comment=mikhmon}}
`,
    monitorInterval: "2m21s",
    monitorOnEvent: `:local dateint do={:local montharray ( "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec" );:local days [ :pick $d 4 6 ];:local month [ :pick $d 0 3 ];:local year [ :pick $d 7 11 ];:local monthint ([ :find $montharray $month]);:local month ($monthint + 1);:if ( [len $month] = 1) do={:local zero ("0");:return [:tonum ("$year$zero$month$days")];} else={:return [:tonum ("$year$month$days")];}}; :local timeint do={ :local hours [ :pick $t 0 2 ]; :local minutes [ :pick $t 3 5 ]; :return ($hours * 60 + $minutes) ; }; :local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);}; :local time [ /system clock get time ]; :local today [$dateint d=$date] ; :local curtime [$timeint t=$time] ; :foreach i in [ /ip hotspot user find where profile="01-MOIS" ] do={ :local comment [ /ip hotspot user get $i comment]; :local name [ /ip hotspot user get $i name]; :local gettime [:pic $comment 12 20]; :if ([:pic $comment 3] = "/" and [:pic $comment 6] = "/") do={:local expd [$dateint d=$comment] ; :local expt [$timeint t=$gettime] ; :if (($expd < $today and $expt < $curtime) or ($expd < $today and $expt > $curtime) or ($expd = $today and $expt < $curtime)) do={ [ /ip hotspot user remove $i ]; [ /ip hotspot active remove [find where user=$name] ];}}}
`,
  },
  {
    name: "05-MINS",
    ...LABELS["05-MINS"],
    onLogin: `:put (",remc,10,5m,10,,Enable,"); {:local datamitha;:local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);};:local year [ :pick $date 7 11 ];:local month [ :pick $date 0 3 ];:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment]; :local ucode [:pic $comment 0 2]; :if ($ucode = "vc" or $ucode = "up" or $comment = "") do={ /sys sch add name="$user" disable=no start-date=$date interval="5m"; :delay 5s; :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run];:if ([:pick $exp 10 11] = " ") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 11 19];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);} else={:if ([:pick $exp 2 3] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 3 5];:local bulan [:pick $exp 0 2];:local bln ($arraybln->$bulan);:local jam [:pick $exp 6 14];:set $exp ($bln."/".$tgl." ".$jam);};:if ([:pick $exp 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 6 14];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);};};:local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pic $exp 0 6]; :local t [:pic $exp 7 16]; :local s ("/"); :local exp ("$d$s$year $t"); /ip hotspot user set comment=$exp [find where name="$user"];:set datamitha ("$d$s$year $t");}; :if ($getxp = 8) do={ /ip hotspot user set comment="$date $exp" [find where name="$user"];:set datamitha "$date $exp";}; :if ($getxp > 15) do={ /ip hotspot user set comment=$exp [find where name="$user"];:set datamitha "$exp";};:local waktu [/system clock get time ];:local macmitha $"mac-address";:local profilemitha [ /ip hotspot user get [/ip hotspot user find where name="$user"] profile];/sys sch remove [find where name="$user"]; :local mac $"mac-address"; :local time [/system clock get time ]; /system script add name="$date-|-$time-|-$user-|-10-|-$address-|-$mac-|-5m-|-05-MINS-|-$comment" owner="$month$year" source=$date comment=mikhmon}}
`,
    monitorInterval: "2m44s",
    monitorOnEvent: `:local dateint do={:local montharray ( "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec" );:local days [ :pick $d 4 6 ];:local month [ :pick $d 0 3 ];:local year [ :pick $d 7 11 ];:local monthint ([ :find $montharray $month]);:local month ($monthint + 1);:if ( [len $month] = 1) do={:local zero ("0");:return [:tonum ("$year$zero$month$days")];} else={:return [:tonum ("$year$month$days")];}}; :local timeint do={ :local hours [ :pick $t 0 2 ]; :local minutes [ :pick $t 3 5 ]; :return ($hours * 60 + $minutes) ; }; :local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);}; :local time [ /system clock get time ]; :local today [$dateint d=$date] ; :local curtime [$timeint t=$time] ; :foreach i in [ /ip hotspot user find where profile="05-MINS" ] do={ :local comment [ /ip hotspot user get $i comment]; :local name [ /ip hotspot user get $i name]; :local gettime [:pic $comment 12 20]; :if ([:pic $comment 3] = "/" and [:pic $comment 6] = "/") do={:local expd [$dateint d=$comment] ; :local expt [$timeint t=$gettime] ; :if (($expd < $today and $expt < $curtime) or ($expd < $today and $expt > $curtime) or ($expd = $today and $expt < $curtime)) do={ [ /ip hotspot user remove $i ]; [ /ip hotspot active remove [find where user=$name] ];}}}`,
  },
];

/**
 * Lets the admin define their own voucher durations (e.g. "2 jours", "3
 * jours") instead of being limited to the 6 bundled presets above. Rather
 * than re-deriving MikHmon's on-login/expiry-sweep RouterOS scripts from
 * scratch — they're intricate and easy to get subtly wrong — this clones
 * the 01-JOUR preset (itself a real, working MikHmon export) and swaps out
 * its three parameterized spots: the embedded price, the RouterOS
 * scheduler interval, and the profile name used both in the generated
 * script's name and in the expiry-sweep's `where profile=...` filter.
 * Each substitution target is asserted to occur exactly once in the
 * template so a future edit to the 01-JOUR preset can't silently corrupt
 * custom profiles instead of failing loudly here.
 */
const CUSTOM_PROFILE_TEMPLATE = VOUCHER_PROFILES.find((p) => p.name === "01-JOUR")!;

function replaceOnce(haystack: string, target: string, replacement: string, what: string): string {
  const occurrences = haystack.split(target).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `Voucher profile template changed unexpectedly: expected exactly one "${target}" (${what}), found ${occurrences}.`,
    );
  }
  return haystack.replace(target, replacement);
}

export type DurationUnit = "m" | "h" | "d";

export const DURATION_UNIT_LABELS: Record<DurationUnit, { singular: string; plural: string }> = {
  m: { singular: "minute", plural: "minutes" },
  h: { singular: "heure", plural: "heures" },
  d: { singular: "jour", plural: "jours" },
};

/** "02-JOURS", "12-HEURES", "30-MINUTES" — matches the bundled presets' naming convention. */
export function buildCustomProfileName(amount: number, unit: DurationUnit): string {
  const { singular, plural } = DURATION_UNIT_LABELS[unit];
  const word = (amount === 1 ? singular : plural).toUpperCase();
  return `${String(amount).padStart(2, "0")}-${word}`;
}

export function buildCustomProfileLabel(amount: number, unit: DurationUnit): string {
  const { singular, plural } = DURATION_UNIT_LABELS[unit];
  return `${amount} ${amount === 1 ? singular : plural}`;
}

// Deterministic per-name offset so several custom profiles' expiry-sweep
// schedulers don't all tick at the exact same second — mirrors the
// hand-picked spacing (2m20s–2m44s) the bundled presets already use.
function monitorIntervalFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
  return `2m${20 + (hash % 30)}s`;
}

export function buildVoucherProfile(opts: {
  name: string;
  label: string;
  durationCode: string; // RouterOS time spec, e.g. "2d", "12h", "30m"
  price?: number;
}): VoucherProfile {
  const price = opts.price ?? 0;

  let onLogin = replaceOnce(
    CUSTOM_PROFILE_TEMPLATE.onLogin,
    ",200,1d,200,",
    `,${price},${opts.durationCode},${price},`,
    "embedded price/duration",
  );
  onLogin = replaceOnce(
    onLogin,
    'interval="1d"',
    `interval="${opts.durationCode}"`,
    "scheduler interval",
  );
  onLogin = replaceOnce(onLogin, "-|-200-|-", `-|-${price}-|-`, "script-name price segment");
  onLogin = replaceOnce(onLogin, "-|-1d-|-", `-|-${opts.durationCode}-|-`, "script-name duration segment");
  onLogin = replaceOnce(onLogin, "-|-01-JOUR-|-", `-|-${opts.name}-|-`, "script-name profile segment");

  const monitorOnEvent = replaceOnce(
    CUSTOM_PROFILE_TEMPLATE.monitorOnEvent,
    'profile="01-JOUR"',
    `profile="${opts.name}"`,
    "expiry-sweep profile filter",
  );

  return {
    name: opts.name,
    label: opts.label,
    durationCode: opts.durationCode,
    onLogin,
    monitorInterval: monitorIntervalFor(opts.name),
    monitorOnEvent,
  };
}