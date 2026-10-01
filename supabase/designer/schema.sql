-- CP Designer : les projets de conception, à part de app_data (ADR-0003).
--
-- Un projet est un CP Building Model : il n'est jamais écrit dans la ligne
-- unique du suivi de chantiers. Chaque modification arrive sous forme d'un
-- ChangeSet (qui, quand, quelles opérations) ; un instantané complet du
-- modèle est gardé à intervalles et à chaque jalon (APS V1, PC…). Une
-- écriture porte la révision sur laquelle elle a été faite : si quelqu'un
-- est passé avant, elle est refusée — rien n'est écrasé en silence.
--
-- À exécuter une fois dans Supabase › SQL Editor, au début de la Phase 1
-- (rien ne s'en sert avant). Voir docs/designer/ADR-0003-persistance.md.

create table if not exists public.designer_projects (
  id              uuid primary key default gen_random_uuid(),
  crm_chantier_id text,                       -- le chantier du CRM (lien, pas copie)
  nom             text not null,
  schema_version  integer not null,
  revision        integer not null default 0,
  verrou_par      text,                       -- « en cours d'édition par… » (affiché, pas bloquant)
  verrou_le       timestamptz,
  cree_le         timestamptz not null default now(),
  maj_le          timestamptz not null default now()
);
create index if not exists designer_projects_chantier on public.designer_projects (crm_chantier_id);

create table if not exists public.designer_revisions (
  project_id  uuid not null references public.designer_projects (id) on delete cascade,
  revision    integer not null,
  modele      jsonb not null,                 -- le Building Model complet à cette révision
  message     text,
  jalon       text,                           -- APS V1, PC, EXE… (instantané nommé)
  par         text,
  cree_le     timestamptz not null default now(),
  primary key (project_id, revision)
);

create table if not exists public.designer_changesets (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.designer_projects (id) on delete cascade,
  revision_avant   integer not null,
  revision_apres   integer not null,
  titre            text not null,
  demande_par      text not null check (demande_par in ('user', 'ai')),
  operations       jsonb not null,            -- opérations inversibles (annuler / rétablir)
  impacts          jsonb,                     -- Impact Analyzer (Phase 4)
  par              text,
  cree_le          timestamptz not null default now(),
  approuve_le      timestamptz,
  unique (project_id, revision_apres)
);

-- Enregistrer un ChangeSet : refusé si le projet n'est plus à la révision
-- sur laquelle il a été préparé (concurrence optimiste).
create or replace function public.designer_enregistrer(
  p_project uuid, p_revision_avant integer, p_titre text, p_demande_par text,
  p_operations jsonb, p_par text, p_instantane jsonb default null, p_jalon text default null)
returns integer
language plpgsql
security invoker
as $$
declare
  courante integer;
begin
  select revision into courante from public.designer_projects where id = p_project for update;
  if courante is null then
    raise exception 'projet introuvable' using errcode = 'P0002';
  end if;
  if courante <> p_revision_avant then
    raise exception 'conflit de révision : le projet est à la révision %, pas %', courante, p_revision_avant using errcode = '40001';
  end if;
  insert into public.designer_changesets (project_id, revision_avant, revision_apres, titre, demande_par, operations, par, approuve_le)
    values (p_project, courante, courante + 1, p_titre, p_demande_par, p_operations, p_par, now());
  if p_instantane is not null then
    insert into public.designer_revisions (project_id, revision, modele, message, jalon, par)
      values (p_project, courante + 1, p_instantane, p_titre, p_jalon, p_par);
  end if;
  update public.designer_projects set revision = courante + 1, maj_le = now() where id = p_project;
  return courante + 1;
end;
$$;

alter table public.designer_projects enable row level security;
alter table public.designer_revisions enable row level security;
alter table public.designer_changesets enable row level security;

-- Les utilisateurs connectés de l'application (comme pour app_data). Si
-- app_data est limitée à certaines adresses, reprenez la même condition.
drop policy if exists "designer projets : app" on public.designer_projects;
drop policy if exists "designer révisions : app" on public.designer_revisions;
drop policy if exists "designer changesets : lecture app" on public.designer_changesets;
drop policy if exists "designer changesets : ajout app" on public.designer_changesets;
create policy "designer projets : app" on public.designer_projects for all to authenticated using (true) with check (true);
create policy "designer révisions : app" on public.designer_revisions for all to authenticated using (true) with check (true);
-- le journal des ChangeSets ne se modifie pas : on lit, on ajoute
create policy "designer changesets : lecture app" on public.designer_changesets for select to authenticated using (true);
create policy "designer changesets : ajout app" on public.designer_changesets for insert to authenticated with check (true);
-- aucune règle pour « anon »

-- Les fonds de plan (PDF, images) importés dans le Designer : un espace de
-- stockage PRIVÉ, lu et rempli par les utilisateurs connectés. Un fichier
-- est rangé sous l'empreinte de son contenu (fonds/<empreinte>) : le même
-- plan importé deux fois n'est stocké qu'une fois, et un fichier rangé ne
-- se remplace pas (aucune règle de modification ni de suppression).
insert into storage.buckets (id, name, public)
  values ('designer-fonds', 'designer-fonds', false)
  on conflict (id) do nothing;
drop policy if exists "designer fonds : lecture app" on storage.objects;
drop policy if exists "designer fonds : ajout app" on storage.objects;
create policy "designer fonds : lecture app" on storage.objects for select to authenticated using (bucket_id = 'designer-fonds');
create policy "designer fonds : ajout app" on storage.objects for insert to authenticated with check (bucket_id = 'designer-fonds');
