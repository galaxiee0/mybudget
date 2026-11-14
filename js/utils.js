// Fonctions utilitaires : montants, dates, sécurité du texte.

/** Échappe le texte avant de l'insérer dans du HTML (protège contre l'injection de code). */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// ---------- Montants (toujours en centimes entiers) ----------

/** "12,50" ou "12.5" -> 1250. Retourne null si invalide ou <= 0. Aucun calcul décimal. */
export function parseAmount(input) {
  const s = String(input ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  const cents = Number(int) * 100 + Number(dec.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

/** 1250 -> "12,50" (pour pré-remplir un champ). */
export function centsToInput(cents) {
  const a = Math.abs(cents);
  return `${Math.floor(a / 100)},${String(a % 100).padStart(2, "0")}`;
}

/** 1250 -> "12,50 €" (affichage uniquement). */
export function formatMoney(cents, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

// ---------- Dates ----------
export const pad = (n) => String(n).padStart(2, "0");

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const currentMonth = () => todayISO().slice(0, 7);

export function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export const monthStart = (month) => `${month}-01`;
export const nextMonthStart = (month) => `${shiftMonth(month, 1)}-01`;

export function daysInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
export function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function monthShort(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}
export function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
export function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + "T00:00:00");
  const b = new Date(toISO + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

/** Pourcentage entier (0 si la base est nulle). */
export const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

// ---------- CSV ----------
/** Protège contre l'injection de formules dans Excel (cellules commençant par = + - @). */
export function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
export function centsToPlain(cents) {
  const sign = cents < 0 ? "-" : "";
  const a = Math.abs(cents);
  return `${sign}${Math.floor(a / 100)},${String(a % 100).padStart(2, "0")}`;
}
