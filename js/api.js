// Accès à la base de données Supabase.
// Chaque fonction enregistre/lit réellement dans Supabase : rien n'est simulé.
import { sb } from "./supabase.js";
import { state } from "./state.js";
import { monthStart, nextMonthStart } from "./utils.js";

function friendly(e) {
  const msg = e?.message || "";
  if (e?.code === "23505") return "Cet élément existe déjà.";
  if (e?.code === "23503") return "Cet élément est lié à d'autres données.";
  if (e?.code === "42501" || /row-level security/i.test(msg)) return "Action non autorisée.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Connexion impossible. Vérifie ta connexion internet.";
  return msg || "Une erreur est survenue.";
}

async function run(query) {
  const { data, error } = await query;
  if (error) throw new Error(friendly(error));
  return data;
}

/** Lit toutes les lignes (par pages de 1000) pour ne rien perdre. */
async function fetchAll(makeQuery) {
  const size = 1000;
  let from = 0;
  let all = [];
  for (;;) {
    const data = await run(makeQuery().range(from, from + size - 1));
    all = all.concat(data);
    if (data.length < size) break;
    from += size;
  }
  return all;
}

const uid = () => {
  if (!state.user) throw new Error("Session expirée : reconnecte-toi.");
  return state.user.id;
};

// ---------- Profil ----------
export async function getProfile() {
  return run(sb.from("profiles").select("*").eq("id", uid()).maybeSingle());
}
export async function updateProfile(values) {
  return run(sb.from("profiles").update(values).eq("id", uid()).select().single());
}

// ---------- Catégories ----------
export async function listCategories() {
  return run(sb.from("categories").select("*").order("kind", { ascending: false }).order("name"));
}
export async function addCategory(name, kind) {
  return run(sb.from("categories").insert({ user_id: uid(), name: name.trim(), kind }).select().single());
}
export async function renameCategory(id, name) {
  return run(sb.from("categories").update({ name: name.trim() }).eq("id", id));
}
export async function deleteCategory(id) {
  return run(sb.from("categories").delete().eq("id", id));
}

// ---------- Transactions ----------
export async function listTransactions({ type, categoryId, from, to, minCents, maxCents, search, limit = 50, offset = 0 } = {}) {
  let q = sb.from("transactions").select("*")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (type) q = q.eq("type", type);
  if (categoryId === "none") q = q.is("category_id", null);
  else if (categoryId) q = q.eq("category_id", categoryId);
  if (from) q = q.gte("occurred_on", from);
  if (to) q = q.lte("occurred_on", to);
  if (minCents) q = q.gte("amount_cents", minCents);
  if (maxCents) q = q.lte("amount_cents", maxCents);
  if (search) q = q.ilike("description", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
  return run(q.range(offset, offset + limit - 1));
}
export const addTransaction = (t) =>
  run(sb.from("transactions").insert({ ...t, user_id: uid() }).select().single());
export const updateTransaction = (id, t) =>
  run(sb.from("transactions").update(t).eq("id", id).select().single());
export const deleteTransaction = (id) => run(sb.from("transactions").delete().eq("id", id));

/** Version légère (4 colonnes) de toutes les transactions, pour les calculs. */
export const txLight = () =>
  fetchAll(() => sb.from("transactions").select("type,amount_cents,occurred_on,category_id").order("occurred_on").order("id"));
export const txFull = () =>
  fetchAll(() => sb.from("transactions").select("*").order("occurred_on", { ascending: false }).order("id"));
export const txExpensesOfMonth = (month) =>
  fetchAll(() => sb.from("transactions").select("category_id,amount_cents").eq("type", "expense")
    .gte("occurred_on", monthStart(month)).lt("occurred_on", nextMonthStart(month)).order("id"));

// ---------- Budgets ----------
export const listBudgets = (month) => run(sb.from("budgets").select("*").eq("month", monthStart(month)));

export async function setBudget(month, categoryId, cents) {
  let q = sb.from("budgets").select("id").eq("month", monthStart(month));
  q = categoryId ? q.eq("category_id", categoryId) : q.is("category_id", null);
  const existing = await run(q.maybeSingle());
  if (existing) return run(sb.from("budgets").update({ amount_cents: cents }).eq("id", existing.id));
  return run(sb.from("budgets").insert({
    user_id: uid(), category_id: categoryId, month: monthStart(month), amount_cents: cents,
  }));
}
export const deleteBudget = (id) => run(sb.from("budgets").delete().eq("id", id));

// ---------- Épargne ----------
export const listGoals = () => run(sb.from("savings_goals").select("*").order("created_at", { ascending: false }));
export const addGoal = (g) => run(sb.from("savings_goals").insert({ ...g, user_id: uid() }).select().single());
export const deleteGoal = (id) => run(sb.from("savings_goals").delete().eq("id", id));
export const listContributions = () =>
  fetchAll(() => sb.from("savings_contributions").select("*").order("contributed_on", { ascending: false }).order("id"));
export const addContribution = (c) =>
  run(sb.from("savings_contributions").insert({ ...c, user_id: uid() }).select().single());
export const deleteContribution = (id) => run(sb.from("savings_contributions").delete().eq("id", id));

// ---------- Compte ----------
export async function updatePassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}
