// État global de l'application (en mémoire).
export const state = {
  user: null,
  profile: null,
  categories: [],
  month: null, // mois affiché (format AAAA-MM), partagé entre les pages
  recovery: false, // true pendant la réinitialisation du mot de passe
};

const PALETTE = [
  "#4f46e5", "#0ea5e9", "#14b8a6", "#22c55e", "#eab308",
  "#f97316", "#ef4444", "#ec4899", "#8b5cf6", "#64748b",
];

export const currency = () => state.profile?.currency || "EUR";
export const catById = (id) => state.categories.find((c) => c.id === id) || null;
export const catName = (id) => catById(id)?.name || "Sans catégorie";
export function catColor(cat) {
  if (!cat) return "#9ca3af";
  if (cat.color) return cat.color;
  const i = state.categories.findIndex((c) => c.id === cat.id);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}
export const expenseCategories = () => state.categories.filter((c) => c.kind === "expense");
