// Paramètres : profil, devise, catégories, export CSV, compte.
import * as api from "../api.js";
import { sb } from "../supabase.js";
import { state, catName } from "../state.js";
import { esc, csvCell, centsToPlain } from "../utils.js";
import { bindForm, toast, confirmDialog, openModal, refreshIcons, $ } from "../ui.js";
import { applyTheme, getTheme } from "../theme.js";

const CURRENCIES = [
  ["EUR", "EUR — Euro"], ["XOF", "FCFA — Afrique de l'Ouest (XOF)"], ["XAF", "FCFA — Afrique centrale (XAF)"],
  ["USD", "USD — Dollar US"], ["GBP", "GBP — Livre sterling"], ["CHF", "CHF — Franc suisse"], ["CAD", "CAD — Dollar canadien"],
];

export async function render(el) {
  async function draw() {
    const p = state.profile;
    const cats = (kind) => state.categories.filter((c) => c.kind === kind);
    const catList = (kind) => cats(kind).map((c) => `<div class="row">
      <div class="row-main">${esc(c.name)}</div>
      <button class="icon-btn" data-ren="${esc(c.id)}" aria-label="Renommer"><i data-lucide="pencil"></i></button>
      <button class="icon-btn" data-delcat="${esc(c.id)}" aria-label="Supprimer"><i data-lucide="trash-2"></i></button></div>`).join("")
      || `<div class="hint">Aucune catégorie.</div>`;

    el.innerHTML = `
      <div class="page-head"><h2>Paramètres</h2></div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h3>Informations personnelles</h3></div>
          <form id="p-form" novalidate><div class="form-error" hidden></div>
          <div class="field"><label>Email</label><input class="input" value="${esc(state.user.email)}" disabled /></div>
          <div class="field"><label>Prénom ou pseudo</label><input class="input" name="name" maxlength="40" value="${esc(p?.display_name || "")}" /></div>
          <div class="field"><label>Devise</label><select class="input" name="currency">
            ${CURRENCIES.map(([code, label]) => `<option value="${code}" ${code === p?.currency ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>
            <span class="hint">Changer de devise ne convertit pas tes montants : seule l'unité affichée change.</span></div>
          <div class="field"><label>Affichage</label><select class="input" name="theme">
            ${[["auto", "Automatique"], ["light", "Clair"], ["dark", "Sombre"]].map(([v, l]) => `<option value="${v}" ${v === getTheme() ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <button class="btn btn-primary" type="submit">Enregistrer</button></form></div>

        <div class="card"><div class="card-head"><h3>Mot de passe</h3></div>
          <form id="pw-form" novalidate><div class="form-error" hidden></div>
          <div class="field"><label>Nouveau mot de passe</label><input class="input" type="password" name="password" minlength="8" autocomplete="new-password" /></div>
          <button class="btn" type="submit">Changer le mot de passe</button></form>
          <div class="card-head" style="margin-top:26px"><h3>Export</h3></div>
          <p class="hint" style="margin-top:0">Télécharge toutes tes transactions au format CSV (lisible dans Excel).</p>
          <button class="btn" type="button" data-export><i data-lucide="download"></i>Exporter en CSV</button></div>
      </div>

      <div class="grid grid-2 section">
        <div class="card"><div class="card-head"><h3>Catégories de dépenses</h3>
          <button class="btn btn-sm" data-addcat="expense"><i data-lucide="plus"></i>Ajouter</button></div>${catList("expense")}</div>
        <div class="card"><div class="card-head"><h3>Catégories de revenus</h3>
          <button class="btn btn-sm" data-addcat="income"><i data-lucide="plus"></i>Ajouter</button></div>${catList("income")}</div>
      </div>`;
    refreshIcons();

    bindForm($("#p-form", el), async (fd) => {
      const name = String(fd.get("name") || "").trim();
      state.profile = await api.updateProfile({ display_name: name || null, currency: fd.get("currency") });
      applyTheme(fd.get("theme"));
      document.dispatchEvent(new CustomEvent("profile-updated"));
      toast("Paramètres enregistrés");
    });
    bindForm($("#pw-form", el), async (fd, form) => {
      const pw = String(fd.get("password") || "");
      if (pw.length < 8) throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
      await api.updatePassword(pw); form.reset(); toast("Mot de passe modifié");
    });

    $("[data-export]", el).addEventListener("click", async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const rows = await api.txFull();
        const head = ["Date", "Type", "Catégorie", "Description", "Montant"];
        const lines = rows.map((t) => [t.occurred_on, t.type === "income" ? "Revenu" : "Dépense",
          t.category_id ? catName(t.category_id) : "", t.description || "",
          centsToPlain(t.type === "income" ? t.amount_cents : -t.amount_cents)].map(csvCell).join(";"));
        const csv = "﻿" + [head.map(csvCell).join(";"), ...lines].join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const a = Object.assign(document.createElement("a"), { href: url, download: "mybudget-transactions.csv" });
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        toast(`${rows.length} transaction(s) exportée(s)`);
      } catch (err) { toast(err.message, "error"); } finally { btn.disabled = false; }
    });

    const reloadCats = async () => { state.categories = await api.listCategories(); await draw(); };
    el.querySelectorAll("[data-addcat]").forEach((b) => b.addEventListener("click", () => catModal({ kind: b.dataset.addcat, onSaved: reloadCats })));
    el.querySelectorAll("[data-ren]").forEach((b) => b.addEventListener("click", () =>
      catModal({ cat: state.categories.find((c) => c.id === b.dataset.ren), onSaved: reloadCats })));
    el.querySelectorAll("[data-delcat]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("Supprimer cette catégorie ? Les transactions liées seront conservées sans catégorie, et ses budgets supprimés."))) return;
      try { await api.deleteCategory(b.dataset.delcat); toast("Catégorie supprimée"); await reloadCats(); } catch (e) { toast(e.message, "error"); }
    }));
  }
  await draw();
}

function catModal({ kind, cat, onSaved }) {
  const m = openModal({
    title: cat ? "Renommer la catégorie" : "Nouvelle catégorie",
    content: `<form id="cat-form" novalidate><div class="form-error" hidden></div>
      <div class="field"><label>Nom</label><input class="input" name="name" maxlength="50" value="${esc(cat?.name || "")}" required /></div>
      <div class="modal-actions"><button class="btn" type="button" data-cancel>Annuler</button>
        <button class="btn btn-primary" type="submit">Enregistrer</button></div></form>`,
  });
  $("[data-cancel]", m.el).addEventListener("click", m.close);
  bindForm($("#cat-form", m.el), async (fd) => {
    const name = String(fd.get("name") || "").trim();
    if (!name) throw new Error("Donne un nom à la catégorie.");
    if (cat) await api.renameCategory(cat.id, name); else await api.addCategory(name, kind);
    m.close(); toast("Catégorie enregistrée"); await onSaved();
  });
}
