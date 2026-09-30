-- Espace « choix client » : un espace séparé de app_data.
--
-- Le client n'a jamais accès à la base : il ne connaît qu'un lien personnel
-- (un jeton aléatoire), que seule la fonction « configurateur » sait
-- vérifier. Ces tables n'ont donc AUCUNE règle pour le rôle anonyme : sans
-- la clé de service (qui ne quitte pas la fonction), on ne peut rien y lire.
-- L'application (utilisateur connecté) publie le catalogue d'un dossier et
-- relève les choix ; elle ne peut pas modifier un panier.
--
-- À exécuter une fois dans Supabase › SQL Editor. Voir README.md.

create table if not exists public.config_espaces (
  id           uuid primary key default gen_random_uuid(),
  chantier_id  text not null,
  -- empreinte SHA-256 (hexadécimal) du jeton du lien : le jeton lui-même
  -- n'est jamais stocké ici
  jeton_hash   text not null unique,
  -- le catalogue publié : questions, options, natures, prix TTC, budget
  publie       jsonb not null,
  prix_version integer not null default 1,
  statut       text not null default 'ouvert' check (statut in ('ouvert', 'clos')),
  -- après un envoi, le client ne modifie plus son panier, sauf si le maître
  -- d'œuvre rouvre l'espace (date postérieure à l'envoi)
  rouvert_le   timestamptz,
  expire_le    timestamptz,
  cree_le      timestamptz not null default now(),
  maj_le       timestamptz not null default now()
);
create index if not exists config_espaces_chantier on public.config_espaces (chantier_id);

-- chaque enregistrement du client est une nouvelle version : rien n'est
-- réécrit, l'historique reste lisible
create table if not exists public.config_paniers (
  id           bigint generated always as identity primary key,
  espace_id    uuid not null references public.config_espaces (id) on delete cascade,
  version      integer not null,
  prix_version integer not null,
  lignes       jsonb not null,
  -- le calcul fait par la fonction, au prix de la version publiée
  calcul       jsonb not null,
  statut       text not null check (statut in ('brouillon', 'envoye')),
  cree_le      timestamptz not null default now(),
  unique (espace_id, version)
);

alter table public.config_espaces enable row level security;
alter table public.config_paniers enable row level security;

-- Les utilisateurs connectés de l'application (comme pour app_data).
-- Si app_data est limitée à certaines adresses, reprenez ici la même
-- condition à la place de « true ».
drop policy if exists "espaces : lecture app" on public.config_espaces;
drop policy if exists "espaces : création app" on public.config_espaces;
drop policy if exists "espaces : mise à jour app" on public.config_espaces;
drop policy if exists "paniers : lecture app" on public.config_paniers;
create policy "espaces : lecture app" on public.config_espaces for select to authenticated using (true);
create policy "espaces : création app" on public.config_espaces for insert to authenticated with check (true);
create policy "espaces : mise à jour app" on public.config_espaces for update to authenticated using (true) with check (true);
create policy "paniers : lecture app" on public.config_paniers for select to authenticated using (true);
-- aucune règle d'écriture sur les paniers : seule la fonction (clé de
-- service) en ajoute ; aucune règle pour « anon » sur les deux tables
