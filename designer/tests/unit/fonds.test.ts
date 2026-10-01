/* Les fonds de plan partagés : importé sur un appareil, le fichier est
   rangé sur l'appareil ET sur le serveur (espace privé) ; un collègue le
   reçoit du serveur et le garde. Sans serveur (panne, espace pas créé),
   il reste sur l'appareil et on le dit — rien n'est perdu. */
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { FichiersIndexedDB, FondsMemoire, FondsSupabase, type ClientStockage } from '../../src/persistence';
import { empreinteFichier, fichierDuFond, importerFichier } from '../../src/ui/fonds';

const fichier = () => new File([new Uint8Array([37, 80, 68, 70, 1, 2, 3])], 'plan-fictif.pdf', { type: 'application/pdf' });

describe('fonds partagés', () => {
  it('importé avec un serveur : sur l’appareil et sur le serveur ; un autre appareil le reçoit et le garde', async () => {
    const serveur = new FondsMemoire();
    const appareilA = new FichiersIndexedDB(new IDBFactory()), appareilB = new FichiersIndexedDB(new IDBFactory());
    const r = await importerFichier(fichier(), appareilA, serveur);
    expect(r).toEqual({ cle: await empreinteFichier(fichier()), partage: 'serveur' });
    expect(serveur.fichiers.has(r.cle)).toBe(true);
    expect(await appareilB.lire(r.cle)).toBeNull();
    const recu = await fichierDuFond(r.cle, appareilB, serveur);
    expect(recu?.type).toBe('application/pdf');
    expect(new Uint8Array(await recu!.donnees.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70, 1, 2, 3]));
    serveur.enPanne = true;                                   // gardé : plus besoin du serveur
    expect(await fichierDuFond(r.cle, appareilB, serveur)).not.toBeNull();
  });

  it('serveur en panne (ou espace pas créé) : gardé sur l’appareil, et la raison est rendue', async () => {
    const serveur = new FondsMemoire(); serveur.enPanne = true;
    const appareil = new FichiersIndexedDB(new IDBFactory());
    const r = await importerFichier(fichier(), appareil, serveur);
    expect(r.partage).toBe('appareil');
    expect(r.erreur).toMatch(/réseau/);
    expect(await appareil.lire(r.cle)).not.toBeNull();
    expect(await fichierDuFond('absent', appareil, serveur)).toBeNull();
  });

  it('Supabase : rangé sous fonds/<empreinte>, jamais remplacé ; « déjà là » n’est pas une erreur', async () => {
    const appels: { op: string; espace: string; chemin: string; upsert?: boolean }[] = [];
    let reponse: { error: { message: string; statusCode?: string } | null } = { error: null };
    const client: ClientStockage = { storage: { from: (espace: string) => ({
      upload: async (chemin: string, _d: Blob, o: { upsert: boolean }) => { appels.push({ op: 'upload', espace, chemin, upsert: o.upsert }); return reponse },
      download: async (chemin: string) => { appels.push({ op: 'download', espace, chemin }); return { data: new Blob(['x'], { type: 'image/png' }), error: null } },
    }) } };
    const s = new FondsSupabase(client), f = { nom: 'plan.png', type: 'image/png', donnees: new Blob(['x']) };
    await s.envoyer('abc', f);
    expect(appels[0]).toEqual({ op: 'upload', espace: 'designer-fonds', chemin: 'fonds/abc', upsert: false });
    reponse = { error: { message: 'The resource already exists', statusCode: '409' } };
    await expect(s.envoyer('abc', f)).resolves.toBeUndefined();
    reponse = { error: { message: 'Bucket not found' } };
    await expect(s.envoyer('abc', f)).rejects.toThrow(/Bucket not found/);
    expect((await s.recevoir('abc'))?.type).toBe('image/png');
  });
});
