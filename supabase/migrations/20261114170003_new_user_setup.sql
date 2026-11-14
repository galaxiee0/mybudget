-- =====================================================================
-- MyBudget — Migration 3 : préparation d'un nouvel utilisateur
-- =====================================================================
-- Quand quelqu'un s'inscrit (table auth.users de Supabase), on crée
-- automatiquement :
--   - son profil (devise EUR par défaut)
--   - ses catégories de départ (modifiables ensuite)
-- =====================================================================

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );

  insert into public.categories (user_id, name, kind, icon) values
    (new.id, 'Logement',            'expense', 'home'),
    (new.id, 'Alimentation',        'expense', 'shopping-cart'),
    (new.id, 'Transport',           'expense', 'car'),
    (new.id, 'Santé',               'expense', 'heart-pulse'),
    (new.id, 'Téléphone et Internet','expense', 'smartphone'),
    (new.id, 'Loisirs',             'expense', 'gamepad-2'),
    (new.id, 'Shopping',            'expense', 'shopping-bag'),
    (new.id, 'Études',              'expense', 'graduation-cap'),
    (new.id, 'Abonnements',         'expense', 'repeat'),
    (new.id, 'Autres',              'expense', 'ellipsis'),
    (new.id, 'Salaire',             'income',  'banknote'),
    (new.id, 'Autres revenus',      'income',  'plus-circle');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cette fonction ne doit être appelée que par le trigger, jamais via l'API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
