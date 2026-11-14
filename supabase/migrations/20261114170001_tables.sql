-- =====================================================================
-- MyBudget — Migration 1 : création des tables
-- =====================================================================
-- RÈGLE IMPORTANTE : tous les montants sont stockés en CENTIMES (entiers).
--   12,50 EUR  ->  1250
-- Cela évite les erreurs d'arrondi des nombres décimaux.
-- =====================================================================

-- ---------- Profils ---------------------------------------------------
-- Un profil par utilisateur (créé automatiquement, voir migration 3).
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  currency     text not null default 'EUR' check (char_length(currency) = 3),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- Catégories ------------------------------------------------
-- Chaque utilisateur a ses propres catégories (personnalisables).
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 50),
  kind       text not null default 'expense' check (kind in ('expense', 'income')),
  color      text,
  icon       text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, name),
  -- Nécessaire pour que les autres tables puissent vérifier
  -- qu'une catégorie appartient bien au même utilisateur.
  unique (id, user_id)
);

-- ---------- Transactions ----------------------------------------------
create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  category_id  uuid,
  type         text not null check (type in ('income', 'expense')),
  amount_cents bigint not null check (amount_cents > 0),
  description  text check (description is null or char_length(description) <= 200),
  occurred_on  date not null default current_date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- La catégorie doit appartenir au même utilisateur.
  -- Si la catégorie est supprimée, la transaction est conservée (sans catégorie).
  foreign key (category_id, user_id)
    references public.categories (id, user_id)
    on delete set null (category_id)
);

-- ---------- Budgets ---------------------------------------------------
-- category_id NULL  = budget mensuel GLOBAL
-- category_id rempli = budget d'une catégorie
-- month = toujours le 1er jour du mois (ex. 2026-11-01)
create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  category_id  uuid,
  month        date not null check (extract(day from month) = 1),
  amount_cents bigint not null check (amount_cents > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (category_id, user_id)
    references public.categories (id, user_id)
    on delete cascade
);

-- Un seul budget global par mois, et un seul budget par catégorie et par mois.
create unique index budgets_global_unique
  on public.budgets (user_id, month) where category_id is null;
create unique index budgets_category_unique
  on public.budgets (user_id, category_id, month) where category_id is not null;

-- ---------- Objectifs d'épargne ---------------------------------------
-- Un objectif est "terminé" quand la somme des contributions >= target_cents
-- (calculé par l'application, pas stocké : c'est plus fiable).
create table public.savings_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  target_cents bigint not null check (target_cents > 0),
  deadline     date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------- Contributions à l'épargne ---------------------------------
create table public.savings_contributions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  goal_id        uuid not null,
  amount_cents   bigint not null check (amount_cents > 0),
  contributed_on date not null default current_date,
  created_at     timestamptz not null default now(),
  foreign key (goal_id, user_id)
    references public.savings_goals (id, user_id)
    on delete cascade
);

-- ---------- Index (pour des requêtes rapides) -------------------------
create index transactions_user_date_idx
  on public.transactions (user_id, occurred_on desc);
create index transactions_user_category_idx
  on public.transactions (user_id, category_id);
create index categories_user_idx
  on public.categories (user_id);
create index budgets_user_month_idx
  on public.budgets (user_id, month);
create index savings_goals_user_idx
  on public.savings_goals (user_id);
create index savings_contributions_goal_idx
  on public.savings_contributions (goal_id);

-- ---------- Mise à jour automatique de "updated_at" -------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();
create trigger savings_goals_set_updated_at
  before update on public.savings_goals
  for each row execute function public.set_updated_at();
