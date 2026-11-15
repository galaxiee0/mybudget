// Thème clair / sombre.
// Choix possibles : "auto" (suit l'appareil), "light", "dark".
// Le choix est mémorisé dans le navigateur (facultatif : sans stockage, l'app reste utilisable).
const KEY = "mybudget-theme";
const dark = () => window.matchMedia?.("(prefers-color-scheme: dark)");

export function getTheme() {
  try { return localStorage.getItem(KEY) || "auto"; } catch { return "auto"; }
}

/** Thème réellement affiché ("light" ou "dark"), même quand le choix est "auto". */
export function effectiveTheme(mode = getTheme()) {
  return mode === "dark" || (mode === "auto" && dark()?.matches) ? "dark" : "light";
}

export function applyTheme(mode, { save = true } = {}) {
  if (save) { try { localStorage.setItem(KEY, mode); } catch { /* thème non mémorisé */ } }
  const theme = effectiveTheme(mode);
  const root = document.documentElement;
  const changed = root.dataset.theme !== theme;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101216" : "#4f46e5");
  // Les graphiques ont des couleurs fixes à leur création : l'application les redessine.
  if (changed) document.dispatchEvent(new CustomEvent("theme-changed"));
}

// En mode "auto", on suit l'appareil quand il change (ex. passage automatique en sombre le soir).
dark()?.addEventListener?.("change", () => { if (getTheme() === "auto") applyTheme("auto", { save: false }); });
