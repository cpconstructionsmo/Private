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
