-- « Imaginer » (relevé de visite) : le compteur d'images par personne et par
-- jour, pour tenir le coût. Lu et écrit par la fonction seule (clé de
-- service) : aucune règle pour les autres rôles, RLS activée.
create table if not exists public.releve_ia_usage (
  jour date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  nb integer not null default 0,
  primary key (jour, user_id)
);
alter table public.releve_ia_usage enable row level security;

-- L'assistant de visite (dictée → fiche) : son propre compteur par jour.
alter table public.releve_ia_usage add column if not exists nb_texte integer not null default 0;

-- Le dossier client partagé par un lien personnel (#t=<jeton>), à durée
-- limitée. Seule l'empreinte du jeton est gardée ; le client n'a jamais accès
-- à la base : la fonction lit ce dossier pour lui. L'équipe connectée crée,
-- voit (ouvert ou non par le client) et retire ses liens.
create table if not exists public.releve_partages (
  id          uuid primary key default gen_random_uuid(),
  visite_id   text not null,
  jeton_hash  text not null unique,
  donnees     jsonb not null,
  cree_le     timestamptz not null default now(),
  cree_par    uuid default auth.uid(),
  expire_le   timestamptz not null,
  revoque     boolean not null default false,
  vues        integer not null default 0,
  vu_le       timestamptz
);
create index if not exists releve_partages_visite on public.releve_partages (visite_id);
alter table public.releve_partages enable row level security;
drop policy if exists "releve partages : lecture équipe" on public.releve_partages;
drop policy if exists "releve partages : création équipe" on public.releve_partages;
drop policy if exists "releve partages : retrait équipe" on public.releve_partages;
create policy "releve partages : lecture équipe" on public.releve_partages for select to authenticated using (true);
create policy "releve partages : création équipe" on public.releve_partages for insert to authenticated with check (true);
create policy "releve partages : retrait équipe" on public.releve_partages for update to authenticated using (true) with check (true);
