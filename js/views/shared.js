// Morceaux d'interface partagés entre plusieurs pages.
import { esc, formatDate, formatMoney, parseAmount, centsToInput, todayISO } from "../utils.js";
import { state, catById, catColor, currency } from "../state.js";
import { openModal, bindForm, toast } from "../ui.js";
import * as api from "../api.js";

/** Une ligne de transaction (liste). */
export function txRow(t, withActions = false) {
  const cat = catById(t.category_id);
  const isIncome = t.type === "income";
  const title = t.description || cat?.name || (isIncome ? "Revenu" : "Dépense");
  return `<div class="row">
    <span class="dot" style="background:${esc(catColor(cat))}"></span>
    <div class="row-main">
      <div class="row-title">${esc(title)}</div>
      <div class="row-sub">${esc(cat?.name || "Sans catégorie")} · ${esc(formatDate(t.occurred_on))}</div>
    </div>
    <div class="amount ${isIncome ? "income" : ""}">${isIncome ? "+" : "−"} ${esc(formatMoney(t.amount_cents, currency()))}</div>
    ${withActions ? `<div class="row-actions">
      <button class="icon-btn" type="button" data-edit="${esc(t.id)}" aria-label="Modifier"><i data-lucide="pencil"></i></button>
      <button class="icon-btn" type="button" data-del="${esc(t.id)}" aria-label="Supprimer"><i data-lucide="trash-2"></i></button>
    </div>` : ""}
  </div>`;
}

function categoryOptions(type, selectedId) {
  const opts = state.categories.filter((c) => c.kind === type)
    .map((c) => `<option value="${esc(c.id)}" ${c.id === selectedId ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  return `<option value="">Sans catégorie</option>${opts}`;
}

/** Fenêtre d'ajout / modification d'une transaction. onSaved() est appelé après l'enregistrement. */
export function openTransactionModal({ tx = null, type = "expense", onSaved }) {
  const t = tx?.type || type;
  const m = openModal({
    title: tx ? "Modifier la transaction" : t === "income" ? "Nouveau revenu" : "Nouvelle dépense",
    content: `<form id="tx-form" novalidate>
      <div class="form-error" hidden></div>
      <div class="segmented">
        <label><input type="radio" name="type" value="expense" ${t === "expense" ? "checked" : ""}><span>Dépense</span></label>
        <label><input type="radio" name="type" value="income" ${t === "income" ? "checked" : ""}><span>Revenu</span></label>
      </div>
      <div class="field"><label for="tx-amount">Montant (${esc(currency())})</label>
        <input class="input" id="tx-amount" name="amount" inputmode="decimal" placeholder="0,00" autocomplete="off"
          value="${tx ? esc(centsToInput(tx.amount_cents)) : ""}" required /></div>
      <div class="field-row">
        <div class="field"><label for="tx-cat">Catégorie</label>
          <select class="input" id="tx-cat" name="category">${categoryOptions(t, tx?.category_id)}</select></div>
        <div class="field"><label for="tx-date">Date</label>
          <input class="input" id="tx-date" name="date" type="date" value="${esc(tx?.occurred_on || todayISO())}" required /></div>
      </div>
      <div class="field"><label for="tx-desc">Description (facultatif)</label>
        <input class="input" id="tx-desc" name="description" maxlength="200" value="${esc(tx?.description || "")}" /></div>
      <div class="modal-actions">
        <button class="btn" type="button" data-cancel>Annuler</button>
        <button class="btn btn-primary" type="submit">Enregistrer</button>
      </div>
    </form>`,
  });
  const form = m.el.querySelector("#tx-form");
  m.el.querySelector("[data-cancel]").addEventListener("click", m.close);

  // Quand on change entre Dépense / Revenu, la liste des catégories s'adapte.
  form.querySelectorAll("[name=type]").forEach((r) => r.addEventListener("change", () => {
    form.querySelector("#tx-cat").innerHTML = categoryOptions(r.value, null);
  }));

  bindForm(form, async (fd) => {
    const cents = parseAmount(fd.get("amount"));
    if (!cents) throw new Error("Entre un montant valide (ex. 12,50).");
    const date = String(fd.get("date") || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choisis une date.");
    const row = {
      type: fd.get("type"),
      amount_cents: cents,
      category_id: fd.get("category") || null,
      occurred_on: date,
      description: String(fd.get("description") || "").trim() || null,
    };
    if (tx) await api.updateTransaction(tx.id, row);
    else await api.addTransaction(row);
    m.close();
    toast(tx ? "Transaction modifiée" : "Transaction ajoutée");
    await onSaved?.();
  });
}
