// Objectifs d'épargne.
import * as api from "../api.js";
import { currency } from "../state.js";
import { esc, currencyLabel, amountPlaceholder, formatMoney, formatDate, parseAmount, todayISO, pct, daysBetween } from "../utils.js";
import { openModal, bindForm, toast, confirmDialog, emptyState, refreshIcons, $ } from "../ui.js";

export async function render(el) {
  async function draw() {
    const [goals, contribs] = await Promise.all([api.listGoals(), api.listContributions()]);
    const cur = currency();
    const money = (c) => esc(formatMoney(c, cur));
    const saved = (id) => contribs.filter((c) => c.goal_id === id).reduce((a, c) => a + c.amount_cents, 0);
    const active = goals.filter((g) => saved(g.id) < g.target_cents);
    const done = goals.filter((g) => saved(g.id) >= g.target_cents);

    const card = (g) => {
      const s = saved(g.id);
      const isDone = s >= g.target_cents;
      const left = g.deadline ? daysBetween(todayISO(), g.deadline) : null;
      const mine = contribs.filter((c) => c.goal_id === g.id).slice(0, 5);
      return `<div class="card">
        <div class="card-head"><div><h3>${esc(g.name)}</h3>
          <div class="row-sub">${g.deadline ? `Échéance : ${esc(formatDate(g.deadline))}${!isDone && left !== null ? ` · ${left >= 0 ? left + " j restants" : "échéance dépassée"}` : ""}` : "Sans échéance"}</div></div>
          ${isDone ? `<span class="badge ok">Terminé</span>` : ""}</div>
        <div class="progress ${isDone ? "done" : ""}"><div style="width:${Math.min(100, pct(s, g.target_cents))}%"></div></div>
        <div class="meta"><span>${money(s)} / ${money(g.target_cents)} (${pct(s, g.target_cents)} %)</span>
          <span>${isDone ? "Objectif atteint 🎉" : money(g.target_cents - s) + " à épargner"}</span></div>
        ${mine.length ? `<details><summary>Dernières contributions</summary>${mine.map((c) => `<div class="row">
          <div class="row-main"><div class="row-sub">${esc(formatDate(c.contributed_on))}</div></div>
          <div class="amount">${money(c.amount_cents)}</div>
          <button class="icon-btn" data-delc="${esc(c.id)}" aria-label="Supprimer"><i data-lucide="trash-2"></i></button></div>`).join("")}</details>` : ""}
        <div class="actions" style="margin-top:14px">
          ${isDone ? "" : `<button class="btn btn-primary btn-sm" data-contrib="${esc(g.id)}"><i data-lucide="plus"></i>Ajouter de l'argent</button>`}
          <button class="btn btn-sm btn-danger" data-delg="${esc(g.id)}"><i data-lucide="trash-2"></i>Supprimer</button></div></div>`;
    };

    el.innerHTML = `
      <div class="page-head"><h2>Épargne</h2>
        <div class="actions"><button class="btn btn-primary" data-new><i data-lucide="plus"></i>Nouvel objectif</button></div></div>
      ${active.length ? `<div class="grid grid-2">${active.map(card).join("")}</div>`
        : `<div class="card">${emptyState("Aucun objectif en cours", "Crée un objectif (voyage, ordinateur, fonds d'urgence…) et suis ta progression.")}</div>`}
      ${done.length ? `<h3 class="section" style="margin-bottom:12px">Objectifs terminés</h3><div class="grid grid-2">${done.map(card).join("")}</div>` : ""}`;
    refreshIcons();

    $("[data-new]", el).addEventListener("click", () => goalModal(draw));
    el.querySelectorAll("[data-contrib]").forEach((b) => b.addEventListener("click", () => contribModal(b.dataset.contrib, draw)));
    el.querySelectorAll("[data-delg]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("Supprimer cet objectif et toutes ses contributions ?"))) return;
      try { await api.deleteGoal(b.dataset.delg); toast("Objectif supprimé"); await draw(); } catch (e) { toast(e.message, "error"); }
    }));
    el.querySelectorAll("[data-delc]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("Supprimer cette contribution ?"))) return;
      try { await api.deleteContribution(b.dataset.delc); toast("Contribution supprimée"); await draw(); } catch (e) { toast(e.message, "error"); }
    }));
  }
  await draw();
}

function goalModal(refresh) {
  const m = openModal({
    title: "Nouvel objectif d'épargne",
    content: `<form id="g-form" novalidate><div class="form-error" hidden></div>
      <div class="field"><label>Nom</label><input class="input" name="name" maxlength="80" required /></div>
      <div class="field-row"><div class="field"><label>Montant cible (${esc(currencyLabel(currency()))})</label>
        <input class="input" name="target" inputmode="decimal" placeholder="${amountPlaceholder()}" required /></div>
        <div class="field"><label>Échéance (facultatif)</label><input class="input" type="date" name="deadline" min="${todayISO()}" /></div></div>
      <div class="modal-actions"><button class="btn" type="button" data-cancel>Annuler</button>
        <button class="btn btn-primary" type="submit">Créer</button></div></form>`,
  });
  $("[data-cancel]", m.el).addEventListener("click", m.close);
  bindForm($("#g-form", m.el), async (fd) => {
    const name = String(fd.get("name") || "").trim();
    const target = parseAmount(fd.get("target"));
    if (!name) throw new Error("Donne un nom à l'objectif.");
    if (!target) throw new Error("Entre un montant cible valide.");
    await api.addGoal({ name, target_cents: target, deadline: fd.get("deadline") || null });
    m.close(); toast("Objectif créé"); await refresh();
  });
}

function contribModal(goalId, refresh) {
  const m = openModal({
    title: "Ajouter à l'épargne",
    content: `<form id="c-form" novalidate><div class="form-error" hidden></div>
      <div class="field-row"><div class="field"><label>Montant (${esc(currencyLabel(currency()))})</label>
        <input class="input" name="amount" inputmode="decimal" placeholder="${amountPlaceholder()}" required /></div>
        <div class="field"><label>Date</label><input class="input" type="date" name="date" value="${todayISO()}" required /></div></div>
      <div class="modal-actions"><button class="btn" type="button" data-cancel>Annuler</button>
        <button class="btn btn-primary" type="submit">Ajouter</button></div></form>`,
  });
  $("[data-cancel]", m.el).addEventListener("click", m.close);
  bindForm($("#c-form", m.el), async (fd) => {
    const amount = parseAmount(fd.get("amount"));
    if (!amount) throw new Error("Entre un montant valide.");
    await api.addContribution({ goal_id: goalId, amount_cents: amount, contributed_on: String(fd.get("date")) });
    m.close(); toast("Contribution ajoutée"); await refresh();
  });
}
