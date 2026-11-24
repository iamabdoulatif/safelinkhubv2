<?php
// Récapitulatif par vendeur (inclus par selling.php et print.php).
// Attend : $shown (ventes affichées), $sellers_data, $currency, $cekindo.
if (!isset($shown)) { $shown = array(); }
$mkRate = 0.10;
$mkRows = mikhmon_seller_breakdown($shown, isset($sellers_data) ? $sellers_data : array(), $mkRate);
$mkTot = 0.0; $mkCom = 0.0; $mkCnt = 0;
foreach ($mkRows as $r) { $mkTot += $r['total']; $mkCom += $r['commission']; $mkCnt += $r['count']; }
$mkSaas = mikhmon_saas_sales_total($shown);
$mkMoney = function ($v) use ($currency, $cekindo) { return htmlspecialchars(mikhmon_format_money_amount($v, $currency, isset($cekindo) ? $cekindo : array())); };
$mkColors = array('#2563eb', '#16a34a', '#ea580c', '#9333ea', '#db2777', '#0891b2', '#ca8a04', '#64748b');
?>
<style>
.mk-sum{margin-top:14px;font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.mk-kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px}
.mk-kpi{flex:1 1 140px;border-radius:10px;padding:10px 14px;color:#fff}
.mk-kpi small{display:block;font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.85}
.mk-kpi b{font-size:18px}
.mk-sum h4{margin:6px 0 8px;font-size:15px}
.mk-sum table{width:100%;border-collapse:collapse}
.mk-sum th{background:#1e3a8a;color:#fff;padding:7px 8px;font-size:12px;text-align:left}
.mk-sum td{padding:7px 8px;border-bottom:1px solid rgba(100,116,139,.3);font-size:13px}
.mk-sum tbody tr:nth-child(even) td{background:rgba(100,116,139,.08)}
.mk-sum tfoot td{font-weight:700;border-top:2px solid #1e3a8a}
.mk-sum .r{text-align:right;white-space:nowrap}
.mk-bar{display:inline-block;width:90px;height:8px;border-radius:4px;background:rgba(100,116,139,.2);vertical-align:middle;margin-right:6px;overflow:hidden}
.mk-bar i{display:block;height:100%}
.mk-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
</style>
<div class="mk-sum">
  <div class="mk-kpis">
    <div class="mk-kpi" style="background:#1e3a8a"><small>Tickets physiques</small><b><?= $mkCnt ?></b></div>
    <div class="mk-kpi" style="background:#2563eb"><small>Ventes physiques</small><b><?= $mkMoney($mkTot) ?></b></div>
    <div class="mk-kpi" style="background:#ea580c"><small>Commissions <?= $mkRate * 100 ?>%</small><b><?= $mkMoney($mkCom) ?></b></div>
    <div class="mk-kpi" style="background:#16a34a"><small>Net après commissions</small><b><?= $mkMoney($mkTot - $mkCom) ?></b></div>
    <div class="mk-kpi" style="background:#7c3aed"><small>Ventes SaaS (hors calcul)</small><b><?= $mkMoney($mkSaas['total']) ?></b> &middot; <?= $mkSaas['count'] ?> tickets</div>
  </div>
  <h4>Récapitulatif par vendeur <small style="font-weight:400;opacity:.7">(ventes physiques, ventes SaaS exclues)</small></h4>
  <table id="sellerSummary">
    <thead><tr><th>Vendeur</th><th class="r">Tickets</th><th class="r">Montant vendu</th><th>Part</th><th class="r">Commission <?= $mkRate * 100 ?>%</th><th class="r">Net à reverser</th></tr></thead>
    <tbody>
    <?php foreach ($mkRows as $i => $r) { $c = $mkColors[$i % count($mkColors)]; ?>
      <tr>
        <td><span class="mk-dot" style="background:<?= $c ?>"></span><?= htmlspecialchars($r['name']) ?></td>
        <td class="r"><?= $r['count'] ?></td>
        <td class="r"><?= $mkMoney($r['total']) ?></td>
        <td style="white-space:nowrap"><span class="mk-bar"><i style="width:<?= $r['share'] ?>%;background:<?= $c ?>"></i></span><?= number_format($r['share'], 1, ',', ' ') ?> %</td>
        <td class="r"><?= $mkMoney($r['commission']) ?></td>
        <td class="r"><?= $mkMoney($r['net']) ?></td>
      </tr>
    <?php } if (!$mkRows) { echo '<tr><td colspan="6">Aucune vente</td></tr>'; } ?>
    </tbody>
    <tfoot><tr><td>Total</td><td class="r"><?= $mkCnt ?></td><td class="r"><?= $mkMoney($mkTot) ?></td><td>100 %</td><td class="r"><?= $mkMoney($mkCom) ?></td><td class="r"><?= $mkMoney($mkTot - $mkCom) ?></td></tr>
    <tr style="color:#7c3aed"><td>Ventes SaaS (en ligne) &mdash; hors calcul</td><td class="r"><?= $mkSaas['count'] ?></td><td class="r"><?= $mkMoney($mkSaas['total']) ?></td><td>&mdash;</td><td class="r">&mdash;</td><td class="r">&mdash;</td></tr></tfoot>
  </table>
</div>
