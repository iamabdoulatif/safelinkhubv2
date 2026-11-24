<?php
/*
 *  Copyright (C) 2018 Laksamadi Guko.
 *
 *  This program is free software; you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation; either version 2 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
session_start();
// hide all error
error_reporting(0);
if (!isset($_SESSION["mikhmon"])) {
	header("Location:../admin.php?id=login");
} else {
  
  // load session MikroTik
  $session = $_GET['session'];

  // lang
  include('../include/lang.php');
  include('../lang/'.$langid.'.php');

  // load config
  include('../include/config.php');
  include('../include/readcfg.php');

  // routeros api
  include_once('../lib/routeros_api.class.php');
  include_once('../lib/formatbytesbites.php');
  include_once('../include/mikhmon_compat.php');
  $API = new RouterosAPI();
  $API->debug = false;

	$idhr = $_GET['idhr'];
	$idbl = $_GET['idbl'];
	// Filtre par intervalle de dates (from/to = YYYY-MM-DD)
	$srange = mikhmon_sale_range(isset($_GET['from']) ? $_GET['from'] : '', isset($_GET['to']) ? $_GET['to'] : '');
	$rfrom = $rto = '';
	if ($srange) {
		list($rfrom, $rto) = $srange;
		$idhr = '';
		$idbl = '';
	}
	$idbl2 = explode("/",$idhr)[0].explode("/",$idhr)[2];
	// Filtre par vendeur (?seller=<identifiant>) : commentaire du ticket terminé par -<vendeur>
	if (!isset($sellers_data)) { include(__DIR__ . '/../include/sellers_config.php'); }
	$sseller = isset($_GET['seller']) ? trim((string) $_GET['seller']) : '';
	if (!isset($sellers_data) || !is_array($sellers_data) || !isset($sellers_data[$sseller])) { $sseller = ''; }
	$ssellerName = $sseller !== '' ? (isset($sellers_data[$sseller]['name']) ? $sellers_data[$sseller]['name'] : $sseller) : '';
	if ($srange){
		$_SESSION['report'] = "&from=".$rfrom."&to=".$rto;
	} elseif ($idhr != ""){
		$_SESSION['report'] = "&idhr=".$idhr;
	} elseif ($idbl != ""){
		$_SESSION['report'] = "&idbl=".$idbl;
	} else {
		$_SESSION['report'] = "";
	}
	$_SESSION['idbl'] = $idbl;
	$remdata = ($_POST['remdata']);
	$prefix = $_GET['prefix'];
	$fcomment = $_GET['comment'];
	$range = $_GET['range'];
	if(!empty($range)){$trange = "[".$range."]";}
	
	$pcomment = substr($prefix, 0,2);
	if($pcomment == "!!"){
		$fcomment = explode("!!",$prefix)[1];
	}else{$fcomment = $fcomment;}

		$gettimezone = $API->comm("/system/clock/print");
		$timezone = mikhmon_safe_timezone($gettimezone[0]['time-zone-name'] ?? ($_SESSION['timezone'] ?? 'UTC'));
		$_SESSION['timezone'] = $timezone;
	date_default_timezone_set($timezone);

	if (isset($remdata)) {
		if (strlen($idhr) > "0") {
			if ($API->connect($iphost, $userhost, decrypt($passwdhost))) {
				$API->write('/system/script/print', false);
				$API->write('?source=' . $idhr . '', false);
				$API->write('=.proplist=.id');
				$ARREMD = $API->read();
				for ($i = 0; $i < count($ARREMD); $i++) {
					$API->write('/system/script/remove', false);
					$API->write('=.id=' . $ARREMD[$i]['.id']);
					$READ = $API->read();

				}
			}
		} elseif (strlen($idbl) > "0") {
			if ($API->connect($iphost, $userhost, decrypt($passwdhost))) {
				$API->write('/system/script/print', false);
				$API->write('?owner=' . $idbl . '', false);
				$API->write('=.proplist=.id');
				$ARREMD = $API->read();
				for ($i = 0; $i < count($ARREMD); $i++) {
					$API->write('/system/script/remove', false);
					$API->write('=.id=' . $ARREMD[$i]['.id']);
					$READ = $API->read();

				}
			}

		}
		echo "<script>window.location='./?report=selling&session=" . $session . "'</script>";
	}

	if ($pcomment == "!!"){
		$fprefix = "-comment-[" . $fcomment . "]";
	} else	if ($prefix != "") {
		$fprefix = "-prefix-[" . $prefix . "]";
	} else {
		$fprefix = "";
	}
	if ($srange) {
		if ($API->connect($iphost, $userhost, decrypt($passwdhost))) {
		$getData = array();
		foreach (mikhmon_sale_range_owners($rfrom, $rto) as $o) {
			$getData = array_merge($getData, (array) mikhmon_fetch_sales_by_month($API, $o));
		}
		$getData = mikhmon_filter_sales_range($getData, $rfrom, $rto);
		$TotalReg = count($getData);
		}
		$filedownload = $rfrom . "_" . $rto;
		$shf = "hidden";
		$shd = "none";
	} elseif (strlen($idhr) > "0") {
		if ($API->connect($iphost, $userhost, decrypt($passwdhost))) {
			$getData = mikhmon_fetch_sales_by_day($API, $idhr);
			$TotalReg = count($getData);
		}
		$filedownload = $idhr;
		$shf = "hidden";
		$shd = "inline-block";
	} elseif (strlen($idbl) > "0") {
		if ($API->connect($iphost, $userhost, decrypt($passwdhost))) {
			$getData = mikhmon_fetch_sales_by_month($API, $idbl);
			$TotalReg = count($getData);
		}
		$filedownload = $idbl;
		$shf = "hidden";
		$shd = "inline-block";
	} elseif ($idhr == "" || $idbl == "") {
		if ($API->connect($iphost, $userhost, decrypt($passwdhost))) {
			$getData = $API->comm("/system/script/print", array(
				"?comment" => "mikhmon",
			));
			$TotalReg = count($getData);
		}
		$filedownload = "all";
		$shf = "text";
		$shd = "none";
	} elseif (strlen($idbl) > "0" ) {
		if ($API->connect($iphost, $userhost, decrypt($passwdhost))) {
			$getData = mikhmon_fetch_sales_by_month($API, $idbl);
			$TotalReg = count($getData);
		}
		$filedownload = $idbl;
		$shf = "hidden";
		$shd = "inline-block";
	}
	if ($sseller !== '' && isset($getData)) {
		$getData = mikhmon_filter_sales_seller($getData, $sseller, $sellers_data);
		$TotalReg = count($getData);
		$filedownload .= "-" . $sseller;
		$shd = "none"; // ne pas proposer de supprimer tout le mois depuis la vue d'un vendeur
	}
	
}
?>
<!DOCTYPE html>
<html>
	<head>
		<title>.:: MIKHMON <?= $hotspotname; ?> ::.</title>
		<meta charset="utf-8">
		<meta http-equiv="cache-control" content="private" />
		<meta http-equiv="X-UA-Compatible" content="IE=edge">
		<!-- Tell the browser to be responsive to screen width -->
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<style>
	body { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
	.table { width: 100%; background: #fff; border-collapse: collapse !important; font-size: 12px; }
	.table td, .table th { padding: 6px 8px; }
	.table td, th, a { color: #0f172a; text-decoration: none; }
	.table-bordered th, .table-bordered td { border: 1px solid #cbd5e1 !important; }
	#dataTable thead th { background: linear-gradient(90deg, #1e3a8a, #2563eb); color: #fff; font-size: 13px; padding: 12px; border: none !important; }
	#dataTable thead th h3 { color: #fff; font-size: 20px; letter-spacing: .02em; }
	#dataTable tr:nth-child(2) th { background: #eff6ff; color: #1e3a8a; }
	#dataTable #total { color: #16a34a; font-size: 15px; }
	#dataTable tr:nth-child(3) th { background: #1e3a8a; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
	#dataTable tbody tr:nth-child(even) td { background: #f1f5f9; }
	#dataTable tbody td:last-child { font-weight: 600; text-align: right; }
	@page { size: auto; margin: 9mm 3mm 3mm 7mm; }
	@media print {
	 table { page-break-after: auto }
	 tr { page-break-inside: avoid; page-break-after: auto }
	 td { page-break-inside: avoid; page-break-after: auto }
	 thead { display: table-header-group }
	 tfoot { display: table-footer-group }
	 .overflow { max-height: none !important; }
	}
	h3 { margin: 0; }
		</style>
		
	</head>
	<body>
		<div class="wrapper">
		<script>
function mikhmonParseAmount(str) {
  str = String(str).replace(/ /g, '').replace(/ /g, '');
  str = str.replace(/[^\d,.\-]/g, '');
  if (!str || str === '-') return 0;
  var lc = str.lastIndexOf(','), ld = str.lastIndexOf('.');
  if (lc !== -1 && ld !== -1) {
    if (lc > ld) { str = str.replace(/\./g, '').replace(',', '.'); }
    else { str = str.replace(/,/g, ''); }
    return parseFloat(str) || 0;
  }
  if (lc !== -1) {
    var parts = str.split(','), tail = parts[parts.length - 1];
    if (tail.length === 3 && parts.length > 1) return parseFloat(str.replace(/,/g, '')) || 0;
    return parseFloat(str.replace(',', '.')) || 0;
  }
  if (ld !== -1) {
    var parts2 = str.split('.'), tail2 = parts2[parts2.length - 1];
    if (tail2.length === 3 && parts2.length > 1) return parseFloat(str.replace(/\./g, '')) || 0;
  }
  return parseFloat(str) || 0;
}
function number_format(number, decimals, dec_point, thousands_sep) {

  number = (number + '')
    .replace(/[^0-9+\-Ee.]/g, '');
  var n = !isFinite(+number) ? 0 : +number,
    prec = !isFinite(+decimals) ? 0 : Math.abs(decimals),
    sep = (typeof thousands_sep === 'undefined') ? ',' : thousands_sep,
    dec = (typeof dec_point === 'undefined') ? '.' : dec_point,
    s = '',
    toFixedFix = function(n, prec) {
      var k = Math.pow(10, prec);
      return '' + (Math.round(n * k) / k)
        .toFixed(prec);
    };
  // Fix for IE parseFloat(0.55).toFixed(0) = 0;
  s = (prec ? toFixedFix(n, prec) : '' + Math.round(n))
    .split('.');
  if (s[0].length > 3) {
    s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
  }
  if ((s[1] || '')
    .length < prec) {
    s[1] = s[1] || '';
    s[1] += new Array(prec - s[1].length + 1)
      .join('0');
  }
  return s.join(dec);
}
		window.onload=function() {
          var sum = 0;
          var dataTable = document.getElementById("selling");
          
          // use querySelector to find all second table cells
          var cells = document.querySelectorAll("#dataTable td + td + td + td + td + td");
          for (var i = 0; i < cells.length; i++)
          sum+=mikhmonParseAmount(cells[i].firstChild.data);
          
          var th = document.getElementById('total');
          
    <?php
    if (mikhmon_currency_uses_integer_amounts($currency, $cekindo)) {
      $tsep = in_array(trim((string)$currency), isset($cekindo['indo']) ? $cekindo['indo'] : array(), true) ? '.' : ' ';
      echo 'th.innerHTML = ' . json_encode($currency . ' ') . ' + number_format(sum, 0, ",", ' . json_encode($tsep) . ');';
    } else {
      echo 'th.innerHTML = ' . json_encode($currency . ' ') . ' + number_format(sum, 2, ".", ",");';
    } ?>
		
		var table = document.querySelector('#dataTable tbody');
    var rows = table.rows;
    for(var i = 0, td; i < rows.length; i++){
        td = document.createElement('td');
        td.appendChild(document.createTextNode(i + 1));
        rows[i].insertBefore(td, rows[i].firstChild);
    }
    var nb = document.getElementById('nbtickets');
    if (nb) nb.innerHTML = rows.length;
        
    window.print();
        }
        

		</script>


		  <div class="overflow box-bordered" style="max-height: 70vh">
			<table id="dataTable" class="table table-bordered table-hover text-nowrap">
				<thead><tr><th colspan="7"><?= "<h3>".$_selling_report."</h3>". $hotspotname ?></th></tr></thead>
				<tr>
				  <th style="text-align:left;" colspan=5 ><?= $_selling_report ?> <?= $trange.$filedownload . $fprefix; ?><?= $sseller !== '' ? ' &mdash; ' . htmlspecialchars($ssellerName) : '' ?> &middot; <span id="nbtickets"></span> tickets vendus<b style="font-size:0;">,,,</b></th>
				  <th style="text-align:right;"><?= $_total ?></th>
				  <th style="text-align:right;" id="total"></th>
				</tr>
				<tr style="text-align:left;">
				  <th >&#8470;</th>
					<th ><?= $_date ?></th>
					<th ><?= $_time ?></th>
					<th ><?= $_user_name ?></th>
					<th ><?= $_profile ?></th>
					<th ><?= $_comment ?></th>
					<th style="text-align:right;"> <?= $_price; ?></th>
				</tr>
				
				<tbody id="tbody">
				<?php
			if ($fcomment != "" || $pcomment == "!!") {

				for ($i = 0; $i < $TotalReg; $i++) {
					$getname = explode("-|-", $getData[$i]['name']);
					if (strpos($getname[8], $fcomment) !== false){
						echo "<tr>";
						echo "<td>";
						
						$tgl = $getname[0];
						echo $tgl;
						echo "</td>";
						echo "<td>";
						$ltime = $getname[1];
						echo $ltime;
						echo "</td>";
						echo "<td>";
						$username = $getname[2];
						echo $username;
						echo "</td>";
						echo "<td>";
						$profile = $getname[7];
						echo $profile;
						echo "</td>";
						echo "<td>";
						$comment = $getname[8];
						echo trim((string) $comment) !== '' ? $comment : 'SaaS (en ligne)';
						echo "</td>";
						echo "<td style='text-align:right;'>";
						$price = $getname[3];
						echo $price;
						echo "</td>";
						echo "</tr>";
$shown[] = $getData[$i];
					}
				}
			} elseif ($prefix != "") {
				for ($i = 0; $i < $TotalReg; $i++) {
					$getname = explode("-|-", $getData[$i]['name']);
					if (substr($getname[2], 0, strlen($prefix)) == $prefix) {
						echo "<tr>";
						echo "<td>";
						
						$tgl = $getname[0];
						echo $tgl;
						echo "</td>";
						echo "<td>";
						$ltime = $getname[1];
						echo $ltime;
						echo "</td>";
						echo "<td>";
						$username = $getname[2];
						echo $username;
						echo "</td>";
						echo "<td>";
						$profile = $getname[7];
						echo $profile;
						echo "</td>";
						echo "<td>";
						$comment = $getname[8];
						echo trim((string) $comment) !== '' ? $comment : 'SaaS (en ligne)';
						echo "</td>";
						echo "<td style='text-align:right;'>";
						$price = $getname[3];
						echo $price;
						echo "</td>";
						echo "</tr>";
$shown[] = $getData[$i];
					}
				}
			} elseif ($range != "") {
			  $x = explode('-',$range)[0];
			  $y = explode('-',$range)[1];

        $range = range($x, $y);
        
				for ($i = 0; $i < $TotalReg; $i++) {
					$getname = explode("-|-", $getData[$i]['name']);
					$day = substr($getname[0],4,2); if(substr($day,0,1) == "0"){$day = substr($day,-1);}else{$day=$day;}
					if (in_array($day, $range)) {
						echo "<tr>";
						echo "<td>";
						
						$tgl = $getname[0];
						echo $tgl;
						echo "</td>";
						echo "<td>";
						$ltime = $getname[1];
						echo $ltime;
						echo "</td>";
						echo "<td>";
						$username = $getname[2];
						echo $username;
						echo "</td>";
						echo "<td>";
						$profile = $getname[7];
						echo $profile;
						echo "</td>";
						echo "<td>";
						$comment = $getname[8];
						echo trim((string) $comment) !== '' ? $comment : 'SaaS (en ligne)';
						echo "</td>";
						echo "<td style='text-align:right;'>";
						$price = $getname[3];
						echo $price;
						echo "</td>";
						echo "</tr>";
$shown[] = $getData[$i];
					}
				}
			} else {
				for ($i = 0; $i < $TotalReg; $i++) {
					$getname = explode("-|-", $getData[$i]['name']);
					echo "<tr>";
					echo "<td>";
					
					$tgl = $getname[0];
					echo $tgl;
					echo "</td>";
					echo "<td>";
					$ltime = $getname[1];
					echo $ltime;
					echo "</td>";
					echo "<td>";
					$username = $getname[2];
					echo $username;
					echo "</td>";
					echo "<td>";
					$profile = $getname[7];
					echo $profile;
					echo "</td>";
					echo "<td>";
					$comment = $getname[8];
					echo trim((string) $comment) !== '' ? $comment : 'SaaS (en ligne)';
					echo "</td>";
					echo "<td style='text-align:right;'>";
					$price = $getname[3];
					echo $price;
					echo "</td>";
					echo "</tr>";
$shown[] = $getData[$i];
				
				$dataresume .= $getname[0].$getname[3];
				$totalresume += $getname[3];
				$_SESSION['dataresume'] = $dataresume;
				$_SESSION['totalresume'] = $TotalReg.'/'.$totalresume;
				}
					
			}
			?>
			</tbody>
			</table>
		</div>
<?php include __DIR__ . '/seller_summary.php'; ?>

</div>
</div>
</div>
</body>
</html>
