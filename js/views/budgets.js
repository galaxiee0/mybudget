// Budgets mensuels : global et par catégorie.
import * as api from "../api.js";
import { state, catById, catColor, currency, expenseCategories } from "../state.js";
import { esc, currencyLabel, amountPlaceholder, formatMoney, monthLabel, shiftMonth, currentMonth, parseAmount, centsToInput, pct } from "../utils.js";
import { openModal, bindForm, toast, confirmDialog, monthNavHtml, progressClass, emptyState, refreshIcons, $ } from "../ui.js";

export async function render(el) {
  let month = state.month || currentMonth();

  async function draw() {
    state.month = month;
    const [budgets, expenses] = await Promise.all([api.listBudgets(month), api.txExpensesOfMonth(month)]);
    const cur = currency();
    const money = (c) => esc(formatMoney(c, cur));
    const spentBy = new Map();
    let spentTotal = 0;
    expenses.forEach((t) => {
      spentTotal += t.amount_cents;
      spentBy.set(t.category_id, (spentBy.get(t.category_id) || 0) + t.amount_cents);
    });
    const global = budgets.find((b) => !b.category_id);
    const perCat = budgets.filter((b) => b.category_id && catById(b.category_id));
    const unbudgeted = expenseCategories().filter((c) => !perCat.some((b) => b.category_id === c.id));

    const bar = (spent, limit) => `
      <div class="progress ${progressClass(spent, limit)}"><div style="width:${Math.min(100, pct(spent, limit))}%"></div></div>
      <div class="meta"><span>${money(spent)} / ${money(limit)} (${pct(spent, limit)} %)</span>
        <span class="${spent > limit ? "neg" : ""}">${spent > limit ? "Dépassé de " + money(spent - limit) : money(limit - spent) + " restants"}</span></div>`;

    el.innerHTML = `
      <div class="page-head"><h2>Budgets</h2>
        <div class="actions">${monthNavHtml(monthLabel(month))}
          <button class="btn btn-primary" type="button" data-set><i data-lucide="plus"></i>Définir un budget</button></div></div>

      <div class="card"><div class="card-head"><h3>Budget global du mois</h3>
        ${global ? `<div class="row-actions"><button class="icon-btn" data-edit-global aria-label="Modifier"><i data-lucide="pencil"></i></button>
          <button class="icon-btn" data-del="${esc(global.id)}" aria-label="Supprimer"><i data-lucide="trash-2"></i></button></div>` : ""}</div>
        ${global ? bar(spentTotal, global.amount_cents)
          : emptyState("Aucun budget global", "Définis combien tu veux dépenser au maximum ce mois-ci.")}</div>

      <div class="card section"><div class="card-head"><h3>Budgets par catégorie</h3></div>
        ${perCat.length ? perCat.map((b) => {
          const c = catById(b.category_id);
          return `<div style="margin-bottom:18px"><div class="card-head" style="margin-bottom:8px">
            <div class="row" style="padding:0;border:0"><span class="dot" style="background:${esc(catColor(c))}"></span><strong>${esc(c.name)}</strong></div>
            <div class="row-actions"><button class="icon-btn" data-edit-cat="${esc(b.category_id)}" aria-label="Modifier"><i data-lucide="pencil"></i></button>
            <button class="icon-btn" data-del="${esc(b.id)}" aria-label="Supprimer"><i data-lucide="trash-2"></i></button></div></div>
            ${bar(spentBy.get(b.category_id) || 0, b.amount_cents)}</div>`;
        }).join("") : emptyState("Aucun budget par catégorie", "Fixe une limite pour une catégorie (Alimentation, Loisirs…).")}
        ${unbudgeted.length && spentTotal ? `<details><summary>Dépenses des catégories sans budget</summary>
          ${unbudgeted.filter((c) => spentBy.get(c.id)).map((c) => `<div class="row"><span class="dot" style="background:${esc(catColor(c))}"></span>
            <div class="row-main">${esc(c.name)}</div><div class="amount">${money(spentBy.get(c.id))}</div></div>`).join("") || `<div class="hint" style="margin-top:8px">Aucune.</div>`}</details>` : ""}
      </div>`;
    refreshIcons();

    const refresh = draw;
    $("[data-prev]", el).addEventListener("click", async () => { month = shiftMonth(month, -1); await draw(); });
    $("[data-next]", el).addEventListener("click", async () => { month = shiftMonth(month, 1); await draw(); });
    $("[data-set]", el).addEventListener("click", () => budgetModal({ month, refresh }));
    $("[data-edit-global]", el)?.addEventListener("click", () => budgetModal({ month, refresh, categoryId: "", cents: global.amount_cents }));
    el.querySelectorAll("[data-edit-cat]").forEach((b) => b.addEventListener("click", () => {
      const bud = perCat.find((x) => x.category_id === b.dataset.editCat);
      budgetModal({ month, refresh, categoryId: bud.category_id, cents: bud.amount_cents });
    }));
    el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("Supprimer ce budget ?"))) return;
      try { await api.deleteBudget(b.dataset.del); toast("Budget supprimé"); await draw(); }
      catch (e) { toast(e.message, "error"); }
    }));
  }

  await draw();
}

function budgetModal({ month, refresh, categoryId = null, cents = null }) {
  const editing = categoryId !== null;
  const opts = `<option value="">Budget global (toutes catégories)</option>` +
    expenseCategories().map((c) => `<option value="${esc(c.id)}" ${c.id === categoryId ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  const m = openModal({
    title: `Budget — ${monthLabel(month)}`,
    content: `<form id="b-form" novalidate><div class="form-error" hidden></div>
      <div class="field"><label>Pour</label><select class="input" name="category" ${editing ? "disabled" : ""}>${opts}</select></div>
      <div class="field"><label>Montant maximum (${esc(currencyLabel(currency()))})</label>
        <input class="input" name="amount" inputmode="decimal" placeholder="${amountPlaceholder()}" value="${cents ? esc(centsToInput(cents)) : ""}" required /></div>
      <p class="hint" style="margin:0">Si un budget existe déjà pour ce choix, il sera mis à jour.</p>
      <div class="modal-actions"><button class="btn" type="button" data-cancel>Annuler</button>
        <button class="btn btn-primary" type="submit">Enregistrer</button></div></form>`,
  });
  $("[data-cancel]", m.el).addEventListener("click", m.close);
  bindForm($("#b-form", m.el), async (fd) => {
    const amount = parseAmount(fd.get("amount"));
    if (!amount) throw new Error("Entre un montant valide (ex. 300).");
    await api.setBudget(month, editing ? categoryId || null : fd.get("category") || null, amount);
    m.close(); toast("Budget enregistré"); await refresh();
  });
}
