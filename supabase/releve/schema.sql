-- Relevé de visite (page releve/) : un espace séparé de app_data.
-- À exécuter UNE fois dans Supabase › SQL Editor. Sans danger si on le relance.
--
-- Une ligne par visite : la visite entière en jsonb (client, projet, pièces,
-- références des photos) et un numéro de version pour la concurrence entre
-- appareils (l'écriture n'est acceptée que si la version n'a pas changé,
-- voir releve/synchro.js). Les photos ne sont jamais dans le JSON : elles
-- sont dans l'espace de fichiers privé « releves ».

create table if not exists public.releve_visites (
  id        uuid primary key,
  donnees   jsonb not null,
  version   bigint not null default 1,
  cree_le   timestamptz not null default now(),
  maj_le    timestamptz not null default now(),
  cree_par  uuid default auth.uid()
);
create index if not exists releve_visites_maj on public.releve_visites (maj_le desc);

alter table public.releve_visites enable row level security;

-- Les utilisateurs connectés de l'application, comme pour app_data : toute
-- l'équipe voit les visites (un collègue reprend celle d'un autre). Aucun
-- accès anonyme, aucune suppression depuis l'application.
-- IMPORTANT : cela suppose que l'inscription libre est FERMÉE dans
-- Supabase › Authentication › Sign In / Providers (« Allow new users to
-- sign up » décoché) ; sinon n'importe qui pourrait se créer un compte.
drop policy if exists "releve visites : lecture app" on public.releve_visites;
drop policy if exists "releve visites : création app" on public.releve_visites;
drop policy if exists "releve visites : mise à jour app" on public.releve_visites;
create policy "releve visites : lecture app" on public.releve_visites for select to authenticated using (true);
create policy "releve visites : création app" on public.releve_visites for insert to authenticated with check (true);
create policy "releve visites : mise à jour app" on public.releve_visites for update to authenticated using (true) with check (true);

-- Photos et fichiers de scan : espace PRIVÉ (aucun lien public). Ils se lisent
-- par des liens temporaires (1 heure) créés pour un utilisateur connecté.
insert into storage.buckets (id, name, public)
values ('releves', 'releves', false)
on conflict (id) do update set public = false;

drop policy if exists "releves : lecture app" on storage.objects;
drop policy if exists "releves : ajout app" on storage.objects;
drop policy if exists "releves : remplacement app" on storage.objects;
create policy "releves : lecture app" on storage.objects for select to authenticated using (bucket_id = 'releves');
create policy "releves : ajout app" on storage.objects for insert to authenticated with check (bucket_id = 'releves');
-- l'envoi d'une photo est rejoué après une coupure (upsert) : il faut pouvoir la remplacer
create policy "releves : remplacement app" on storage.objects for update to authenticated using (bucket_id = 'releves') with check (bucket_id = 'releves');

-- Réglages partagés du relevé (ajouté pour la fourchette de prix, Phase 2) :
-- une ligne par réglage, par exemple id = 'fourchettes' (la table des
-- fourchettes de prix TTC par poste et par gamme, saisie par CP
-- Constructions). Même règle de version que les visites. Sans danger si on
-- relance ce fichier.
create table if not exists public.releve_reglages (
  id        text primary key,
  donnees   jsonb not null,
  version   bigint not null default 1,
  maj_le    timestamptz not null default now(),
  maj_par   uuid default auth.uid()
);
alter table public.releve_reglages enable row level security;
drop policy if exists "releve reglages : lecture app" on public.releve_reglages;
drop policy if exists "releve reglages : création app" on public.releve_reglages;
drop policy if exists "releve reglages : mise à jour app" on public.releve_reglages;
create policy "releve reglages : lecture app" on public.releve_reglages for select to authenticated using (true);
create policy "releve reglages : création app" on public.releve_reglages for insert to authenticated with check (true);
create policy "releve reglages : mise à jour app" on public.releve_reglages for update to authenticated using (true) with check (true);
