/* Google Agenda : conversions (heure de Paris quel que soit le fuseau de
   l'appareil, changements d'heure, journées entières, récurrences) et
   liens avec les dossiers. Relancé sous plusieurs fuseaux. */
const {spawnSync}=require('child_process');
if(!process.env.CP_TZ_ENFANT){
  let ko=0;
  for(const tz of ['Europe/Paris','America/New_York','Asia/Tokyo']){
    const r=spawnSync(process.execPath,[__filename],{env:{...process.env,TZ:tz,CP_TZ_ENFANT:'1'},encoding:'utf8'});
    const out=(r.stdout||'')+(r.stderr||'');
    out.split('\n').filter(l=>/^(OK|KO)/.test(l)).forEach(l=>console.log(l+'  ['+tz+']'));
    if(r.status!==0||!/Tout est bon/.test(out))ko++;
  }
  console.log(ko?'\n'+ko+' echec(s)':'\nTout est bon.');process.exitCode=ko?1:0;
  return;
}
const {charger,verif}=require('./harness');
const M=charger(['agEnParis','agDepuisGoogle','agVersGoogle','agFin','agLienDe','EMPTY']);
const {chk,fin}=verif();
/* heure d'été / d'hiver : le 25 octobre 2026 on recule d'une heure */
chk(JSON.stringify(M.agEnParis('2026-10-24T08:00:00Z'))===JSON.stringify({date:'2026-10-24',heure:'10:00'}),'été : 08:00 UTC = 10:00 à Paris');
chk(JSON.stringify(M.agEnParis('2026-10-26T09:00:00Z'))===JSON.stringify({date:'2026-10-26',heure:'10:00'}),'hiver : 09:00 UTC = 10:00 à Paris');
chk(M.agEnParis('2026-03-28T23:30:00Z').date==='2026-03-29'&&M.agEnParis('2026-03-28T23:30:00Z').heure==='00:30','passage de minuit : bonne date à Paris');
const e1=M.agDepuisGoogle({id:'e1',etag:'"1"',summary:'Réunion',location:'Valframbert',start:{dateTime:'2026-10-25T10:00:00+01:00'},end:{dateTime:'2026-10-25T11:30:00+01:00'},htmlLink:'https://g/e1'},'cal');
chk(e1.date==='2026-10-25'&&e1.heure==='10:00'&&e1.heureFin==='11:30'&&!e1.journee&&e1.cle==='cal|e1'&&e1.lien==='https://g/e1','événement horaire du jour du changement d’heure');
const e2=M.agDepuisGoogle({id:'e2',summary:'Congés',start:{date:'2026-08-03'},end:{date:'2026-08-08'}},'cal');
chk(e2.journee&&e2.date==='2026-08-03'&&e2.dateFin==='2026-08-07','journées entières : fin exclusive de Google ramenée au dernier jour');
const e3=M.agDepuisGoogle({id:'e3_20261102',recurringEventId:'e3',summary:'Visite',start:{dateTime:'2026-11-02T08:00:00Z'},end:{dateTime:'2026-11-02T09:00:00Z'}},'cal');
chk(e3.serieId==='e3'&&e3.heure==='09:00','occurrence d’une série : rattachée à sa série, heure de Paris');
const g1=M.agVersGoogle({titre:' Visite chantier ',date:'2026-10-25',heure:'14:00',heureFin:'15:30',lieu:'Magny',notes:'n'});
chk(g1.summary==='Visite chantier'&&g1.start.dateTime==='2026-10-25T14:00:00'&&g1.start.timeZone==='Europe/Paris'&&g1.end.dateTime==='2026-10-25T15:30:00','envoi à Google : heure locale + fuseau Europe/Paris (Google gère le changement d’heure)');
const g2=M.agVersGoogle({titre:'X',date:'2026-10-25',heure:'14:00',heureFin:''});
chk(g2.end.dateTime==='2026-10-25T15:00:00','sans fin valable : une heure');
chk(M.agFin('23:30','')==='23:59'&&M.agFin('10:00','09:00')==='11:00','fin toujours postérieure au début, sans passer minuit');
const g3=M.agVersGoogle({titre:'Congés',date:'2026-08-03',dateFin:'2026-08-07',journee:true});
chk(g3.start.date==='2026-08-03'&&g3.end.date==='2026-08-08'&&!g3.start.dateTime,'journées entières : fin exclusive envoyée à Google');
const g4=M.agVersGoogle({titre:'Sans heure',date:'2026-08-03',heure:''});
chk(g4.start.date==='2026-08-03','sans heure : journée entière');
const g5=M.agVersGoogle({titre:'Réunion',date:'2026-10-01',heure:'09:00',recurrence:'2semaines',recurrenceFin:'2026-12-31'});
chk(g5.recurrence[0]==='RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T235959Z','récurrence toutes les deux semaines jusqu’au 31/12');
chk(M.agVersGoogle({titre:'a',date:'2026-10-01',journee:true,recurrence:'mois'}).recurrence[0]==='RRULE:FREQ=MONTHLY','récurrence mensuelle sans fin');
const liens=[{calId:'cal',eventId:'e1',type:'chantier',dossierId:'c1'},{calId:'cal',eventId:'',serieId:'e3',type:'prospect',dossierId:'p1'}];
chk(M.agLienDe(liens,e1).dossierId==='c1'&&M.agLienDe(liens,e3).dossierId==='p1'&&!M.agLienDe(liens,{calId:'autre',id:'e1'}),'liens : par événement, par série, et par agenda');
fin();
