// Thème clair / sombre (préférence gardée dans le navigateur, facultatif).
export function getTheme() {
  try { return localStorage.getItem("mybudget-theme") || "auto"; } catch { return "auto"; }
}
export function applyTheme(mode) {
  try { localStorage.setItem("mybudget-theme", mode); } catch { /* sans stockage, le thème n'est pas mémorisé */ }
  const dark = mode === "dark" || (mode === "auto" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
