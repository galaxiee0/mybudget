# MyBudget

Application web de gestion financière personnelle : revenus, dépenses, budgets, épargne et statistiques.

## Stack

- **Front** : HTML + CSS + JavaScript (sans framework)
- **Backend** : Supabase (authentification + base PostgreSQL + RLS)
- **Graphiques** : Chart.js
- **Hébergement** : Vercel (déploiement automatique depuis GitHub)

## Structure

```
mybudget/
├── supabase/
│   └── migrations/        <- le backend : tables, sécurité, inscription
├── README.md
└── .gitignore
```

Le dossier du site (`index.html`, `css/`, `js/`) sera ajouté à l'étape suivante.

## Backend

Les migrations sont à exécuter **dans l'ordre** :

1. `20261114170001_tables.sql` : tables (profils, catégories, transactions, budgets, objectifs d'épargne, contributions)
2. `20261114170002_rls.sql` : sécurité RLS (chaque utilisateur ne voit que ses données)
3. `20261114170003_new_user_setup.sql` : création automatique du profil et des catégories à l'inscription

### Règles du projet

- Tous les montants sont en **centimes entiers** (12,50 EUR = `1250`).
- Aucune clé secrète dans le code : seule la clé publique (anon / publishable) est utilisée côté navigateur.
- Toutes les tables de données personnelles ont RLS activé.
