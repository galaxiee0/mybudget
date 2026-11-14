// Éléments d'interface réutilisables : toasts, fenêtres modales, graphiques, états vides.
import { esc } from "./utils.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Affiche les icônes Lucide présentes dans la page (si la bibliothèque est chargée). */
export function refreshIcons() {
  try { window.lucide?.createIcons(); } catch { /* sans icônes, l'app reste utilisable */ }
}

export function toast(message, type = "ok") {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " error" : "");
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), type === "error" ? 5000 : 2800);
}

// ---------- Modales ----------
export function openModal({ title, content }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3>
        <button class="icon-btn" type="button" data-close aria-label="Fermer"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body">${content}</div>
    </div>`;
  document.body.appendChild(overlay);
  refreshIcons();

  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  $("[data-close]", overlay).addEventListener("click", close);
  $("input:not([type=radio]):not([type=hidden]), select", overlay)?.focus();
  return { el: $(".modal-body", overlay), close };
}

export function confirmDialog(message, confirmText = "Supprimer") {
  return new Promise((resolve) => {
    const m = openModal({
      title: "Confirmation",
      content: `<p style="margin:0 0 4px">${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn" type="button" data-no>Annuler</button>
          <button class="btn btn-danger-solid" type="button" data-yes>${esc(confirmText)}</button>
        </div>`,
    });
    let answered = false;
    const done = (v) => { if (!answered) { answered = true; resolve(v); } m.close(); };
    $("[data-no]", m.el).addEventListener("click", () => done(false));
    $("[data-yes]", m.el).addEventListener("click", () => done(true));
    // fermeture par Échap ou clic à l'extérieur = refus
    const watcher = new MutationObserver(() => {
      if (!document.body.contains(m.el)) { watcher.disconnect(); done(false); }
    });
    watcher.observe(document.body, { childList: true });
  });
}

/**
 * Branche un formulaire : désactive le bouton pendant l'enregistrement,
 * affiche l'erreur dans le formulaire, ferme/rafraîchit si tout s'est bien passé.
 * handler(formData, form) doit lever une Error (message lisible) en cas de problème.
 */
export function bindForm(form, handler) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("[type=submit]", form);
    const errBox = $(".form-error", form);
    if (errBox) errBox.hidden = true;
    const label = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = "Enregistrement…"; }
    try {
      await handler(new FormData(form), form);
    } catch (err) {
      if (errBox) { errBox.textContent = err.message || "Une erreur est survenue."; errBox.hidden = false; }
      else toast(err.message || "Une erreur est survenue.", "error");
    } finally {
      if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = label; }
    }
  });
}

// ---------- Graphiques ----------
let charts = [];
export function registerChart(chart) { charts.push(chart); return chart; }
export function destroyCharts() { charts.forEach((c) => { try { c.destroy(); } catch { /* déjà détruit */ } }); charts = []; }

export function chartTheme() {
  const css = getComputedStyle(document.documentElement);
  return {
    text: css.getPropertyValue("--muted").trim() || "#6a7080",
    grid: css.getPropertyValue("--border").trim() || "#e6e8ee",
    surface: css.getPropertyValue("--surface").trim() || "#fff",
    primary: css.getPropertyValue("--primary").trim() || "#4f46e5",
    green: css.getPropertyValue("--green").trim() || "#15803d",
    red: css.getPropertyValue("--red").trim() || "#c62828",
    font: getComputedStyle(document.body).fontFamily,
  };
}

export function makeChart(canvas, config) {
  if (!window.Chart) {
    canvas.parentElement.innerHTML = `<div class="empty">Les graphiques n'ont pas pu être chargés (connexion ?).</div>`;
    return null;
  }
  const t = chartTheme();
  window.Chart.defaults.font.family = t.font;
  window.Chart.defaults.color = t.text;
  config.options = { responsive: true, maintainAspectRatio: false, ...(config.options || {}) };
  return registerChart(new window.Chart(canvas, config));
}

// ---------- Blocs d'affichage ----------
export function emptyState(title, text, buttonHtml = "") {
  return `<div class="empty"><h4>${esc(title)}</h4><div>${esc(text)}</div>${buttonHtml}</div>`;
}

export function loadingBlock() {
  return `<div class="grid grid-4"><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div></div>
  <div class="skeleton" style="height:280px;margin-top:16px"></div>`;
}

export function errorBlock(message) {
  return `<div class="card"><div class="empty"><h4>Impossible de charger cette page</h4><div>${esc(message)}</div>
    <button class="btn" type="button" data-retry>Réessayer</button></div></div>`;
}

export function monthNavHtml(label) {
  return `<div class="month-nav">
    <button class="icon-btn" type="button" data-prev aria-label="Mois précédent"><i data-lucide="chevron-left"></i></button>
    <span>${esc(label)}</span>
    <button class="icon-btn" type="button" data-next aria-label="Mois suivant"><i data-lucide="chevron-right"></i></button>
  </div>`;
}

export function progressClass(spent, limit) {
  if (limit <= 0) return "";
  const r = spent / limit;
  if (r > 1) return "over";
  if (r >= 0.8) return "warn";
  return "";
}
