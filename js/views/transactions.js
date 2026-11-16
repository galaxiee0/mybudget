// Historique des transactions avec filtres.
import * as api from "../api.js";
import { state, catName, currency } from "../state.js";
import { esc, parseAmount, formatMoney, amountPlaceholder } from "../utils.js";
import { emptyState, confirmDialog, toast, refreshIcons, $ } from "../ui.js";
import { txRow, openTransactionModal } from "./shared.js";

const PAGE = 50;

export async function render(el) {
  const f = { type: "", categoryId: "", from: "", to: "", min: "", max: "", search: "" };
  let items = [];
  let more = false;

  function catOptions() {
    return `<option value="">Toutes</option><option value="none">Sans catégorie</option>` +
      state.categories.map((c) => `<option value="${esc(c.id)}" ${f.categoryId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  }

  function query() {
    const min = f.min ? parseAmount(f.min) : null;
    const max = f.max ? parseAmount(f.max) : null;
    return {
      type: f.type || undefined, categoryId: f.categoryId || undefined,
      from: f.from || undefined, to: f.to || undefined,
      minCents: min || undefined, maxCents: max || undefined, search: f.search.trim() || undefined,
    };
  }

  async function load(append = false) {
    const rows = await api.listTransactions({ ...query(), limit: PAGE + 1, offset: append ? items.length : 0 });
    more = rows.length > PAGE;
    const page = rows.slice(0, PAGE);
    items = append ? items.concat(page) : page;
  }

  function list() {
    const box = $("#tx-list", el);
    if (!items.length) {
      box.innerHTML = emptyState("Aucune transaction", "Aucun résultat avec ces filtres.");
      return;
    }
    box.innerHTML = items.map((t) => txRow(t, true)).join("") +
      (more ? `<div style="text-align:center;margin-top:12px"><button class="btn" type="button" data-more>Charger plus</button></div>` : "");
    refreshIcons();
    $("[data-more]", box)?.addEventListener("click", async () => { await load(true); list(); });
    box.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      openTransactionModal({ tx: items.find((t) => t.id === b.dataset.edit), onSaved: refresh });
    }));
    box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("Supprimer cette transaction ?"))) return;
      try { await api.deleteTransaction(b.dataset.del); toast("Transaction supprimée"); await refresh(); }
      catch (e) { toast(e.message, "error"); }
    }));
  }

  async function refresh() { await load(); list(); }

  el.innerHTML = `
    <div class="page-head"><h2>Transactions</h2>
      <div class="actions"><button class="btn btn-primary" type="button" data-add><i data-lucide="plus"></i>Ajouter</button></div></div>
    <div class="card">
      <form class="filters" id="filters">
        <div class="field"><label>Type</label><select class="input" name="type">
          <option value="">Tous</option><option value="expense">Dépenses</option><option value="income">Revenus</option></select></div>
        <div class="field"><label>Catégorie</label><select class="input" name="categoryId">${catOptions()}</select></div>
        <div class="field"><label>Du</label><input class="input" type="date" name="from" /></div>
        <div class="field"><label>Au</label><input class="input" type="date" name="to" /></div>
        <div class="field"><label>Montant min.</label><input class="input" name="min" inputmode="decimal" placeholder="${amountPlaceholder()}" /></div>
        <div class="field"><label>Montant max.</label><input class="input" name="max" inputmode="decimal" placeholder="${amountPlaceholder()}" /></div>
      </form>
      <div class="field" style="margin:12px 0 0"><input class="input" id="search" placeholder="Rechercher dans les descriptions…" /></div>
    </div>
    <div class="card section" id="tx-list"></div>`;
  refreshIcons();

  $("[data-add]", el).addEventListener("click", () => openTransactionModal({ onSaved: refresh }));

  let timer;
  const apply = () => { clearTimeout(timer); timer = setTimeout(async () => {
    try { await refresh(); } catch (e) { toast(e.message, "error"); }
  }, 250); };
  $("#filters", el).addEventListener("input", (e) => { f[e.target.name] = e.target.value; apply(); });
  $("#search", el).addEventListener("input", (e) => { f.search = e.target.value; apply(); });

  await refresh();
}
