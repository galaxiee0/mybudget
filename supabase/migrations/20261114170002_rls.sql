-- =====================================================================
-- MyBudget — Migration 2 : sécurité (RLS = Row Level Security)
-- =====================================================================
-- Principe : chaque ligne appartient à un utilisateur (colonne user_id).
-- Avec RLS activé, la base REFUSE toute lecture/écriture d'une ligne
-- qui n'appartient pas à l'utilisateur connecté, même si quelqu'un
-- essaie d'appeler l'API directement. Sans politique = aucun accès.
-- =====================================================================

alter table public.profiles              enable row level security;
alter table public.categories            enable row level security;
alter table public.transactions          enable row level security;
alter table public.budgets               enable row level security;
alter table public.savings_goals         enable row level security;
alter table public.savings_contributions enable row level security;

-- ---------- Profils : lecture et modification de SON profil -----------
-- (la création est faite par le trigger de la migration 3)
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------- Autres tables : accès complet à SES lignes uniquement -----
create policy categories_own on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy transactions_own on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy budgets_own on public.budgets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy savings_goals_own on public.savings_goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy savings_contributions_own on public.savings_contributions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
