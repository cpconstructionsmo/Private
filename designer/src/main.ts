/* CP Designer — point d'entrée de la page (préversion, Phase 1).

   Le Designer est un module à part du suivi de chantiers (index.html) :
   il ne partage avec lui que la session Supabase et l'identifiant du
   chantier (ADR-0001), passé dans l'adresse : designer/?chantier=<id>. */
import { demarrer } from './ui/app';

const racine = document.getElementById('designer');
if (racine) demarrer(racine).catch(e => {
  /* le diagnostic de la page (index.html) ne recouvre pas ce message */
  racine.setAttribute('data-erreur', String((e as Error)?.message ?? e));
  racine.innerHTML = `<p style="font:15px/1.5 system-ui,sans-serif;padding:24px;color:#A13A20">CP Designer n'a pas pu s'ouvrir :
    ${String((e as Error)?.message ?? e).replace(/</g, '&lt;')}. Le suivi de chantiers reste accessible :
    <a href="../index.html">retour à l'application</a>.</p>`;
});
