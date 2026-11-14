// Tableau de bord.
import * as api from "../api.js";
import { state, catById, catColor, catName, currency, expenseCategories } from "../state.js";
import {
  esc, formatMoney, monthLabel, shiftMonth, currentMonth, daysInMonth, pad, todayISO, pct,
} from "../utils.js";
import {
  makeChart, destroyCharts, chartTheme, emptyState, monthNavHtml, progressClass, refreshIcons, $,
} from "../ui.js";
import { txRow, openTransactionModal } from "./shared.js";

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

export async function render(el) {
  let month = state.month || currentMonth();
  const [txs, contribs] = await Promise.all([api.txLight(), api.listContributions()]);

  async function draw() {
    state.month = month;
    destroyCharts();
    const [budgets, recent] = await Promise.all([api.listBudgets(month), api.listTransactions({ limit: 6 })]);
    const cur = currency();
    const money = (c) => esc(formatMoney(c, cur));

    // ----- calculs (tout en centimes entiers) -----
    const income = (t) => (t.type === "income" ? t.amount_cents : 0);
    const expense = (t) => (t.type === "expense" ? t.amount_cents : 0);
    const totalIn = sum(txs, income);
    const totalOut = sum(txs, expense);
    const totalSaved = sum(contribs, (c) => c.amount_cents);
    const balance = totalIn - totalOut - totalSaved;

    const mtx = txs.filter((t) => t.occurred_on.startsWith(month));
    const mIncome = sum(mtx, income);
    const mExpense = sum(mtx, expense);
    const mSaved = sum(contribs.filter((c) => c.contributed_on.startsWith(month)), (c) => c.amount_cents);

    // ----- évolution du solde jour par jour -----
    const start = `${month}-01`;
    let running = sum(txs.filter((t) => t.occurred_on < start), (t) => income(t) - expense(t))
      - sum(contribs.filter((c) => c.contributed_on < start), (c) => c.amount_cents);
    const netByDay = new Map();
    mtx.forEach((t) => netByDay.set(t.occurred_on, (netByDay.get(t.occurred_on) || 0) + income(t) - expense(t)));
    contribs.filter((c) => c.contributed_on.startsWith(month))
      .forEach((c) => netByDay.set(c.contributed_on, (netByDay.get(c.contributed_on) || 0) - c.amount_cents));
    const cm = currentMonth();
    const lastDay = month === cm ? Number(todayISO().slice(8, 10)) : month > cm ? 0 : daysInMonth(month);
    const balLabels = [];
    const balData = [];
    for (let d = 1; d <= lastDay; d++) {
      running += netByDay.get(`${month}-${pad(d)}`) || 0;
      balLabels.push(String(d));
      balData.push(running / 100);
    }

    // ----- dépenses par catégorie -----
    const byCat = new Map();
    mtx.filter((t) => t.type === "expense").forEach((t) =>
      byCat.set(t.category_id || "none", (byCat.get(t.category_id || "none") || 0) + t.amount_cents));
    const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

    // ----- budget du mois -----
    const globalBudget = budgets.find((b) => b.category_id === null);
    const alerts = budgets
      .filter((b) => b.category_id)
      .map((b) => ({ cat: catById(b.category_id), limit: b.amount_cents, spent: byCat.get(b.category_id) || 0 }))
      .filter((a) => a.cat && a.spent >= a.limit * 0.8)
      .sort((a, b) => b.spent / b.limit - a.spent / a.limit);

    const hasAnyData = txs.length > 0;
    const fmtSigned = (c) => (c < 0 ? "−" : "") + money(Math.abs(c));

    el.innerHTML = `
      <div class="page-head">
        <h2>Bonjour ${esc(state.profile?.display_name || "")} 👋</h2>
        <div class="actions">
          ${monthNavHtml(monthLabel(month))}
          <button class="btn btn-primary" type="button" data-add><i data-lucide="plus"></i>Transaction</button>
        </div>
      </div>

      <div class="grid grid-4">
        <div class="card stat"><div class="label"><i data-lucide="wallet"></i>Solde disponible</div>
          <div class="value ${balance < 0 ? "neg" : ""}">${fmtSigned(balance)}</div><div class="sub">Revenus − dépenses − épargne</div></div>
        <div class="card stat"><div class="label"><i data-lucide="trending-up"></i>Revenus du mois</div>
          <div class="value pos">${money(mIncome)}</div></div>
        <div class="card stat"><div class="label"><i data-lucide="trending-down"></i>Dépenses du mois</div>
          <div class="value">${money(mExpense)}</div></div>
        <div class="card stat"><div class="label"><i data-lucide="piggy-bank"></i>Épargne du mois</div>
          <div class="value">${money(mSaved)}</div></div>
      </div>

      ${alerts.length ? `<div class="section">${alerts.map((a) => {
        const over = a.spent > a.limit;
        return `<div class="alert ${over ? "over" : "warn"}"><i data-lucide="alert-triangle"></i><div>
          <strong>${esc(a.cat.name)}</strong> : ${over ? "budget dépassé" : "budget bientôt atteint"}
          (${money(a.spent)} sur ${money(a.limit)}, ${pct(a.spent, a.limit)} %)</div></div>`;
      }).join("")}</div>` : ""}

      <div class="grid grid-2 section">
        <div class="card"><div class="card-head"><h3>Évolution du solde</h3></div>
          ${balData.length ? `<div class="chart-box"><canvas id="c-balance"></canvas></div>`
            : emptyState("Pas encore de données", "Ce mois n'a pas commencé.")}</div>
        <div class="card"><div class="card-head"><h3>Dépenses par catégorie</h3></div>
          ${catRows.length ? `<div class="chart-box"><canvas id="c-cats"></canvas></div>`
            : emptyState("Aucune dépense", "Ajoute une dépense pour voir la répartition.")}</div>
      </div>

      <div class="grid grid-2 section">
        <div class="card"><div class="card-head"><h3>Budget mensuel</h3>
          <a href="#/budgets" class="hint">Gérer</a></div>
          ${globalBudget ? (() => {
            const left = globalBudget.amount_cents - mExpense;
            return `<div class="progress ${progressClass(mExpense, globalBudget.amount_cents)}">
              <div style="width:${Math.min(100, pct(mExpense, globalBudget.amount_cents))}%"></div></div>
              <div class="meta"><span>${money(mExpense)} dépensés sur ${money(globalBudget.amount_cents)}</span>
              <span class="${left < 0 ? "neg" : ""}">${left < 0 ? "Dépassement de " + money(-left) : money(left) + " restants"}</span></div>`;
          })() : emptyState("Pas de budget défini", "Fixe un budget mensuel pour suivre ta progression.",
            `<a class="btn" href="#/budgets">Définir un budget</a>`)}
        </div>
        <div class="card"><div class="card-head"><h3>Dernières transactions</h3>
          <a href="#/transactions" class="hint">Tout voir</a></div>
          ${recent.length ? recent.map((t) => txRow(t)).join("")
            : emptyState("Aucune transaction", hasAnyData ? "Rien de récent." : "Commence par ajouter ta première transaction.",
              `<button class="btn btn-primary" type="button" data-add>Ajouter</button>`)}
        </div>
      </div>`;

    // ----- graphiques -----
    const t = chartTheme();
    if (balData.length) {
      makeChart($("#c-balance", el), {
        type: "line",
        data: { labels: balLabels, datasets: [{ data: balData, borderColor: t.primary, backgroundColor: t.primary + "22",
          fill: true, tension: 0.3, pointRadius: 2 }] },
        options: {
          plugins: { legend: { display: false },
            tooltip: { callbacks: { title: (i) => `Jour ${i[0].label}`, label: (c) => formatMoney(Math.round(c.parsed.y * 100), cur) } } },
          scales: { x: { grid: { display: false } }, y: { grid: { color: t.grid }, ticks: { callback: (v) => formatMoney(v * 100, cur) } } },
        },
      });
    }
    if (catRows.length) {
      makeChart($("#c-cats", el), {
        type: "doughnut",
        data: {
          labels: catRows.map(([id]) => (id === "none" ? "Sans catégorie" : catName(id))),
          datasets: [{ data: catRows.map(([, v]) => v / 100),
            backgroundColor: catRows.map(([id]) => catColor(catById(id))), borderColor: t.surface, borderWidth: 2 }],
        },
        options: {
          cutout: "62%",
          plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true } },
            tooltip: { callbacks: { label: (c) => `${c.label} : ${formatMoney(Math.round(c.parsed * 100), cur)}` } } },
        },
      });
    }

    // ----- événements -----
    const reload = async () => {
      const [t2, c2] = await Promise.all([api.txLight(), api.listContributions()]);
      txs.splice(0, txs.length, ...t2);
      contribs.splice(0, contribs.length, ...c2);
      await draw();
    };
    el.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => openTransactionModal({ onSaved: reload })));
    $("[data-prev]", el).addEventListener("click", async () => { month = shiftMonth(month, -1); await draw(); });
    $("[data-next]", el).addEventListener("click", async () => { month = shiftMonth(month, 1); await draw(); });
    refreshIcons();
  }

  await draw();
}
