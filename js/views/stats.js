// Statistiques et analyses.
import * as api from "../api.js";
import { catById, catColor, catName, currency } from "../state.js";
import { esc, formatMoney, monthShort, monthLabel, shiftMonth, currentMonth, formatDate } from "../utils.js";
import { makeChart, destroyCharts, chartTheme, emptyState, refreshIcons, $ } from "../ui.js";

export async function render(el) {
  let range = 6;
  const [txs, contribs] = await Promise.all([api.txLight(), api.listContributions()]);

  function draw() {
    destroyCharts();
    const cur = currency();
    const money = (c) => esc(formatMoney(c, cur));
    const cm = currentMonth();
    const months = Array.from({ length: range }, (_, i) => shiftMonth(cm, i - (range - 1)));

    const inM = new Map(months.map((m) => [m, 0]));
    const outM = new Map(months.map((m) => [m, 0]));
    const savM = new Map(months.map((m) => [m, 0]));
    const catTotals = new Map();
    txs.forEach((t) => {
      const m = t.occurred_on.slice(0, 7);
      if (!inM.has(m)) return;
      if (t.type === "income") inM.set(m, inM.get(m) + t.amount_cents);
      else {
        outM.set(m, outM.get(m) + t.amount_cents);
        catTotals.set(t.category_id || "none", (catTotals.get(t.category_id || "none") || 0) + t.amount_cents);
      }
    });
    contribs.forEach((c) => { const m = c.contributed_on.slice(0, 7); if (savM.has(m)) savM.set(m, savM.get(m) + c.amount_cents); });

    // épargne cumulée (inclut ce qui a été épargné avant la période)
    let cum = contribs.filter((c) => c.contributed_on.slice(0, 7) < months[0]).reduce((a, c) => a + c.amount_cents, 0);
    const cumData = months.map((m) => { cum += savM.get(m); return cum / 100; });

    const ranking = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const top = ranking[0]?.[1] || 1;
    const hasData = txs.length > 0 || contribs.length > 0;

    el.innerHTML = `
      <div class="page-head"><h2>Statistiques</h2>
        <div class="actions"><select class="input" id="range" style="width:auto">
          ${[3, 6, 12].map((n) => `<option value="${n}" ${n === range ? "selected" : ""}>${n} derniers mois</option>`).join("")}</select></div></div>
      ${!hasData ? `<div class="card">${emptyState("Pas encore de données", "Ajoute des transactions pour voir tes statistiques.")}</div>` : `
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h3>Revenus et dépenses</h3></div><div class="chart-box"><canvas id="s-flow"></canvas></div></div>
        <div class="card"><div class="card-head"><h3>Évolution de l'épargne</h3></div><div class="chart-box"><canvas id="s-sav"></canvas></div></div>
      </div>
      <div class="grid grid-2 section">
        <div class="card"><div class="card-head"><h3>Catégories les plus coûteuses</h3></div>
          ${ranking.length ? ranking.map(([id, v]) => `<div class="rank-row">
            <div class="row" style="padding:0;border:0"><span class="dot" style="background:${esc(catColor(catById(id)))}"></span>${esc(id === "none" ? "Sans catégorie" : catName(id))}</div>
            <div class="amount">${money(v)}</div>
            <div class="progress"><div style="width:${Math.round((v / top) * 100)}%;background:${esc(catColor(catById(id)))}"></div></div></div>`).join("")
            : emptyState("Aucune dépense", "Sur cette période.")}</div>
        <div class="card"><div class="card-head"><h3>Répartition des dépenses</h3></div>
          ${ranking.length ? `<div class="chart-box sm"><canvas id="s-cats"></canvas></div>` : emptyState("Aucune dépense", "Sur cette période.")}</div>
      </div>
      <div class="card section"><div class="card-head"><h3>Historique financier</h3></div>
        <div class="table-wrap"><table><thead><tr><th>Mois</th><th>Revenus</th><th>Dépenses</th><th>Épargne</th><th>Solde du mois</th></tr></thead><tbody>
          ${[...months].reverse().map((m) => { const net = inM.get(m) - outM.get(m) - savM.get(m);
            return `<tr><td>${esc(monthLabel(m))}</td><td class="pos">${money(inM.get(m))}</td><td>${money(outM.get(m))}</td>
              <td>${money(savM.get(m))}</td><td class="${net < 0 ? "neg" : ""}">${net < 0 ? "−" : ""}${money(Math.abs(net))}</td></tr>`; }).join("")}
        </tbody></table></div></div>`}`;
    refreshIcons();

    $("#range", el).addEventListener("change", (e) => { range = Number(e.target.value); draw(); });
    if (!hasData) return;

    const t = chartTheme();
    const fmt = (v) => formatMoney(Math.round(v * 100), cur);
    const scales = { x: { grid: { display: false } }, y: { grid: { color: t.grid }, beginAtZero: true, ticks: { callback: (v) => fmt(v) } } };
    makeChart($("#s-flow", el), {
      type: "bar",
      data: { labels: months.map(monthShort), datasets: [
        { label: "Revenus", data: months.map((m) => inM.get(m) / 100), backgroundColor: t.green, borderRadius: 4 },
        { label: "Dépenses", data: months.map((m) => outM.get(m) / 100), backgroundColor: t.red, borderRadius: 4 }] },
      options: { scales, plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label} : ${fmt(c.parsed.y)}` } } } },
    });
    makeChart($("#s-sav", el), {
      type: "line",
      data: { labels: months.map(monthShort), datasets: [{ label: "Épargne cumulée", data: cumData, borderColor: t.primary,
        backgroundColor: t.primary + "22", fill: true, tension: 0.3 }] },
      options: { scales, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt(c.parsed.y) } } } },
    });
    if (ranking.length) makeChart($("#s-cats", el), {
      type: "doughnut",
      data: { labels: ranking.map(([id]) => (id === "none" ? "Sans catégorie" : catName(id))),
        datasets: [{ data: ranking.map(([, v]) => v / 100), backgroundColor: ranking.map(([id]) => catColor(catById(id))),
          borderColor: t.surface, borderWidth: 2 }] },
      options: { cutout: "62%", plugins: { legend: { position: "right", labels: { boxWidth: 10, usePointStyle: true } },
        tooltip: { callbacks: { label: (c) => `${c.label} : ${fmt(c.parsed)}` } } } },
    });
  }
  draw();
}
