/* CP Designer — page de préversion (Phase 0).

   Le Designer est un module à part du suivi de chantiers (index.html) :
   il ne partage avec lui que la session Supabase et l'identifiant du
   chantier (ADR-0001). Cette page ne fait encore que vérifier que le socle
   est publié et que le Geometry Engine répond juste ; l'éditeur 2D arrive
   en Phase 1. */
import { SCHEMA_VERSION } from './model/types';
import { aire, mm2EnM2, rectangle } from './geometry/polygon';

const racine = document.getElementById('designer');
if (racine) {
  const s = mm2EnM2(aire({ contour: rectangle(0, 0, 10_000, 8_000) }));
  const ok = Math.abs(s - 80) < 1e-9;
  racine.innerHTML = `
    <main style="font:15px/1.5 system-ui,-apple-system,sans-serif;color:#1A2B36;max-width:720px;margin:0 auto;padding:24px 16px">
      <div style="color:#C5563A;font-weight:700;letter-spacing:.06em;font-size:12px">CP CONSTRUCTIONS</div>
      <h1 style="margin:4px 0 8px;font-size:24px">CP Designer <span style="font-weight:400;color:#6E7B84">— préversion</span></h1>
      <p>Phase 0 : le socle est en place (modèle de données, schéma n° ${SCHEMA_VERSION}, moteur géométrique).
         L'éditeur de plans arrive en Phase 1.</p>
      <p style="padding:8px 12px;border-left:3px solid ${ok ? '#3F7A5A' : '#C5563A'};background:#F5F1EA">
        Contrôle du moteur : rectangle 10 × 8 m → <b>${s.toFixed(2).replace('.', ',')} m²</b> ${ok ? '✓' : '✗'}</p>
      <p><a href="../index.html" style="color:#2C4A5E">Retour au suivi de chantiers</a></p>
    </main>`;
}
