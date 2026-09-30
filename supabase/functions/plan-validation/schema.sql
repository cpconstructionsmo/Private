-- Validation du plan électrique par le client : un espace séparé de app_data.
--
-- Le client ne connaît qu'un lien personnel (un jeton aléatoire) que seule
-- la fonction « plan-validation » sait vérifier. Il peut voir le plan
-- publié, zoomer, cliquer un équipement, laisser une remarque et valider
-- l'indice publié. Il ne peut pas modifier le plan : ces tables n'ont
-- aucune règle pour le rôle anonyme.
--
-- À exécuter une fois dans Supabase › SQL Editor. Voir README.md.

create table if not exists public.plan_publications (
  id          uuid primary key default gen_random_uuid(),
  chantier_id text not null,
  jeton_hash  text not null unique,
  -- le plan publié : indice, fond (clé du fichier), symboles, liaisons, légende
  publication jsonb not null,
  statut      text not null default 'ouvert' check (statut in ('ouvert', 'clos')),
  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now()
);
create index if not exists plan_publications_chantier on public.plan_publications (chantier_id);

create table if not exists public.plan_remarques (
  id             bigint generated always as identity primary key,
  publication_id uuid not null references public.plan_publications (id) on delete cascade,
  indice         text,
  symbole_id     text,
  x              real,
  y              real,
  texte          text not null,
  auteur         text,
  cree_le        timestamptz not null default now(),
  -- la suite donnée par CP Constructions
  traitee_le     timestamptz,
  reponse        text
);

create table if not exists public.plan_validations (
  id             bigint generated always as identity primary key,
  publication_id uuid not null references public.plan_publications (id) on delete cascade,
  indice         text not null,
  nom            text not null,
  cree_le        timestamptz not null default now()
);

alter table public.plan_publications enable row level security;
alter table public.plan_remarques enable row level security;
alter table public.plan_validations enable row level security;

-- Les utilisateurs connectés de l'application (comme pour app_data). Si
-- app_data est limitée à certaines adresses, reprenez la même condition.
drop policy if exists "publications : app" on public.plan_publications;
drop policy if exists "remarques : lecture app" on public.plan_remarques;
drop policy if exists "remarques : suite app" on public.plan_remarques;
drop policy if exists "validations : lecture app" on public.plan_validations;
create policy "publications : app" on public.plan_publications for all to authenticated using (true) with check (true);
create policy "remarques : lecture app" on public.plan_remarques for select to authenticated using (true);
create policy "remarques : suite app" on public.plan_remarques for update to authenticated using (true) with check (true);
create policy "validations : lecture app" on public.plan_validations for select to authenticated using (true);
-- aucune règle pour « anon » : le client passe par la fonction
