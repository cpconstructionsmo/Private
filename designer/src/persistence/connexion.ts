/* La connexion à Supabase : le même projet et la même clé publique que le
   suivi de chantiers (index.html). Publiés sur la même origine (GitHub
   Pages), les deux pages partagent la session de l'utilisateur : déjà
   connecté au suivi de chantiers, il l'est au Designer, sans rien
   ressaisir. La clé est la clé PUBLIQUE (« publishable ») : les droits sont
   portés par les règles des tables (utilisateurs connectés seulement). */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://gxfrughmwkvdepvkhufv.supabase.co';
export const SUPABASE_CLE_PUBLIQUE = 'sb_publishable_JCBSnZhTaKlpSIZeXAeMkw_2OvI6YIr';

let client: SupabaseClient | null = null;
export function connexion(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE);
  return client;
}

/** l'adresse e-mail de la personne connectée, ou null (alors : se connecter dans le suivi de chantiers) */
export async function utilisateur(): Promise<string | null> {
  const { data } = await connexion().auth.getSession();
  return data.session?.user?.email ?? null;
}
