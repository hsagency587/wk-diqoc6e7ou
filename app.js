'use strict';

/* =========================================================================
   Workout — il piano degli allenamenti, tolto da G Work e messo in una app
   sua. Nessuna dipendenza. Parla solo con GitHub, dove tiene il file del
   piano, e con i siti dei video che si mettono nelle descrizioni.
   ========================================================================= */

/* Dove stanno i file. Il repository e' quello dell'app; i file vivono su un
   branch suo, "scheda", cosi' ogni salvataggio non rifa' il sito. Se il
   branch non c'e' ancora, il primo Salva lo crea.
   Ogni persona ha i suoi file, cifrati con la sua chiave: quello pubblicato,
   che legge lei, la bozza, che scrive chi tiene le schede, e una cartella per
   i video. Il nome dei file si ricava dalla chiave: nel repository non
   compare nessun nome. Anche l'elenco delle persone e la libreria sono un
   file cosi', cifrato con la mia chiave.
   Il "vecchio" e' il piano di quando la persona era una sola (scheda.json,
   bozza.json, video/): chi non ha ancora una chiave continua a leggere quello. */
const REPO        = 'hsagency587/wk-diqoc6e7ou';
const BRANCH      = 'scheda';
const API         = 'https://api.github.com/repos/' + REPO;
const RAW         = 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/';
const VECCHIO     = 'vecchio';
const fileDi      = f => f === VECCHIO ? 'scheda.json' : 'persone/' + f + '.json';
const bozzaDi     = f => f === VECCHIO ? 'bozza.json' : 'persone/' + f + '-bozza.json';
const cartellaDi  = f => f === VECCHIO ? 'video/' : 'persone/' + f + '/video/';
/* La bozza: chi scrive legge e scrive qui, chi si allena non la vede mai.
   Pubblica copia la bozza sul file pubblicato in un colpo solo. */
const pubApi      = () => API + '/contents/' + fileDi(fidCorrente);
const bozzaApi    = () => API + '/contents/' + bozzaDi(fidCorrente);
const fileApi     = () => scrive() ? bozzaApi() : pubApi();
let shaPubblicato;
let pubblicando = false;
let pubblicaErr = '';

/* La copia che comanda sta nel telefono: ogni tocco e' istantaneo e resta qui
   anche se non si salva. Salva la manda su GitHub in un commit solo. Ogni
   persona ha la sua copia, sotto STORE_KEY + ':' + il codice dei suoi file. */
const STORE_KEY   = 'wk-store-v1';        /* { workout, schede, sha, known, dirty, stamp } */
const TOKEN_KEY   = 'wk-token-v1';
const CHIAVE_KEY  = 'wk-chiave-v1';       /* la Data key di prima: apre solo il vecchio */
const PERSONA_KEY = 'wk-persona-v1';      /* { k, f }: la chiave arrivata col collegamento */
const MIA_KEY     = 'wk-mia-v1';          /* { k, f }: la mia chiave, apre l'elenco */
const MIO_KEY     = 'wk-mio-v1';          /* l'elenco e la libreria, copia nel telefono */
const SCELTA_KEY  = 'wk-scelta-v1';       /* la persona scelta nel menu */
const CODA_KEY    = 'wk-coda-v1';         /* i video da mandare: [{ f, n }] */
const CARICATI_KEY = 'wk-caricati-v3';    /* { codice: [video gia' online e leggeri] } */
/* come si guarda lo schermo: sta nel telefono, non nel file */
const VISTA_KEY   = 'wk-vista-v1';

const $  = id => document.getElementById(id);

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function readStore(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    return {};
  }
}

function writeStore(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* resta in memoria */ }
}

/* ------------------------------------------------ la forma del file ---- */

/* Quanti workout al giorno si possono avere: da uno a quattro. Oltre, sul
   telefono le colonne della tabella diventano troppo strette per leggerle. */
const MAX_SLOT = 4;
const SLOT_BASE = 2;
const ORDINALI = ['1°', '2°', '3°', '4°'];

/* Il piano: fino a quattro caselle per giorno della settimana (0 domenica ...
   6 sabato), testo corto. Le caselle vuote in fondo non si scrivono. Anche le
   caselle oltre il numero scelto restano: togliendo una colonna il testo si
   nasconde, non si perde, e rimettendola torna. */
function validWorkout(w) {
  const out = {};
  if (!w || typeof w !== 'object') return out;
  for (let g = 0; g < 7; g++) {
    const r = Array.isArray(w[g]) ? w[g] : [];
    const a = [];
    for (let i = 0; i < MAX_SLOT; i++) a.push(String(r[i] == null ? '' : r[i]).slice(0, 60).trim());
    while (a.length && !a[a.length - 1]) a.pop();
    if (a.length) out[g] = a;
  }
  return out;
}

/* Quanti workout al giorno si vedono. Sta nel file: vale su tutti i telefoni. */
function validSlot(n) {
  n = Math.round(+n);
  return n >= 1 && n <= MAX_SLOT ? n : SLOT_BASE;
}

/* Il nome della scheda del mattino: si cambia a mano. Vuoto vuol dire quello
   di fabbrica, e nel file non si scrive. */
const MATTINA_BASE = 'Morning activity';
const validMattina = v => String(v == null ? '' : v).slice(0, 40).trim();
const nomeMattina = () => tstore.mattina || MATTINA_BASE;

/* Quando si vede una lista Every day:
   { modo: 'sempre' }                         tutti i giorni
   { modo: 'giorni', giorni: [1, 3, 5] }      certi giorni della settimana (0 domenica)
   { modo: 'ogni', n: 2, dal: 'aaaa-mm-gg' }  un giorno si' e n-1 no, a partire da una data
   { modo: 'date', date: ['aaaa-mm-gg'] }     solo in certe date
   { modo: 'ciclo', dal: 'aaaa-mm-gg', passi: [3, -2, 4, -1] }
                                              un ritmo che si ripete: 3 giorni si',
                                              2 no, 4 si', 1 no, e daccapo */
function validQuando(q) {
  if (!q || typeof q !== 'object') return { modo: 'sempre' };
  if (q.modo === 'giorni') {
    const g = [...new Set((Array.isArray(q.giorni) ? q.giorni : []).map(Number).filter(x => x >= 0 && x <= 6))].sort();
    return { modo: 'giorni', giorni: g };
  }
  if (q.modo === 'ogni') {
    const n = Math.round(+q.n);
    return { modo: 'ogni', n: n >= 2 && n <= 14 ? n : 2, dal: /^\d{4}-\d{2}-\d{2}$/.test(q.dal) ? q.dal : '2026-01-05' };
  }
  if (q.modo === 'date') {
    const d = [...new Set((Array.isArray(q.date) ? q.date : []).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort().slice(-400);
    return { modo: 'date', date: d };
  }
  if (q.modo === 'ciclo') {
    const p = (Array.isArray(q.passi) ? q.passi : []).map(x => Math.round(+x)).filter(x => x && Math.abs(x) <= 60).slice(0, 20);
    return { modo: 'ciclo', dal: /^\d{4}-\d{2}-\d{2}$/.test(q.dal) ? q.dal : '2026-01-05', passi: p.length ? p : [1, -1] };
  }
  return { modo: 'sempre' };
}

/* Le liste Every day in piu', oltre alla prima: ognuna con la sua scheda,
   sotto la chiave __ev_ e il suo id. */
const EV = id => '__ev_' + id;
function validAltre(l) {
  if (!Array.isArray(l)) return [];
  return l.slice(0, 10).map(x => {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[a-z0-9]{3,20}$/.test(x.id)) return null;
    return { id: x.id, nome: validMattina(x.nome), via: !!x.via, quando: validQuando(x.quando) };
  }).filter(Boolean);
}

/* La via dei gruppi, ripulita: al massimo quattro scatole una dentro l'altra,
   nomi corti, niente vuoti in mezzo. */
function viaGruppi(v) {
  const a = Array.isArray(v) ? v : (v ? [v] : []);
  return a.map(x => String(x == null ? '' : x).slice(0, 40).trim()).filter(Boolean).slice(0, 4);
}

/* Le schede: per ogni nome di allenamento un elenco di esercizi e il
   recupero. Ogni esercizio e' [nome, quantita', via dei gruppi, descrizione].
   La descrizione e' testo libero; un link scritto da solo su una riga e' un
   video. Le righe vuote non si tengono. */
function validSchede(w) {
  const out = {};
  if (!w || typeof w !== 'object') return out;
  for (const k of Object.keys(w)) {
    const nome = String(k).slice(0, 60).trim();
    if (!nome) continue;
    const v = w[k] || {};
    const es = (Array.isArray(v.es) ? v.es : []).map(r => [
      String((Array.isArray(r) ? r[0] : '') || '').slice(0, 60).trim(),
      String((Array.isArray(r) ? r[1] : '') || '').slice(0, 60).trim(),
      viaGruppi(Array.isArray(r) ? r[2] : null),
      String((Array.isArray(r) ? r[3] : '') || '').slice(0, 4000),
      /* quinta casella: il nome del file del video dell'esercizio, o vuoto */
      /* uno o piu' video, separati da virgole */
      String((Array.isArray(r) ? r[4] : '') || '').split(',').filter(nomeVideoOk).slice(0, 6).join(',')
    ]).filter(r => r[0] || r[1]);
    const rec = String(v.rec == null ? '' : v.rec).slice(0, 60).trim();
    if (!es.length && !rec) continue;
    out[nome] = { es: es, rec: rec };
    const tipi = validTipi(v.tipi, es);
    if (tipi) out[nome].tipi = tipi;
  }
  return out;
}

/* Il tipo di un gruppo di un workout: Tabata o EMOM, con i numeri che servono
   al timer. Sta nella scheda, per gruppo: la chiave e' la via del gruppo
   scritta come testo (JSON). Tabata: l = secondi di lavoro, r = secondi di
   recupero, g = giri (0: finche' non si ferma). EMOM: m = minuti (0: finche'
   non si ferma), a = i minuti di fila di ogni esercizio, in ordine (1,1 =
   uno al minuto a turno; 2,1 = due minuti il primo e uno il secondo). Un
   gruppo che non c'e' piu' nelle righe perde il suo tipo. */
const intra = (x, min, max, def) => { const n = Math.round(+x); return n >= min && n <= max ? n : def; };
/* lati: per esercizio (nome scritto piccolo) quanti lati ha, se piu' di
   uno: il timer gli da' un intervallo per lato, uno dopo l'altro. */
function validLati(o) {
  const out = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    for (const k of Object.keys(o).slice(0, 40)) { const n = intra(o[k], 1, 4, 1); if (n > 1) out[normEs(k)] = n; }
  }
  return Object.keys(out).length ? out : undefined;
}
function validTipo(x) {
  if (!x || typeof x !== 'object') return null;
  let t = null;
  if (x.t === 'tabata') t = { t: 'tabata', l: intra(x.l, 1, 600, 20), r: intra(x.r, 0, 600, 10), g: intra(x.g, 0, 99, 0) };
  if (x.t === 'emom') {
    const a = (Array.isArray(x.a) ? x.a : []).slice(0, 20).map(n => intra(n, 1, 10, 1));
    t = { t: 'emom', m: intra(x.m, 0, 180, 0), a: a };
  }
  const lati = t && validLati(x.lati);
  if (lati) t.lati = lati;
  return t;
}
const latiDi = (t, nome) => (t && t.lati && t.lati[normEs(nome)]) || 1;
function validTipi(t, es) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
  const out = {};
  for (const k of Object.keys(t).slice(0, 40)) {
    let via;
    try { via = viaGruppi(JSON.parse(k)); } catch (e) { continue; }
    if (!via.length) continue;
    const usata = es.some(r => via.every((x, i) => (r[2] || [])[i] === x));
    const v = validTipo(t[k]);
    if (usata && v) out[JSON.stringify(via)] = v;
  }
  return Object.keys(out).length ? out : null;
}

/* Il tipo del gruppo piu' interno di una riga che ne ha uno, con la sua via. */
function tipoDi(sc, r) {
  const g = (r && r[2]) || [];
  for (let d = g.length; d > 0; d--) {
    const t = sc && sc.tipi && sc.tipi[JSON.stringify(g.slice(0, d))];
    if (t) return { via: g.slice(0, d), tipo: t };
  }
  return null;
}

/* Quando un gruppo cambia via (nome, o dentro un altro), il suo tipo e
   quelli dei gruppi dentro lo seguono. */
function spostaTipi(sc, vecchia, nuova) {
  if (!sc.tipi) return;
  const out = {};
  for (const k of Object.keys(sc.tipi)) {
    const v = JSON.parse(k);
    const dentro = vecchia.every((x, i) => v[i] === x) && v.length >= vecchia.length;
    out[JSON.stringify(dentro ? nuova.concat(v.slice(vecchia.length)) : v)] = sc.tipi[k];
  }
  sc.tipi = out;
}

/* Il nome di un video: lettere e numeri a caso, e l'estensione. Lo sceglie
   l'app quando si carica il file, e non cambia piu'. */
/* I video di un esercizio: la quinta casella ne tiene uno o piu'. */
const videiDi = r => String((r && r[4]) || '').split(',').filter(Boolean);

/* Stesso nome, stesso esercizio: descrizione e video stanno nella libreria.
   La riga di un workout puo' avere una nota sua, che si legge sopra la
   descrizione. Un nome che in libreria non c'e' (dati scritti alla vecchia)
   prende quello scritto altrove con lo stesso nome. */
const normEs = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
function indiceEs() {
  const m = new Map();
  const metti = (r, lib) => {
    const n = normEs(r && r[0]);
    if (!n) return;
    const x = m.get(n) || { d: '', v: '', lib: false };
    if (x.lib && !lib) return;
    if (!x.d && r[3]) x.d = r[3];
    if (!x.v && r[4]) x.v = r[4];
    if (lib) x.lib = true;
    m.set(n, x);
  };
  for (const r of libro().libreria || []) metti(r, true);
  for (const o of [tstore].concat(tstore.prep || [])) {
    for (const k of Object.keys(o.schede || {})) for (const r of o.schede[k].es) metti(r);
  }
  return m;
}
function completo(r, ind) {
  if (!r) return r;
  const x = (ind || indiceEs()).get(normEs(r[0]));
  if (!x) return r;
  const nota = r[3] || '';
  const d = !nota ? x.d : (!x.d || nota.indexOf(x.d) >= 0) ? nota : nota + '\n\n' + x.d;
  const v = [...new Set(videiDi(r).concat(videiDi([0, 0, 0, 0, x.v])))].slice(0, 6).join(',');
  return [r[0], r[1], r[2], d, v];
}
const nomeVideoOk = v => typeof v === 'string' && /^[a-z0-9]{6,30}\.(mp4|webm|mov|m4v|jpg|mp3|m4a|aac|ogg|wav)$/.test(v);

/* Quanti workout ha ogni giorno: da zero a quattro, giorno per giorno. Zero
   e' un giorno senza allenamenti. I file di prima avevano un numero solo per
   tutta la settimana (`slot`): se manca, vale quello per tutti i giorni. */
function validConti(c, vecchio) {
  const out = {};
  const base = vecchio == null ? SLOT_BASE : validSlot(vecchio);
  for (let g = 0; g < 7; g++) {
    const n = c && typeof c === 'object' ? Math.round(+c[g]) : NaN;
    out[g] = n >= 0 && n <= MAX_SLOT ? n : base;
  }
  return out;
}

/* Una data scritta come nel file: anno-mese-giorno. */
const dataOk = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/* Le preparazioni: un periodo da una data a un'altra, con un piano suo. Il
   piano di una preparazione e' fatto a settimane: la settimana 1 e' quella
   del calendario (lunedi'-domenica) in cui cade l'inizio, la 2 quella dopo, e
   cosi' via. Se le settimane scritte sono meno di quelle del periodo, l'ultima
   si ripete. Le schede e FIRST 15' della preparazione sono copie sue. */
function validPrep(l) {
  if (!Array.isArray(l)) return [];
  return l.map(x => {
    if (!x || typeof x !== 'object' || !dataOk(x.dal) || !dataOk(x.al) || x.al < x.dal) return null;
    const sett = (Array.isArray(x.settimane) ? x.settimane : []).slice(0, 26).map(w => ({
      workout: validWorkout(w && w.workout),
      conti: validConti(w && w.conti, 1)
    }));
    if (!sett.length) sett.push({ workout: {}, conti: validConti(null, 1) });
    return {
      id: typeof x.id === 'string' && /^[\w-]{3,30}$/.test(x.id) ? x.id : 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      nome: String(x.nome == null ? '' : x.nome).slice(0, 50).trim(),
      dal: x.dal, al: x.al,
      settimane: sett,
      schede: validSchede(x.schede),
      mattina: validMattina(x.mattina),
      mattinaVia: !!x.mattinaVia,
      mattinaQuando: validQuando(x.mattinaQuando),
      altre: validAltre(x.altre),
      /* l'ultimo giorno mostra il nome della preparazione (il giorno dell'evento) */
      nomeFine: !!x.nomeFine
    };
  }).filter(Boolean).sort((a, b) => a.dal < b.dal ? -1 : 1);
}

/* Le sorprese (easter egg): cose divertenti che si vedono solo in un giorno
   scelto, la prima volta che l'app si apre quel giorno. Un'immagine a tutto
   schermo, o una postilla colorata in un punto della pagina. Oppure un suono:
   quel giorno il primo scatto del timer suona l'audio scelto. */
function validSorprese(l) {
  if (!Array.isArray(l)) return [];
  return l.slice(0, 200).map(x => {
    if (!x || typeof x !== 'object' || !dataOk(x.giorno)) return null;
    const tipo = x.tipo === 'img' ? 'img' : x.tipo === 'nota' ? 'nota' : x.tipo === 'suono' ? 'suono' : null;
    if (!tipo) return null;
    const o = { id: typeof x.id === 'string' && /^[\w-]{3,30}$/.test(x.id) ? x.id : 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                tipo: tipo, giorno: x.giorno };
    if (tipo === 'img') {
      if (!nomeVideoOk(x.img)) return null;
      o.img = x.img;
    } else if (tipo === 'suono') {
      if (!nomeVideoOk(x.audio)) return null;
      o.audio = x.audio;
    } else {
      o.testo = String(x.testo == null ? '' : x.testo).slice(0, 300).trim();
      if (!o.testo) return null;
      o.dove = String(x.dove || 'top').slice(0, 80);
      o.colore = [0, 1, 2, 3].indexOf(x.colore) >= 0 ? x.colore : 0;
    }
    return o;
  }).filter(Boolean);
}

/* La libreria degli esercizi scritti a parte, fuori dai workout: righe come
   quelle delle schede (nome, quanto, gruppi, descrizione, video). */
const validLibreria = l => { const v = validSchede({ l: { es: Array.isArray(l) ? l : [], rec: '' } }).l; return v ? v.es.filter(r => r[0]) : []; };

/* Di ogni esercizio, per nome (minuscolo, spazi puliti): di chi e' variante
   (p, il nome del padre) e la categoria (c). Serve solo all'editor. */
function validEsercizi(o) {
  const out = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  for (const k of Object.keys(o).slice(0, 2000)) {
    const n = normEs(k).slice(0, 60);
    const x = o[k] || {};
    const p = String(x.p == null ? '' : x.p).slice(0, 60).trim();
    const c = String(x.c == null ? '' : x.c).slice(0, 40).trim();
    if (!n || (!p && !c)) continue;
    out[n] = {};
    if (p && normEs(p) !== n) out[n].p = p;
    if (c) out[n].c = c;
    if (!out[n].p && !out[n].c) delete out[n];
  }
  return out;
}

/* Il contenuto del file, e basta: serve a capire se due versioni sono uguali. */
const contenuto = s => JSON.stringify({ workout: validWorkout(s.workout), schede: validSchede(s.schede),
                                         conti: validConti(s.conti, s.slot), mattina: validMattina(s.mattina),
                                         mattinaVia: !!s.mattinaVia, prep: validPrep(s.prep),
                                         mattinaQuando: validQuando(s.mattinaQuando), altre: validAltre(s.altre),
                                         sorprese: validSorprese(s.sorprese), libreria: validLibreria(s.libreria),
                                         esercizi: validEsercizi(s.esercizi) });

/* --- due telefoni che scrivono insieme -------------------------------------
   Ogni telefono tiene `base`: il piano come era online l'ultima volta che si
   sono visti. Se online c'e' una versione diversa, le due si uniscono
   guardando cosa ha cambiato ognuno rispetto a `base`: quello che ha cambiato
   uno solo resta; se tutti e due hanno cambiato la stessa cosa, vince questo
   telefono. Le liste con un nome o un id (libreria, preparazioni, liste Every
   day, sorprese) si uniscono voce per voce; le righe di un workout sono un
   pezzo solo. */
const istantanea = s => JSON.parse(contenuto(s));
const CHIAVI_LISTE = { libreria: r => normEs(r[0]), prep: x => x.id, altre: x => x.id, sorprese: x => x.id };
const eOgg = x => !!x && typeof x === 'object' && !Array.isArray(x);
function unisci(b, l, r, via, conti) {
  const J = JSON.stringify;
  if (J(l) === J(r)) return l;
  if (J(l) === J(b)) return r;
  if (J(r) === J(b)) return l;
  const chiave = CHIAVI_LISTE[via];
  if (chiave && Array.isArray(l) && Array.isArray(r)) {
    const mb = new Map((Array.isArray(b) ? b : []).map(x => [chiave(x), x]));
    const ml = new Map(l.map(x => [chiave(x), x]));
    const mr = new Map(r.map(x => [chiave(x), x]));
    const out = [];
    for (const k of l.map(chiave).concat(r.map(chiave).filter(k => !ml.has(k)))) {
      const xb = mb.get(k), xl = ml.get(k), xr = mr.get(k);
      /* tolta da una parte: sparisce se l'altra non l'ha toccata */
      if (xl === undefined) { if (xb === undefined || J(xr) !== J(xb)) out.push(xr); continue; }
      if (xr === undefined) { if (xb === undefined || J(xl) !== J(xb)) out.push(xl); continue; }
      out.push(unisci(xb, xl, xr, via + '[]', conti));
    }
    return out;
  }
  /* una voce della libreria: casella per casella (nome, descrizione, video) */
  if (via === 'libreria[]' && Array.isArray(l) && Array.isArray(r)) {
    return l.map((x, i) => unisci(Array.isArray(b) ? b[i] : undefined, x, r[i], '', conti));
  }
  if (eOgg(l) && eOgg(r)) {
    const ob = eOgg(b) ? b : {};
    const out = {};
    for (const k of [...new Set(Object.keys(l).concat(Object.keys(r)))]) {
      const inB = k in ob;
      if (!(k in l)) { if (!inB || J(r[k]) !== J(ob[k])) out[k] = r[k]; continue; }
      if (!(k in r)) { if (!inB || J(l[k]) !== J(ob[k])) out[k] = l[k]; continue; }
      out[k] = unisci(ob[k], l[k], r[k], k, conti);
    }
    return out;
  }
  conti.n++;
  return l;
}

/* Il piano unito entra nel telefono. */
function applicaPiano(d) {
  tstore.workout = validWorkout(d.workout);
  tstore.schede = validSchede(d.schede);
  tstore.conti = validConti(d.conti, d.slot);
  tstore.prep = validPrep(d.prep);
  tstore.mattina = validMattina(d.mattina);
  tstore.mattinaVia = !!d.mattinaVia;
  tstore.mattinaQuando = validQuando(d.mattinaQuando);
  tstore.altre = validAltre(d.altre);
  tstore.sorprese = validSorprese(d.sorprese);
  tstore.libreria = validLibreria(d.libreria);
  tstore.esercizi = validEsercizi(d.esercizi);
}

/* Unisce questo telefono con la versione online `remoto`. Torna quante cose
   erano cambiate da tutte e due le parti (dove ha vinto questo telefono), o
   -1 se non si puo' (manca la base: allora vince questo telefono, come prima). */
function uniscoConOnline(remoto, sha) {
  if (!tstore.base) return -1;
  const conti = { n: 0 };
  const R = istantanea(remoto);
  const u = unisci(tstore.base, istantanea(tstore), R, '', conti);
  /* chi sta scrivendo nell'editor non perde quello che ha scritto */
  const a = document.activeElement;
  if (!$('ed').hidden && a && $('ed').contains(a) && a.blur) a.blur();
  applicaPiano(u);
  allinea(sha, R);
  if (typeof edRidisegna === 'function') edRidisegna();
  paintW();
  return conti.n;
}
let notaUnione = '';
const dettoUnione = n => n > 0 ? 'unito con l\'altro telefono · ' + n + (n === 1 ? ' punto cambiato da tutti e due: tenuto questo' : ' punti cambiati da tutti e due: tenuti questi')
                              : 'unito con le modifiche dell\'altro telefono';

/* ------------------------------------------------------- le chiavi ---- */

/* Una chiave: 16 caratteri a caso in quattro gruppi, fatta per essere
   scritta su un foglio. Niente caratteri che si confondono: niente 0 e o,
   niente 1, l e i. */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
function nuovaChiave() {
  let s = '';
  while (s.length < 16) {
    for (const x of crypto.getRandomValues(new Uint8Array(32))) {
      if (x < 248 && s.length < 16) s += ALFABETO[x % 31];      /* 248 = 31 x 8: tutte uguali */
    }
  }
  return s.match(/.{4}/g).join('-');
}
/* Una chiave scritta a mano: maiuscole, spazi e trattini non contano. */
function pulisciChiave(t) {
  const s = String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.length !== 16 || [...s].some(c => ALFABETO.indexOf(c) < 0)) return '';
  return s.match(/.{4}/g).join('-');
}
const chiaveOk = k => typeof k === 'string' && !!k && pulisciChiave(k) === k;
const codiceOk = f => typeof f === 'string' && /^[0-9a-f]{16}$/.test(f);

/* Il codice dei file di una chiave: un calcolo che va solo in un senso. */
async function codiceDi(k) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('wk-persona:' + k)));
  return [...h.slice(0, 8)].map(b => (b < 16 ? '0' : '') + b.toString(16)).join('');
}

function leggiChiave(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    if (v && chiaveOk(v.k) && codiceOk(v.f)) return { k: v.k, f: v.f };
  } catch (e) { /* niente */ }
  return null;
}
function scriviChiave(key, v) {
  try {
    if (v) localStorage.setItem(key, JSON.stringify(v));
    else localStorage.removeItem(key);
  } catch (e) { /* resta in memoria */ }
}
/* la Data key di prima, se c'era: apre solo il vecchio */
function chiaveVecchia() {
  try { return localStorage.getItem(CHIAVE_KEY) || ''; } catch (e) { return ''; }
}

/* ------------------------------------------------------- lo stato ---- */

/* Un piano letto dal telefono, rimesso in forma. */
function inForma(v) {
  const s = v && typeof v === 'object' ? v : {};
  if (!Array.isArray(s.known)) s.known = [];
  s.workout = validWorkout(s.workout);
  s.schede  = validSchede(s.schede);
  s.slot    = validSlot(s.slot);
  s.mattina = validMattina(s.mattina);
  s.conti   = validConti(s.conti, s.slot);
  s.prep    = validPrep(s.prep);
  /* la scheda del mattino si puo' togliere: nascosta per tutti, sta nel file */
  s.mattinaVia = !!s.mattinaVia;
  s.mattinaQuando = validQuando(s.mattinaQuando);
  s.altre = validAltre(s.altre);
  /* le sorprese restano come sono scritte: si ripuliscono solo quando si salva */
  if (!Array.isArray(s.sorprese)) s.sorprese = [];
  if (!Array.isArray(s.libreria)) s.libreria = [];
  s.esercizi = validEsercizi(s.esercizi);
  s.dirty = !!s.dirty;
  return s;
}

/* L'elenco delle persone e la libreria: il mio file. Ogni persona ha un id,
   un nome che vedo solo io, la sua chiave e il codice dei suoi file. */
function validPersone(l) {
  return (Array.isArray(l) ? l : []).map(x => {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !chiaveOk(x.chiave) || !codiceOk(x.f)) return null;
    return { id: x.id.slice(0, 20), nome: String(x.nome == null ? '' : x.nome).slice(0, 40).trim() || 'Senza nome',
             chiave: x.chiave, f: x.f };
  }).filter(Boolean);
}
const datiMio = m => ({ persone: validPersone(m.persone), libreria: validLibreria(m.libreria), esercizi: validEsercizi(m.esercizi) });
const contenutoMio = m => JSON.stringify(datiMio(m));
function inFormaMio(v) {
  const m = v && typeof v === 'object' ? v : {};
  m.persone = validPersone(m.persone);
  if (!Array.isArray(m.libreria)) m.libreria = [];
  m.esercizi = validEsercizi(m.esercizi);
  if (!Array.isArray(m.known)) m.known = [];
  /* il contenuto dell'ultima versione online: se e' diverso, c'e' da salvare.
     Un elenco appena aperto, ancora vuoto, non ha niente da salvare. */
  if (typeof m.salvato !== 'string') m.salvato = contenutoMio(m);
  return m;
}

let token = '';
try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* niente token */ }
/* La mia chiave e, quando e' letto, il mio file: solo su chi scrive. */
let mia = leggiChiave(MIA_KEY);
let mio = null;
/* la mia chiave non ha aperto nessun elenco */
let miaKo = false;
/* La persona di cui si vede il piano: la sua chiave, il codice dei suoi
   file, e la sua copia nel telefono. */
let chiave = '';
let fidCorrente = '';
let storeKey = '';
let chiaveKo = false;
let tstore = inForma({});

/* Dove stanno libreria ed esercizi: chi ha l'elenco usa i suoi, uguali per
   tutte le persone; chi legge e basta ha la parte arrivata col suo file. */
const libro = () => mio || tstore;

/* La parte della libreria che va nel file di una persona: gli esercizi che
   compaiono nel suo piano e nelle sue preparazioni. Varianti e categorie
   servono solo all'editor: restano nel mio file. Torna true se e' cambiato. */
function nomiUsati(s) {
  const n = new Set();
  for (const o of [s].concat(s.prep || [])) {
    for (const k of Object.keys(o.schede || {})) for (const r of o.schede[k].es) if (r[0]) n.add(normEs(r[0]));
  }
  return n;
}
function allineaLib() {
  if (!mio || !fidCorrente) return false;
  const usati = nomiUsati(tstore);
  const sub = JSON.parse(JSON.stringify(validLibreria(mio.libreria).filter(r => usati.has(normEs(r[0])))));
  const J = JSON.stringify;
  if (J(sub) === J(validLibreria(tstore.libreria)) && !Object.keys(tstore.esercizi || {}).length) return false;
  tstore.libreria = sub;
  tstore.esercizi = {};
  return true;
}

const mioCambiato = () => !!mio && contenutoMio(mio) !== mio.salvato;
const personaCorrente = () => mio ? mio.persone.find(p => p.f === fidCorrente) || null : null;

/* Apre il piano di una persona: da qui in poi tutto parla di lei. Il vecchio
   tiene la copia di sempre, sotto STORE_KEY. */
function apriPersona(k, f) {
  chiave = k || '';
  fidCorrente = f || '';
  storeKey = !f ? '' : f === VECCHIO ? STORE_KEY : STORE_KEY + ':' + f;
  chiaveKo = false;
  shaPubblicato = undefined;
  pubblicaErr = '';
  tstore = inForma(storeKey ? readStore(storeKey) : {});
}

/* mw: i campi del piano aperti; sch: la tendina WORKOUTS aperta;
   cal: la tendina della programmazione aperta;
   solo: la sola scheda scelta con la sua pastiglia; vuoto = tutte.
   Le due tendine partono sempre chiuse: aprendo l'app si vede oggi. */
let mostra = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(VISTA_KEY) || 'null');
    if (v && typeof v === 'object')
      return { mw: !!v.mw, sch: false, cal: false, solo: typeof v.solo === 'string' ? v.solo : '' };
  } catch (e) { /* si parte col piano da leggere */ }
  return { mw: false, sch: false, cal: false, solo: '' };
})();
function salvaMostra() {
  try { localStorage.setItem(VISTA_KEY, JSON.stringify(mostra)); } catch (e) {}
}
/* Chi ha il token e la sua chiave scrive, gli altri leggono e basta. Cosi'
   la stessa app serve a tutti: chi tiene i piani li scrive, chi si allena
   legge il suo, e gli arriva aggiornato. Senza token non si vede nessun
   bottone per scrivere: una modifica fatta li' non si potrebbe salvare, e
   bloccherebbe gli aggiornamenti che arrivano da GitHub. Una chiave mia che
   non apre nessun elenco non fa scrivere niente: si creerebbe un elenco
   nuovo, accanto a quello vero. */
const editore = () => !!token && !!mio && !miaKo;
const scrive = () => editore() && !!fidCorrente && fidCorrente !== VECCHIO;
const modifica = () => scrive() && mostra.mw;

/* Ogni scrittura nel telefono lascia l'ora: se un'altra copia dell'app aperta
   ha scritto dopo, e' quella la buona. */
function saveLocal() {
  if (!storeKey) return;
  tstore.stamp = Date.now();
  writeStore(storeKey, tstore);
}
function saveMio() {
  if (!mio) return;
  mio.stamp = Date.now();
  writeStore(MIO_KEY, mio);
}

function ripescaLocale() {
  let preso = false;
  if (mio) {
    const m = readStore(MIO_KEY);
    if (m.stamp > (mio.stamp || 0) && m.f === mio.f) { mio = inFormaMio(m); preso = true; }
  }
  if (storeKey) {
    const v = readStore(storeKey);
    if (v.stamp > (tstore.stamp || 0)) { tstore = inForma(v); preso = true; }
  }
  return preso;
}

function sincronizzaLocale() {
  if (!ripescaLocale()) return false;
  paintW();
  if (typeof edRidisegna === 'function') edRidisegna();
  paintSalva();
  return true;
}

/* Ogni modifica passa di qui: si segna, e compare Salva. Una modifica alla
   libreria cambia anche il mio file, e la parte che va nel file della
   persona aperta. */
function touch() {
  if (!scrive()) return;
  allineaLib();
  tstore.dirty = true;
  saveLocal();
  saveMio();
  paintSalva();
  paintSync();
  autoSalva();
}

/* Si salva da solo, poco dopo l'ultima modifica: piu' modifiche di fila
   partono insieme, in un salvataggio solo. */
let autoT = null;
function autoSalva() {
  clearTimeout(autoT);
  if (!editore()) return;
  autoT = setTimeout(() => {
    if (salvando) { autoSalva(); return; }
    if (daSalvare() && !salvaErr) pushTasks();
  }, 2500);
}

/* ------------------------------------------------ il piano ---- */

const GIORNI  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const GIORNI2 = ['Do', 'Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa'];
const MESI3   = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const SETTIMANA = [1, 2, 3, 4, 5, 6, 0];
/* La pagina di chi si allena parla italiano; l'editor resta in inglese. */
const GIORNI_IT  = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const GIORNI2_IT = ['Do', 'Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa'];
const MESI3_IT   = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const ORDINALI_IT = ['1°', '2°', '3°', '4°'];      /* da lunedi' a domenica */

/* Una riga di tabella: le celle in ordine, ognuna con le sue classi. */
function tabRiga(celle, cls) {
  const r = el('div', 'tabr' + (cls ? ' ' + cls : ''));
  for (const c of celle) {
    const d = el('div', 'tabc' + (c.cls ? ' ' + c.cls : ''), c.t);
    r.appendChild(d);
  }
  return r;
}

/* ------------------------------------------------ le date ---- */

const pad2 = n => (n < 10 ? '0' : '') + n;
const chiaveData = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const daChiave = k => new Date(k + 'T00:00:00');
function piuGiorni(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
/* il lunedi' della settimana di una data */
function lunedi(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
/* "3 Nov" */
const dataCorta = k => { const d = daChiave(k); return d.getDate() + ' ' + MESI3[d.getMonth()]; };
const dataIt = k => { const d = daChiave(k); return d.getDate() + ' ' + MESI3_IT[d.getMonth()]; };
const giorniFra = (a, b) => Math.round((daChiave(b) - daChiave(a)) / 86400000);

/* ------------------------------------------------ quale piano vale ---- */

/* La preparazione in corso in una data, o null. */
const prepDi = k => tstore.prep.find(p => p.dal <= k && k <= p.al) || null;

/* Il numero della settimana di una preparazione in cui cade una data: 0 per la
   prima. Oltre l'ultima scritta si ripete l'ultima. */
function settimanaDi(p, k) {
  const i = Math.floor(giorniFra(chiaveData(lunedi(daChiave(p.dal))), chiaveData(lunedi(daChiave(k)))) / 7);
  return Math.max(0, Math.min(i, p.settimane.length - 1));
}

/* Il piano che vale in una data: quello della preparazione, se ce n'e' una in
   corso, altrimenti quello di sempre. `src` dice da dove vengono le schede. */
function pianoDi(k) {
  const p = prepDi(k);
  if (!p) return { src: 'base', prep: null, workout: tstore.workout, conti: tstore.conti,
                   schede: tstore.schede, mattina: tstore.mattina, mattinaVia: tstore.mattinaVia,
                   mattinaQuando: tstore.mattinaQuando, altre: tstore.altre };
  const i = settimanaDi(p, k);
  const w = p.settimane[i];
  return { src: p.id, prep: p, sett: i, workout: w.workout, conti: w.conti,
           schede: p.schede, mattina: p.mattina, mattinaVia: p.mattinaVia,
           mattinaQuando: p.mattinaQuando, altre: p.altre };
}

/* Le schede di una fonte: il piano di sempre o una preparazione. */
function schedeDi(src) {
  if (src === 'base') return tstore.schede;
  const p = tstore.prep.find(x => x.id === src);
  return p ? p.schede : {};
}

/* I workout di un giorno di un piano: solo le caselle che il giorno ha. */
const workoutDelGiorno = (pi, g) => (pi.workout[g] || []).slice(0, pi.conti[g] || 0);

/* ------------------------------------------------ la pagina ---- */

function paintEdit() {
  $('wMod').hidden = !scrive();
}

/* Ridisegnare la pagina la rifa' da zero: la posizione dello scorrimento si
   segna prima e si rimette dopo. */
function paintW() {
  const y = window.scrollY;
  disegnaW();
  window.scrollTo(0, y);
}

/* La fila delle pastiglie scorre di lato per conto suo: ridisegnandola resta
   dove l'aveva lasciata il dito. */
let chipX = 0;

/* La pagina si legge e basta: si scrive nell'editor. Tutto quello che si vede
   viene dal piano che vale oggi, e la tabella giorno per giorno: se una
   preparazione finisce a meta' settimana, da quel giorno torna il piano di
   sempre. */
/* L'anteprima di una preparazione che sta per iniziare: la pagina si
   disegna come se fosse gia' il primo giorno. null = la pagina di oggi. */
let anteprima = null;
/* Le postille (easter egg) accese adesso: spariscono al primo tocco,
   scorrendo, o uscendo dall'app. */
let festa = [];
/* Quanti giorni prima dell'inizio compare l'avviso: dal sabato per un lunedi'. */
const AVVISO_GIORNI = 2;

function disegnaW() {
  const pagina = $('wlist');
  pagina.textContent = '';
  /* nessuna persona aperta: si dice cosa fare */
  if (!fidCorrente) {
    const box = el('section', 'col col-sx');
    box.appendChild(el('p', 'vuoto',
      editore()       ? 'Ancora nessuna persona. Tocca "Persone" in alto per aggiungerne una.'
      : token && !mia ? 'Per scrivere le schede serve la tua chiave: ⚙ Impostazioni → Sviluppatore.'
      : token         ? 'Controlla la tua chiave in ⚙ Impostazioni → Sviluppatore.'
      :                 'Per vedere la tua scheda apri il collegamento che hai ricevuto.'));
    pagina.appendChild(box);
    return;
  }
  const vero = today();
  const pAnt = anteprima ? tstore.prep.find(x => x.id === anteprima) : null;
  if (!pAnt) anteprima = null;
  const t0 = pAnt ? daChiave(pAnt.dal) : vero;
  const kOggi = chiaveData(t0);
  const oggi = pianoDi(kOggi);

  const box = el('section', 'col col-sx');
  const dx = el('section', 'col col-dx');
  /* la preparazione in corso: nome, date, quanto manca. Sta sopra tutto, fuori
     dalla tendina: si vede appena si apre l'app */
  if (oggi.prep) {
    const p = oggi.prep;
    const manca = giorniFra(kOggi, p.al);
    const b = el('div', 'prepbanda');
    if (p.nomeFine && p.nome && kOggi === p.al && !pAnt) {
      /* il giorno dell'evento: OGGI e il nome, in grande */
      b.classList.add('evento');
      b.appendChild(el('p', 'prepbanda-eti', 'OGGI'));
      b.appendChild(el('p', 'prepbanda-evento', p.nome));
    } else {
      b.appendChild(el('p', 'prepbanda-eti', 'PREPARAZIONE' + (p.nome ? ' · ' + p.nome : '')));
      b.appendChild(el('p', 'prepbanda-date', dataIt(p.dal) + ' → ' + dataIt(p.al) +
        (pAnt ? '' : ' · ' + (manca === 0 ? 'ultimo giorno' : manca === 1 ? 'manca 1 giorno' : 'mancano ' + manca + ' giorni'))));
    }
    pagina.appendChild(b);
  }
  pagina.appendChild(box);
  pagina.appendChild(dx);

  /* in anteprima: la barra per tornare indietro */
  if (pAnt) {
    const bar = el('div', 'antbar');
    const ind = el('button', 'schbtn antindietro', '‹ Indietro');
    ind.type = 'button';
    ind.dataset.antindietro = '1';
    bar.appendChild(ind);
    bar.appendChild(el('span', 'antbar-eti', 'ANTEPRIMA'));
    box.appendChild(bar);
  }

  if (!pAnt) postille(box, 'top');

  /* una preparazione che inizia fra poco: l'avviso, con l'anteprima */
  if (!pAnt) {
    const kVero = chiaveData(vero);
    const pross = tstore.prep.find(x => x.dal > kVero && giorniFra(kVero, x.dal) <= AVVISO_GIORNI);
    if (pross) {
      const fra = giorniFra(kVero, pross.dal);
      const b = el('div', 'prossima');
      const quando = fra === 1 ? 'Domani' : GIORNI_IT[daChiave(pross.dal).getDay()].replace(/^./, c => c.toUpperCase());
      const testo = el('p', 'prossima-testo', quando + ' inizia ');
      testo.appendChild(el('b', null, pross.nome || 'la preparazione'));
      b.appendChild(testo);
      const ap = el('button', 'prossima-btn', 'Anteprima');
      ap.type = 'button';
      ap.dataset.anteprima = pross.id;
      b.appendChild(ap);
      box.appendChild(b);
    }
  }

  /* la settimana sta in una tendina sopra gli allenamenti: la pagina
     comincia da quello che si fa oggi */
  const cal = el('div', 'calcorpo');

  /* La settimana di adesso, da lunedi' a domenica, ogni giorno col piano che
     vale in quella data. Le colonne sono quante ne servono al giorno piu'
     pieno; gli altri hanno le caselle in piu' vuote. */
  const lun = lunedi(t0);
  const giorni = SETTIMANA.map((g, i) => {
    const d = piuGiorni(lun, i);
    const k = chiaveData(d);
    const pi = pianoDi(k);
    return { g: g, d: d, k: k, pi: pi, w: workoutDelGiorno(pi, g) };
  }).filter(x => !pAnt || (x.k >= pAnt.dal && x.k <= pAnt.al));   /* in anteprima: solo i giorni della preparazione */
  const n = Math.max(1, ...giorni.map(x => x.pi.conti[x.g] || 0));
  if (!pAnt) postille(cal, 'week');
  const tab = el('div', 'tab tab-w');
  tab.style.setProperty('--wcol', n);
  /* in cima alla tabella, sempre la stessa scritta, su tutta la riga */
  const capo = tabRiga([{ t: 'SETTIMANA', cls: 'tuttariga' }], 'capo');
  tab.appendChild(capo);
  for (const x of giorni) {
    const celle = [{ t: GIORNI2_IT[x.g] + ' ' + x.d.getDate(), cls: 'eti' }];
    const quanti = x.pi.conti[x.g] || 0;
    const ev = x.pi.prep && x.pi.prep.nomeFine && x.pi.prep.nome && x.k === x.pi.prep.al;
    if (ev) celle.push({ t: x.pi.prep.nome, cls: 'evento' });
    else for (let i = 0; i < n; i++) {
      if (i >= quanti) celle.push({ t: '', cls: 'fuori' });
      else if (eLista(x.w[i])) celle.push({ t: nomeLista(x.pi, x.w[i]) || '—', cls: 'every' });
      else celle.push({ t: x.w[i] || '—', cls: x.w[i] ? '' : 'vuota' });
    }
    const cls = [x.k === kOggi ? 'oggi' : '', x.pi.prep ? 'inprep' : ''].filter(Boolean).join(' ');
    tab.appendChild(tabRiga(celle, cls));
  }
  cal.appendChild(tab);

  if (!pAnt) postille(box, 'every');
  paintMorning(box, oggi, kOggi);
  if (!pAnt) postille(box, 'oggi');
  paintOggi(box, oggi, kOggi, t0.getDay(), pAnt ? 'ALLENAMENTI DI ' + GIORNI_IT[t0.getDay()].toUpperCase() + ' ' + t0.getDate() : 'ALLENAMENTI DI OGGI');

  /* la tendina della programmazione: in anteprima resta aperta, si guarda
     proprio quella */
  const aperta = mostra.cal || !!pAnt;
  const bar = el('button', 'wkbar calbar' + (aperta ? ' open' : ''));
  bar.type = 'button';
  bar.dataset.calroot = '1';
  bar.setAttribute('aria-expanded', aperta ? 'true' : 'false');
  bar.appendChild(el('span', 'wkbar-nome', 'PROGRAMMAZIONE' + (oggi.prep && !aperta ? ' · ' + (oggi.prep.nome || 'preparazione') : '')));
  bar.appendChild(el('span', 'wkbar-frec', '▾'));
  dx.appendChild(bar);
  if (aperta) dx.appendChild(cal);
  if (!pAnt) postille(dx, 'wk');
  paintSchede(dx, oggi);
}

/* Gli allenamenti diversi scritti in un piano, nell'ordine della settimana. */
function allenamentiDi(pi) {
  const out = [];
  for (const g of SETTIMANA) {
    for (const v of workoutDelGiorno(pi, g)) if (v && !eLista(v) && out.indexOf(v) < 0) out.push(v);
  }
  return out;
}

/* Le frecce ai lati della fila: spariscono se ci sta tutto, e quella del
   capolinea si spegne quando da quella parte non c'e' piu' niente. */
function frecceChip(riga) {
  const f = riga.querySelector('.chipsch');
  const sx = riga.querySelector('[data-chipscorri="-1"]');
  const dx = riga.querySelector('[data-chipscorri="1"]');
  const scorre = f.scrollWidth > f.clientWidth + 1;
  sx.hidden = !scorre;
  dx.hidden = !scorre;
  if (!scorre) return;
  sx.classList.toggle('spenta', f.scrollLeft <= 1);
  dx.classList.toggle('spenta', f.scrollLeft >= f.scrollWidth - f.clientWidth - 1);
}

/* Una scheda da leggere: il nome nella riga grigia in alto, poi gli esercizi. */
function tabScheda(nome, sc) {
  const tab = el('div', 'tab tab-i');
  osservaTab.observe(tab);
  const cap = el('div', 'tabr capo schcapo');
  cap.appendChild(el('div', 'tabc', nome));
  /* una quantita' scritta senza esercizio sta nella banda del nome */
  const sole = (sc.es || []).filter(r => !r[0] && r[1]).map(r => r[1]);
  if (sole.length) cap.appendChild(el('div', 'tabc val', sole.join('  ·  ')));
  tab.appendChild(cap);
  return tab;
}

/* Le due colonne di una scheda, nome e quanto, si dividono lo spazio secondo
   quello che c'e' scritto: se il quanto e' lungo la sua colonna si allarga,
   fino a meta' scheda al massimo. Si prova ogni larghezza e si tiene quella
   che fa la scheda piu' bassa; a parita', la colonna del nome resta larga. */
const COL_Q_MIN = 1.25 / 4.25, COL_Q_MAX = 0.5;
let righello = null;
function righe(testo, font, largo) {
  if (!testo) return 0;
  if (largo <= 0) return 99;
  const ctx = righello || (righello = document.createElement('canvas').getContext('2d'));
  ctx.font = font;
  const spazio = ctx.measureText(' ').width;
  let n = 1, x = 0;
  for (const w of testo.split(/\s+/).filter(Boolean)) {
    const lw = ctx.measureText(w).width;
    if (lw > largo) {                       /* parola piu' lunga della colonna: va a capo dentro */
      if (x > 0) n++;
      n += Math.ceil(lw / largo) - 1;
      x = lw % largo;
      continue;
    }
    if (x > 0 && x + spazio + lw > largo) { n++; x = lw; }
    else x += (x > 0 ? spazio : 0) + lw;
  }
  return n;
}
function bilanciaTab(tab) {
  if (!tab.isConnected) { osservaTab.unobserve(tab); return; }
  const dati = [];
  for (const r of tab.querySelectorAll('.tabr')) {
    const eti = r.querySelector(':scope > .tabc.eti'), val = r.querySelector(':scope > .tabc.val');
    if (!eti || !val || r.classList.contains('capo')) continue;
    const W = r.clientWidth;
    if (!W) continue;
    const fe = getComputedStyle(eti), fv = getComputedStyle(val);
    const pad = c => parseFloat(c.paddingLeft) + parseFloat(c.paddingRight);
    const frec = val.querySelector('.desfrec');
    const extra = frec ? frec.getBoundingClientRect().width + 8 : 0;
    const tv = [...val.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ');
    dati.push({ W, te: eti.textContent, tv, font: [fe.font, fv.font], pad: [pad(fe), pad(fv) + extra + 1] });
  }
  if (!dati.length) return;
  let meglio = COL_Q_MIN, costo = Infinity;
  for (let p = COL_Q_MIN; p <= COL_Q_MAX + 1e-9; p += 0.01) {
    let c = 0;
    for (const d of dati) c += Math.max(righe(d.te, d.font[0], d.W * (1 - p) - d.pad[0]), righe(d.tv, d.font[1], d.W * p - d.pad[1]));
    if (c < costo - 1e-9) { costo = c; meglio = p; }
  }
  const q = Math.min(COL_Q_MAX, meglio);
  tab.style.setProperty('--colonne', 'minmax(0,' + (1 - q).toFixed(3) + 'fr) minmax(0,' + q.toFixed(3) + 'fr)');
}
/* la scheda si ribilancia quando cambia larghezza: girando il telefono, o
   aprendo la tendina che la contiene */
const osservaTab = typeof ResizeObserver === 'function'
  ? new ResizeObserver(voci => { for (const v of voci) bilanciaTab(v.target); })
  : { observe() {}, unobserve() {} };

/* Le righe di una scheda: gli esercizi, e il recupero in fondo a destra, solo
   se e' scritto. `src` e `nome` dicono dove sta la scheda, per aprire la
   descrizione di un esercizio. */
function righeScheda(tab, sc, src, nome) {
  const pila = new Pila(tab);
  const ind = indiceEs();
  sc.es.forEach((r0, i) => {
    if (!r0[0]) return;
    const r = completo(r0, ind);              /* senza nome: sta nella banda, o e' vuota */
    const dove = pila.vai(r[2] || []);
    const riga = r[1]
      ? tabRiga([{ t: r[0] || '—', cls: r[0] ? 'eti' : 'eti vuota' },
                 { t: r[1], cls: 'val' }])
      : tabRiga([{ t: r[0], cls: 'eti' }], 'solo');
    /* con una descrizione dentro, la riga si tocca e si apre. La freccia dice
       che sotto c'e' qualcosa da leggere o da guardare. In un Tabata si apre
       ogni esercizio, anche senza descrizione: da li' parte la sequenza, che
       comincia sempre dal primo del gruppo. */
    const tabata = !!tipoDi(sc, r0) || (r[2] || []).some(x => /tabata/i.test(x));
    if (r[3] || r[4] || tabata) {
      riga.classList.add('condesc');
      riga.dataset.desces = JSON.stringify([src, nome, i]);
      riga.lastChild.appendChild(el('span', 'desfrec', '▾'));   /* uguale per tutti: con o senza video */
    }
    dove.appendChild(riga);
  });
  if (sc.rec) {
    const r = el('div', 'tabr recgiu');
    const c = el('div', 'tabc');
    c.appendChild(el('span', 'receti', 'Recupero'));
    c.appendChild(el('span', 'recval', sc.rec));
    /* un recupero scritto come tempo ha il tasto del suo timer, a sinistra
       nella stessa casella: niente descrizione, parte subito */
    if (tempiRiga(sc.rec)) {
      r.classList.add('contimer');
      const b = el('button', 'tavvia tavvia-rec');
      b.type = 'button';
      b.dataset.recup = JSON.stringify([src, nome]);
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="14" r="8"/><path d="M12 14V10M9 2h6M12 2v4M19 7l1.5-1.5"/></svg>';
      b.appendChild(el('span', null, 'Recupero'));
      c.prepend(b);
      /* il tasto dice gia' Recupero: a destra resta solo il tempo */
      c.querySelector('.receti').remove();
    }
    r.appendChild(c);
    tab.appendChild(r);
  } else if (!sc.es.length) {
    tab.appendChild(tabRiga([{ t: '—', cls: 'vuota' }]));
  }
  return tab;
}

/* Le scatole dei gruppi aperte mentre si scorre le righe di una scheda. Ogni
   riga dice la sua via: quello che e' in comune con la riga prima resta
   aperto, il resto si chiude e si riapre. */
function Pila(radice) {
  this.via = [];
  this.dove = [radice];
}

Pila.prototype.vai = function (g) {
  let n = 0;
  while (n < this.via.length && n < g.length && this.via[n] === g[n]) n++;
  this.via = this.via.slice(0, n);
  this.dove = this.dove.slice(0, n + 1);
  let primo = null;
  for (let i = n; i < g.length; i++) {
    const box = el('div', 'grpbox');
    const corpo = el('div', 'grpcorpo');
    box.appendChild(corpo);
    this.dove[this.dove.length - 1].appendChild(box);
    this.via.push(g[i]);
    this.dove.push(corpo);
    if (!primo) primo = box;
  }
  if (primo) primo.appendChild(el('span', 'grpeti', g.slice(n).join(' › ')));
  return this.dove[this.dove.length - 1];
};

/* L'attivita' del mattino ha una scheda sua, che non viene dal piano: niente
   recupero. Nel file sta sotto una chiave fissa, che non cambia mai; il nome
   che si legge sta a parte e si riscrive quando si vuole. */
const MORNING = '__morning';
/* Un posto della settimana puo' tenere una lista Every day invece di un
   workout: la prima (MORNING) o una delle altre (EV e il suo id). */
const eLista = v => typeof v === 'string' && v.indexOf('__') === 0;
function nomeLista(pi, k) { const l = listeDi(pi).find(x => x.chiave === k); return l ? l.nome : ''; }
const nomeMattinaDi = pi => (pi && pi.mattina) || MATTINA_BASE;

/* Se una lista Every day si vede in una data. */
function quandoVale(q, k) {
  q = q || { modo: 'sempre' };
  if (q.modo === 'giorni') return q.giorni.indexOf(daChiave(k).getDay()) >= 0;
  if (q.modo === 'ogni') { const d = giorniFra(q.dal, k); return d >= 0 && d % q.n === 0; }
  if (q.modo === 'date') return q.date.indexOf(k) >= 0;
  if (q.modo === 'ciclo') {
    const d = giorniFra(q.dal, k);
    const giro = q.passi.reduce((a, x) => a + Math.abs(x), 0);
    if (d < 0 || !giro) return false;
    let r = d % giro;
    for (const x of q.passi) { if (r < Math.abs(x)) return x > 0; r -= Math.abs(x); }
    return false;
  }
  return true;
}

/* Tutte le liste Every day di un piano: la prima e quelle in piu'. */
function listeDi(pi) {
  return [{ chiave: MORNING, nome: nomeMattinaDi(pi), via: !!pi.mattinaVia, quando: pi.mattinaQuando }]
    .concat((pi.altre || []).map(a => ({ chiave: EV(a.id), nome: a.nome || 'Every day', via: a.via, quando: a.quando })));
}

/* Le liste Every day che si vedono in una data: accese, del giorno giusto, e
   con qualcosa dentro. */
function listeDelGiorno(pi, k) {
  return listeDi(pi).filter(l => !l.via && quandoVale(l.quando, k) && pi.schede[l.chiave] && pi.schede[l.chiave].es.length);
}

function paintMorning(box, pi, k) {
  for (const l of listeDelGiorno(pi, k)) {
    const sc = pi.schede[l.chiave];
    const tab = tabScheda(l.nome, sc);
    box.appendChild(righeScheda(tab, { es: sc.es, rec: '', tipi: sc.tipi }, pi.src, l.chiave));
  }
}

/* Quello che si fa oggi, senza aprire niente: le schede del giorno, solo se
   hanno degli esercizi scritti. */
function paintOggi(box, pi, k, g, titolo) {
  let capo = false;
  for (const nome of workoutDelGiorno(pi, g)) {
    if (!nome) continue;
    /* un giorno con la lista di tutti i giorni: se il box in alto e' spento,
       la lista compare qui; se e' acceso c'e' gia' */
    if (eLista(nome)) {
      const scm = pi.schede[nome];
      if (!scm || !scm.es.length || listeDelGiorno(pi, k).some(l => l.chiave === nome)) continue;
      if (!capo) { box.appendChild(el('p', 'grp', titolo || 'ALLENAMENTI DI OGGI')); capo = true; }
      const tm = tabScheda(nomeLista(pi, nome) || 'Every day', scm);
      tm.classList.add('tab-oggi');
      box.appendChild(righeScheda(tm, { es: scm.es, rec: '', tipi: scm.tipi }, pi.src, nome));
      continue;
    }
    const sc = pi.schede[nome];
    if (!sc || (!sc.es.length && !sc.rec)) continue;
    if (!capo) { box.appendChild(el('p', 'grp', titolo || 'ALLENAMENTI DI OGGI')); capo = true; }
    if (!anteprima) postille(box, 'w:' + nome);
    const t = tabScheda(nome, sc);
    t.classList.add('tab-oggi');
    box.appendChild(righeScheda(t, sc, pi.src, nome));
  }
}

/* Le schede del piano che vale oggi, dentro una tendina: una barra con il
   numero e la freccia, che si apre e si chiude. Solo quelle con qualcosa
   dentro: le altre non avrebbero niente da far leggere. */
function paintSchede(box, pi) {
  const nomi = allenamentiDi(pi).filter(n => pi.schede[n] && (pi.schede[n].es.length || pi.schede[n].rec));
  const apri = el('button', 'wkbar' + (mostra.sch ? ' open' : ''));
  apri.type = 'button';
  apri.dataset.schroot = '1';
  apri.setAttribute('aria-expanded', mostra.sch ? 'true' : 'false');
  apri.appendChild(el('span', 'wkbar-nome', 'ALLENAMENTI'));
  apri.appendChild(el('span', 'wkbar-frec', '▾'));
  box.appendChild(apri);
  if (!mostra.sch) return;

  if (!nomi.length) {
    box.appendChild(el('p', 'vuoto', 'Il piano è ancora vuoto.'));
    return;
  }

  const riga = el('div', 'chiprow');
  const sx = el('button', 'chipfrec', '‹');
  sx.type = 'button'; sx.dataset.chipscorri = '-1';
  sx.setAttribute('aria-label', 'Scorri gli allenamenti a sinistra');
  const chips = el('div', 'chips chipsch');
  for (const nome of nomi) {
    const acceso = mostra.solo === nome;
    const c = el('button', 'chip chipw' + (acceso ? ' sel' : ''), nome);
    c.type = 'button';
    c.dataset.chipsch = nome;
    c.setAttribute('aria-pressed', acceso ? 'true' : 'false');
    chips.appendChild(c);
  }
  const dx = el('button', 'chipfrec', '›');
  dx.type = 'button'; dx.dataset.chipscorri = '1';
  dx.setAttribute('aria-label', 'Scorri gli allenamenti a destra');
  riga.appendChild(sx); riga.appendChild(chips); riga.appendChild(dx);
  box.appendChild(riga);
  chips.scrollLeft = chipX;
  chips.addEventListener('scroll', () => {
    chipX = chips.scrollLeft;
    frecceChip(riga);
  }, { passive: true });
  requestAnimationFrame(() => frecceChip(riga));

  /* nessuna pastiglia accesa: si vedono tutte; una accesa: solo quella */
  const visti = nomi.indexOf(mostra.solo) >= 0 ? [mostra.solo] : nomi;
  const lista = el('div', 'schlista');
  box.appendChild(lista);
  for (const nome of visti) {
    const sc = pi.schede[nome];
    if (!anteprima) postille(lista, 'w:' + nome);
    lista.appendChild(righeScheda(tabScheda(nome, sc), sc, pi.src, nome));
  }
}

/* ------------------------------------------------- i tocchi sulla pagina ---- */

$('wlist').addEventListener('click', ev => {
  const ant = ev.target.closest('button[data-anteprima]');
  if (ant) {
    anteprima = ant.dataset.anteprima;
    history.pushState({ ant: 1 }, '');
    disegnaW();
    window.scrollTo(0, 0);
    return;
  }
  if (ev.target.closest('button[data-antindietro]')) { history.back(); return; }
  if (ev.target.closest('button[data-calroot]')) {
    mostra.cal = !mostra.cal;
    salvaMostra();
    paintW();
    return;
  }
  if (ev.target.closest('button[data-schroot]')) {
    mostra.sch = !mostra.sch;
    salvaMostra();
    paintW();
    return;
  }
  const fr = ev.target.closest('button[data-chipscorri]');
  if (fr) {
    const f = fr.parentElement.querySelector('.chipsch');
    f.scrollBy({ left: +fr.dataset.chipscorri * f.clientWidth * 0.8, behavior: 'smooth' });
    return;
  }
  const ch = ev.target.closest('button[data-chipsch]');
  if (ch) {
    const n = ch.dataset.chipsch;
    mostra.solo = mostra.solo === n ? '' : n;
    salvaMostra();
    paintW();
    return;
  }
  const dl = ev.target.closest('.tabr[data-desces]');
  if (dl) {
    const q = JSON.parse(dl.dataset.desces);
    apriDesc(q[0], q[1], q[2]);
    return;
  }
  const rc = ev.target.closest('button[data-recup]');
  if (rc) {
    const q = JSON.parse(rc.dataset.recup);
    avviaRecupero(q[0], q[1]);
  }
});

/* ------------------------------------------- descrizione di un esercizio --- */

/* Si apre a tutto schermo, col testo grande: si legge mentre si fa
   l'esercizio. Dalla scheda aperta la stessa finestra si scrive. */
const dlgDesc = $('descrizione');

/* Un link scritto da solo su una riga: e' un video. */
const RIGA_LINK = /^\s*(https?:\/\/\S+)\s*$/i;
const haVideo = txt => String(txt || '').split('\n').some(r => RIGA_LINK.test(r));

/* Da un link al modo di mostrarlo. YouTube, Vimeo e Google Drive hanno un
   lettore da incorporare; un file video diretto si suona da solo; tutto il
   resto (Instagram, TikTok...) diventa un bottone che apre il link. I
   lettori che lo permettono partono muti: l'audio si accende dal lettore. */
function videoDi(link) {
  let u;
  try { u = new URL(link); } catch (e) { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const dritto = /\.(mp4|webm|m4v|mov|ogv)$/i.test(u.pathname);
  if (dritto) return { tipo: 'file', src: u.href };

  let id = '', verticale = false, inizio = 0;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
      if (m) { id = m[2]; verticale = m[1] === 'shorts'; }
    }
  }
  if (id && /^[\w-]{6,20}$/.test(id)) {
    const t = u.searchParams.get('t') || u.searchParams.get('start') || '';
    const hms = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (hms) inizio = (+hms[1] || 0) * 3600 + (+hms[2] || 0) * 60 + (+hms[3] || 0);
    return { tipo: 'frame', verticale: verticale,
             src: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1&mute=1' + (inizio ? '&start=' + inizio : '') };
  }
  /* Wistia, Loom, Dailymotion, Streamable: tutti hanno un lettore da incorporare */
  if (/(^|\.)wistia\.(com|net)$/.test(host) || host === 'wi.st') {
    const m = u.pathname.match(/\/(?:medias|embed\/iframe|embed\/medias|iframe)\/([a-z0-9]+)/i);
    if (m) return { tipo: 'frame', src: 'https://fast.wistia.net/embed/iframe/' + m[1] + '?muted=true' };
  }
  if (host === 'loom.com') {
    const m = u.pathname.match(/^\/(?:share|embed)\/([a-f0-9]+)/i);
    if (m) return { tipo: 'frame', src: 'https://www.loom.com/embed/' + m[1] };
  }
  if (host === 'dailymotion.com' || host === 'dai.ly') {
    const m = host === 'dai.ly' ? u.pathname.match(/^\/([a-z0-9]+)/i) : u.pathname.match(/^\/video\/([a-z0-9]+)/i);
    if (m) return { tipo: 'frame', src: 'https://www.dailymotion.com/embed/video/' + m[1] + '?mute=true' };
  }
  if (host === 'streamable.com') {
    const m = u.pathname.match(/^\/(?:e\/)?([a-z0-9]+)/i);
    if (m) return { tipo: 'frame', src: 'https://streamable.com/e/' + m[1] };
  }
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)/);
    if (m) return { tipo: 'frame', src: 'https://player.vimeo.com/video/' + m[1] + '?muted=1' };
  }
  if (host === 'drive.google.com') {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    const d = m ? m[1] : u.searchParams.get('id');
    if (d) return { tipo: 'frame', src: 'https://drive.google.com/file/d/' + encodeURIComponent(d) + '/preview' };
  }
  return { tipo: 'link', src: u.href };
}

function videoNodo(link) {
  const v = videoDi(link);
  if (!v) return el('p', 'desriga', link);
  if (v.tipo === 'file') {
    const w = el('div', 'desvideo');
    const vid = el('video');
    vid.src = v.src;
    vid.controls = true;
    vid.playsInline = true;
    vid.preload = 'metadata';
    w.appendChild(vid);
    return w;
  }
  if (v.tipo === 'frame') {
    const w = el('div', 'desvideo frame' + (v.verticale ? ' verticale' : ''));
    const f = el('iframe');
    f.src = v.src;
    f.loading = 'lazy';
    f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.title = 'Video';
    w.appendChild(f);
    return w;
  }
  const a = el('a', 'deslink', '▶  Apri il video');
  a.href = v.src;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/* Il testo della descrizione, riga per riga. Una riga che comincia con un
   trattino, un asterisco o un numero e' una voce di elenco. Un link da solo
   su una riga e' un video. */
function testoDesc(box, txt, senzaLink) {
  box.textContent = '';
  for (const riga of String(txt || '').split('\n')) {
    const lk = riga.match(RIGA_LINK);
    if (lk) { if (!senzaLink) box.appendChild(videoNodo(lk[1])); continue; }
    const m = riga.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if (m) {
      const p = el('p', 'desriga conpunto');
      p.appendChild(el('span', 'despunto', /\d/.test(m[1]) ? m[1] : '•'));
      p.appendChild(el('span', 'destesto', m[2]));
      box.appendChild(p);
    } else {
      box.appendChild(el('p', 'desriga' + (riga.trim() ? '' : ' vuota'), riga));
    }
  }
}

/* La descrizione si apre per leggerla: si scrive nell'editor. `src` dice
   se l'esercizio sta nel piano di sempre o in una preparazione. */
function apriDesc(src, nome, i) {
  const sc = schedeDi(src)[nome];
  const r = completo(sc && sc.es[i]);
  if (!r) return;
  const lista = nome.indexOf('__') === 0 ? listeDi(src === 'base' ? tstore : tstore.prep.find(p => p.id === src) || tstore).find(l => l.chiave === nome) : null;
  $('descTit').textContent = r[0] || (lista ? lista.nome : nome);
  /* sotto il nome, per esteso: quanto (ripetizioni, tempi) e in che gruppo */
  const tg = tipoDi(sc, sc.es[i]);
  const quanto = [r[1], (r[2] || []).join(' › '), tg ? detto(tg.tipo) : ''].filter(Boolean);
  $('descQta').textContent = quanto.join('  ·  ');
  $('descQta').hidden = !quanto.length;
  /* se i tempi sono tempi veri, accanto c'e' il tasto del timer */
  tPiano = pianoTimer(sc, sc.es[i]);
  $('tAvvia').hidden = !tPiano;
  if (tPiano) $('tAvviaTxt').textContent = tPiano.sequenza ? 'Inizia sequenza' : 'Inizia';
  $('descQtaRiga').hidden = !quanto.length && !tPiano;
  /* i link video scritti nel testo salgono nello slot, dopo i video caricati */
  testoDesc($('descTesto'), r[3], true);
  dlgDesc.showModal();
  dlgDesc.focus();                /* niente tastiera addosso appena si apre */
  vLista = videiDi(r).map(n => ({ tipo: 'mio', nome: n }));
  for (const riga of String(r[3] || '').split('\n')) {
    const lk = riga.match(RIGA_LINK);
    const v = lk && videoDi(lk[1]);
    if (v) vLista.push(v);
  }
  vIdx = 0;
  paintVNav();
  /* con piu' video, un avviso leggero sopra il primo: sparisce al tocco */
  $('vAvviso').hidden = vLista.length < 2;
  $('vAvviso').textContent = vLista.length + ' video: sotto trovi le frecce';
  mostraElemento(vLista[0] || null);
}

/* Il recupero di una scheda: il timer parte subito, a tutto schermo, senza
   passare da una descrizione. Fermandolo si torna alla pagina. */
let tSoloTimer = false;
function avviaRecupero(src, nome) {
  const sc = schedeDi(src)[nome];
  const pr = sc && sc.rec && pianoTempi('Recupero', sc.rec);
  if (!pr) return;
  /* e' tutto recupero: il timer lo dice e lo colora cosi' */
  const piano = { sequenza: false, fase: i => { const f = pr.fase(i); return f && Object.assign({}, f, { pausa: true }); } };
  $('descTit').textContent = '';
  $('descQta').hidden = true;
  $('descQtaRiga').hidden = true;
  testoDesc($('descTesto'), '', true);
  mostraElemento(null);
  dlgDesc.showModal();
  tmrAvvia(piano);
  tSoloTimer = true;               /* dopo: tmrAvvia ferma un timer vecchio */
}

/* Un elemento dello slot: un video caricato, un lettore incorporato
   (YouTube, Wistia, Loom...), un file video da un link, o un bottone per le
   piattaforme che non si lasciano incorporare (Patreon, Instagram...). */
function mostraElemento(x) {
  if (!x) { mostraVideo('', false); return; }
  if (x.tipo === 'mio') { mostraVideo(x.nome, false); return; }
  pulisciVideo();
  const slot = $('vSlot');
  slot.hidden = false;
  $('vVideo').hidden = true;
  $('vStato').textContent = '';
  if (x.tipo === 'file') {
    const v = $('vVideo');
    v.muted = true;
    v.src = x.src; v.hidden = false;
    return;
  }
  if (x.tipo === 'frame') {
    const f = el('iframe', 'vframe');
    f.src = x.src;
    f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.title = 'Video';
    slot.classList.toggle('verticale', !!x.verticale);
    slot.appendChild(f);
    return;
  }
  const a = el('a', 'vlink', '▶  Apri il video');
  try { a.appendChild(el('span', 'vlink-host', new URL(x.src).hostname.replace(/^www\./, ''))); } catch (e) {}
  a.href = x.src; a.target = '_blank'; a.rel = 'noopener noreferrer';
  slot.appendChild(a);
}

/* Piu' video nella stessa descrizione: le frecce sotto lo slot. */
let vLista = [], vIdx = 0;
function paintVNav() {
  const n = vLista.length;
  $('vNav').hidden = n < 2;
  $('vConta').textContent = (vIdx + 1) + ' di ' + n;
  $('vPrima').disabled = vIdx <= 0;
  $('vDopo').disabled = vIdx >= n - 1;
}
function vaiVideo(d) {
  const i = vIdx + d;
  if (i < 0 || i >= vLista.length) return;
  vIdx = i;
  $('vAvviso').hidden = true;
  paintVNav();
  mostraElemento(vLista[vIdx]);
}
$('vPrima').addEventListener('click', () => vaiVideo(-1));
$('vDopo').addEventListener('click', () => vaiVideo(1));
$('vAvviso').addEventListener('click', () => { $('vAvviso').hidden = true; });
$('vSlot').addEventListener('pointerdown', () => { $('vAvviso').hidden = true; });

/* Chiudendo, i video si fermano: la finestra si svuota. */
function chiudiDesc() {
  tmrFerma();
  pulisciVideo();
  $('vNav').hidden = true;
  $('vAvviso').hidden = true;
  dlgDesc.close();
  $('descTesto').textContent = '';
}

$('descChiudi').addEventListener('click', chiudiDesc);
dlgDesc.addEventListener('cancel', ev => {
  /* col timer aperto, il tasto indietro non butta via niente: il timer va in
     pausa e resta li'. Lo chiude solo Stop; a timer finito, anche indietro */
  if (!$('tmr').hidden) {
    ev.preventDefault();
    if (!tmr.f || tmr.f.fine) tmrFerma(); else if (!tmr.fermo) tmrPausa();
    return;
  }
  pulisciVideo(); $('descTesto').textContent = '';
});

/* ------------------------------------------------------------ il timer --- */

/* I tempi si leggono da come sono scritti nelle schede. Un tempo e' 2' o 2’,
   30" o 30” (anche 30''), 1'30", 10min. Quattro casi:
   - un tempo solo, "2’": un timer di 2 minuti;
   - tempi col +, "2’ + 2’": uno dopo l'altro, con 10 secondi in mezzo;
   - un gruppo Tabata, "Tabata 45”/15”": gli esercizi del gruppo in fila,
     45" di lavoro e 15" di pausa. I giri si scrivono nel nome del gruppo
     ("x3", "3 giri"); se non ci sono, la sequenza gira finche' non si ferma;
   - un EMOM, "EMOM 10min": ogni minuto il timer riparte, per 10 minuti. Se
     l'EMOM e' un gruppo, ogni minuto passa all'esercizio dopo. Senza i
     minuti scritti, gira finche' non si ferma. */
const T_UNO = String.raw`(?:(\d{1,3})\s*(?:["”″]|''|’’)|(\d{1,3})\s*(?:['’′]|min(?:uti)?\.?)(?:\s*(\d{1,2})\s*(?:["”″]|''|’’))?)`;
const T_RE = new RegExp(T_UNO, 'gi');
const T_SOLI = new RegExp('^\\s*' + T_UNO + '(?:\\s*\\+\\s*' + T_UNO + ')*\\s*$', 'i');
const T_PAUSA_PIU = 10;
const secondiDi = m => m[1] ? +m[1] : +m[2] * 60 + (+m[3] || 0);
const tempiIn = t => [...String(t || '').matchAll(T_RE)].map(secondiDi).filter(x => x > 0);
const giriIn = t => { const m = String(t).match(/(?:^|\s)[x×]\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:giri|round|rounds)\b/i); return m ? +(m[1] || m[2]) : 0; };

/* Il tipo di un gruppo detto per il Sifu, sotto il nome dell'esercizio. */
const detto = t => t.t === 'tabata'
  ? 'Tabata ' + t.l + '" lavoro / ' + t.r + '" recupero · ' + (t.g ? t.g + (t.g === 1 ? ' giro' : ' giri') : 'giri liberi')
  : 'EMOM · ' + (t.m ? t.m + ' minuti' : 'minuti liberi');

/* Il piano del timer per una riga della scheda, o null se non ci sono tempi.
   `fase(i)` dice la fase numero i: { pausa, sec, nome, info }, o null alla fine.
   Un gruppo col suo tipo (Tabata, EMOM) comanda. Senza tipo, un Tabata si
   riconosce ancora dal nome; un EMOM no: c'e' solo se il gruppo e' di tipo
   EMOM. */
let tPiano = null;
function pianoTimer(sc, r) {
  if (!r) return null;
  const righe = sc.es;
  const g = r[2] || [];
  const nomi = via => righe.filter(x => x[0] && dentroVia(x[2] || [], via)).map(x => x[0]);
  const tg = tipoDi(sc, r);

  const kt = tg ? -1 : g.findIndex(x => /tabata/i.test(x));
  if ((tg && tg.tipo.t === 'tabata') || kt >= 0) {
    const via = tg ? tg.via : g.slice(0, kt + 1), t = tg ? null : tempiIn(g[kt]);
    const lav = tg ? tg.tipo.l : t[0] || 20, rec = tg ? tg.tipo.r : (t.length > 1 ? t[1] : 10);
    const giri = tg ? tg.tipo.g : giriIn(g[kt]);
    /* un esercizio con piu' lati ha un intervallo per lato */
    const passi = [];
    for (const x of nomi(via)) {
      const L = latiDi(tg && tg.tipo, x);
      for (let q = 1; q <= L; q++) passi.push(x + (L > 1 ? ' · lato ' + q + ' di ' + L : ''));
    }
    const es = passi, n = es.length;
    if (!n) return null;
    return { sequenza: true, fase: i => {
      const passo = Math.floor(i / 2), pausa = i % 2 === 1;
      const giro = Math.floor(passo / n), j = passo % n;
      if (giri && giro >= giri) return null;
      const ultimo = giri && giro === giri - 1 && j === n - 1;
      if (pausa && ultimo) return null;
      const dove = 'Giro ' + (giro + 1) + (giri ? ' di ' + giri : '') + '  ·  ' + (j + 1) + ' di ' + n;
      return pausa ? { pausa: true, sec: rec, nome: 'Poi: ' + es[(j + 1) % n], info: dove }
                   : { sec: lav, nome: es[j], info: dove };
    } };
  }

  if (tg && tg.tipo.t === 'emom') {
    /* ogni esercizio per i suoi minuti di fila, poi il prossimo, a giro */
    const es = nomi(tg.via), min = tg.tipo.m, turno = [];
    es.forEach((x, j) => {
      const L = latiDi(tg.tipo, x);
      for (let lato = 1; lato <= L; lato++) {
        for (let q = 0; q < (tg.tipo.a[j] || 1); q++) turno.push(x + (L > 1 ? ' · lato ' + lato + ' di ' + L : ''));
      }
    });
    if (!turno.length) return null;
    return { sequenza: es.length > 1, fase: i => {
      if (min && i >= min) return null;
      const poi = es.length > 1 && !(min && i + 1 >= min) ? '  ·  poi: ' + turno[(i + 1) % turno.length] : '';
      return { sec: 60, nome: turno[i % turno.length], info: 'Minuto ' + (i + 1) + (min ? ' di ' + min : '') + poi };
    } };
  }

  return pianoTempi(r[0], r[1]);
}

/* I tempi scritti in una quantita', o null se non sono tempi:
   - "2’", "1'30\"", "2’ + 2’": i tempi, uno dopo l'altro;
   - "1’/1’30”": un tempo o l'altro, si parte dal primo;
   - "3’ + 2’ cycle + 2’ walk", "1 + 1’ cycle + 1’ walk": ogni pezzo e' un
     tempo con un nome dopo; un numero senza unita' prende quella dei vicini.
   Serie e ripetizioni ("30” x 3", "2 volte gamba 1’") non sono tempi. */
const T_PEZZO = new RegExp('^' + T_UNO + '\\s*(.*)$', 'i');
const T_BARRA = new RegExp('^\\s*' + T_UNO + '(?:\\s*/\\s*' + T_UNO + ')+\\s*$', 'i');
function tempiRiga(q) {
  q = String(q || '').trim();
  if (!q) return null;
  if (T_SOLI.test(q)) return tempiIn(q).map(sec => ({ sec: sec, eti: '' }));
  if (T_BARRA.test(q)) return [{ sec: tempiIn(q)[0], eti: '' }];
  const pezzi = q.split('+').map(x => x.trim());
  const out = [];
  for (const p of pezzi) {
    const m = p.match(T_PEZZO);
    if (m && tempiIn(m[0].slice(0, m[0].length - m[4].length)).length) {
      const eti = m[4].trim();
      if (/[\dx×\/]/i.test(eti.charAt(0)) || /\d/.test(eti)) return null;
      out.push({ sec: secondiDi(m), eti: eti, sec_: m[1] ? 's' : 'm' });
      continue;
    }
    const b = pezzi.length > 1 && p.match(/^(\d{1,3})(?:\s+([^\d]*))?$/);
    if (!b) return null;
    out.push({ n: +b[1], eti: (b[2] || '').trim() });
  }
  if (!out.some(x => x.sec)) return null;
  /* i numeri senza unita': l'unita' del pezzo dopo, o di quello prima */
  out.forEach((x, i) => {
    if (x.sec) return;
    const vic = out.slice(i + 1).concat(out.slice(0, i).reverse()).find(y => y.sec);
    x.sec = vic.sec_ === 's' ? x.n : x.n * 60;
  });
  return out.map(x => ({ sec: x.sec, eti: x.eti }));
}

function pianoTempi(nome, q) {
  const t = tempiRiga(q);
  if (!t || !t.length) return null;
  const fasi = [], n = t.length;
  t.forEach((x, j) => {
    if (j) fasi.push({ pausa: true, sec: T_PAUSA_PIU, nome: nome, info: 'Poi: ' + (x.eti || (j + 1) + ' di ' + n) });
    fasi.push({ sec: x.sec, nome: nome + (x.eti ? ' · ' + x.eti : ''), info: n > 1 ? (j + 1) + ' di ' + n : '' });
  });
  return { sequenza: false, fase: i => fasi[i] || null };
}

/* Il timer che corre. Il tempo si conta dall'orologio e non dai tic: se il
   telefono rallenta la pagina, i secondi restano giusti. A ogni cambio di
   fase un bip e una vibrazione; alla fine tre bip. Lo schermo resta acceso. */
const tmr = { piano: null, i: 0, f: null, fine: 0, resto: 0, fermo: false, tic: 0, audio: null, lock: null };

/* Il suono: la campanella del ring, passata da un compressore che la porta
   al massimo senza gracchiare. Si riconosce anche con la musica in palestra.
   Su iPhone la pagina suona anche col telefono in silenzioso. */
function audioTimer() {
  if (tmr.audio) return tmr.audio;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* niente */ }
  const a = new AC();
  const comp = a.createDynamicsCompressor();
  comp.threshold.value = -30; comp.knee.value = 0; comp.ratio.value = 20;
  comp.attack.value = 0.001; comp.release.value = 0.1;
  const su = a.createGain(), fuori = a.createGain();
  su.gain.value = 4;
  fuori.gain.value = 2;                 /* il compressore abbassa: qui si torna al massimo */
  su.connect(comp); comp.connect(fuori); fuori.connect(a.destination);
  a.uscita = su;
  tmr.audio = a;
  return a;
}

/* Un colpo di campanella: il colpo del martelletto, poi le note della campana
   (non armoniche, per questo suona di metallo) che si spengono piano, le piu'
   alte prima. */
const CAMPANA = [[1, 1, 1.6], [2.0, 0.55, 1.1], [2.42, 0.5, 0.9], [2.98, 0.3, 0.7],
                 [4.16, 0.28, 0.45], [5.43, 0.18, 0.3], [6.79, 0.12, 0.2]];
function colpo(a, t) {
  const f0 = 880;
  for (const [r, amp, dur] of CAMPANA) {
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = f0 * r;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp * 0.5, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.uscita);
    o.start(t); o.stop(t + dur + 0.02);
  }
  /* il martelletto: un soffio di rumore brevissimo */
  const n = a.createBuffer(1, Math.floor(a.sampleRate * 0.03), a.sampleRate), d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(), g = a.createGain(), hp = a.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 2500;
  g.gain.value = 0.4;
  src.buffer = n; src.connect(hp); hp.connect(g); g.connect(a.uscita);
  src.start(t);
}

/* Il primo scatto del giorno puo' essere un audio scelto nell'editor
   (easter egg): suona una volta sola, poi tornano i bip. */
let tSorpresa = null;                 /* { id, buf } pronta per il primo scatto */
let tSorpresaSuona = null;
async function preparaSorpresa() {
  tSorpresa = null;
  const a = tmr.audio;
  if (!a) return;
  const k = chiaveData(today()), visti = vistiLeggi();
  const x = validSorprese(tstore.sorprese).find(y => y.tipo === 'suono' && y.giorno === k && visti.indexOf(y.id) < 0);
  if (!x) return;
  try {
    const b = (await vGet(x.audio)) || (await prendiVideo(x.audio));
    if (!b) return;
    const buf = await a.decodeAudioData(await b.arrayBuffer());
    tSorpresa = { id: x.id, buf: buf };
  } catch (e) { /* l'audio non si legge: restano i bip */ }
}
/* anche la sorpresa passa dal rinforzo dei bip: forte quanto il telefono permette */
function suonaBuffer(a, buf) {
  const src = a.createBufferSource();
  src.buffer = buf;
  src.connect(a.uscita);
  src.start();
  return src;
}

function bip(volte) {
  if (navigator.vibrate) navigator.vibrate(volte > 1 ? [400, 150, 400, 150, 800] : [300, 100, 300]);
  const a = tmr.audio;
  if (!a) return;
  if (tSorpresa) {
    vistiSegna([tSorpresa.id]);
    tSorpresaSuona = suonaBuffer(a, tSorpresa.buf);
    tSorpresa = null;
    return;
  }
  /* la campanella del ring, tre colpi di fila: uguale a ogni cambio e alla fine */
  const t0 = a.currentTime + 0.02;
  for (let k = 0; k < 3; k++) colpo(a, t0 + k * 0.28);
}

async function tieniAcceso() {
  try { if (navigator.wakeLock && !tmr.lock) tmr.lock = await navigator.wakeLock.request('screen'); } catch (e) { /* niente */ }
  if (tmr.lock) tmr.lock.addEventListener('release', () => { tmr.lock = null; });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && tmr.piano) tieniAcceso();
});

const mmss = sec => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');

function tmrDisegna() {
  const f = tmr.f, box = $('tmr');
  if (!f) return;
  const ms = tmr.fermo ? tmr.resto : tmr.fine - Date.now();
  box.classList.toggle('pausa', !!f.pausa);
  box.classList.toggle('fermo', tmr.fermo);
  $('tmrFase').textContent = f.fine ? 'Fatto' : tmr.fermo ? 'In pausa' : f.pausa ? 'Recupero' : 'Via';
  $('tmrNome').textContent = f.nome || '';
  $('tmrTempo').textContent = mmss(Math.max(0, Math.ceil(ms / 1000)));
  $('tmrInfo').textContent = f.info || '';
}

/* Entra nella fase i, che comincia al momento `da`. Le fasi da zero secondi
   si saltano. Se il telefono e' rimasto indietro, si recupera il passo. */
function tmrEntra(i, da) {
  for (;;) {
    const f = tmr.piano.fase(i);
    if (!f) { tmrFine(); return; }
    if (f.sec > 0) {
      tmr.i = i; tmr.f = f; tmr.fine = da + f.sec * 1000;
      if (tmr.fine > Date.now()) break;
      da = tmr.fine;
    }
    i++;
  }
  tmrDisegna();
}

function tmrTic() {
  if (tmr.fermo || !tmr.f) return;
  if (Date.now() >= tmr.fine) {
    tmrEntra(tmr.i + 1, tmr.fine);
    if (tmr.piano) bip(tmr.f && tmr.f.fine ? 3 : 1);
    return;
  }
  tmrDisegna();
}

function tmrAvvia(piano) {
  tmrFerma();
  try { const a = audioTimer(); if (a) a.resume(); } catch (e) { tmr.audio = null; }
  preparaSorpresa();
  const v = $('vVideo');
  if (!v.paused) v.pause();
  tmr.piano = piano;
  tmr.fermo = false;
  $('tmrPausa').textContent = 'Pausa';
  $('tmrPausa').hidden = false;
  tmrStopBtn('Stop', true);
  $('tmr').hidden = false;
  tmrEntra(0, Date.now());
  tmr.tic = setInterval(tmrTic, 200);
  tieniAcceso();
}

function tmrFine() {
  clearInterval(tmr.tic);
  tmr.f = { fine: true, sec: 0, nome: tmr.f ? tmr.f.nome : '', info: '' };
  tmr.fermo = true; tmr.resto = 0;
  $('tmrPausa').hidden = true;
  tmrStopBtn('Chiudi', false);
  tmrDisegna();
  $('tmr').classList.remove('fermo');
  if (tmr.lock) tmr.lock.release().catch(() => {});
}

function tmrFerma() {
  clearInterval(tmr.tic);
  if (tSoloTimer) { tSoloTimer = false; setTimeout(chiudiDesc, 0); }
  if (tSorpresaSuona) { try { tSorpresaSuona.stop(); } catch (e) { /* gia' finito */ } tSorpresaSuona = null; }
  tmr.piano = null; tmr.f = null;
  $('tmr').hidden = true;
  if (tmr.lock) tmr.lock.release().catch(() => {});
}

$('tAvvia').addEventListener('click', () => { if (tPiano) tmrAvvia(tPiano); });
/* Stop si tocca due volte: il primo tocco chiede conferma. Chiudi, a timer
   finito, basta una volta. */
function tmrStopBtn(testo, rosso) {
  const b = $('tmrStop');
  b.textContent = testo;
  delete b.dataset.sicuro;
  b.classList.toggle('btn-del', rosso);
  b.classList.remove('sicuro');
}
$('tmrStop').addEventListener('click', () => {
  const b = $('tmrStop');
  if (!tmr.f || tmr.f.fine || b.dataset.sicuro) { tmrFerma(); return; }
  b.dataset.sicuro = '1';
  b.textContent = 'Fermo davvero?';
  b.classList.add('sicuro');
  setTimeout(() => { if (b.dataset.sicuro && !$('tmr').hidden) tmrStopBtn('Stop', true); }, 4000);
});
function tmrPausa() {
  if (!tmr.f || tmr.f.fine) return;
  if (tmr.fermo) { tmr.fine = Date.now() + tmr.resto; tmr.fermo = false; }
  else { tmr.resto = Math.max(0, tmr.fine - Date.now()); tmr.fermo = true; }
  $('tmrPausa').textContent = tmr.fermo ? 'Riprendi' : 'Pausa';
  tmrDisegna();
}
$('tmrPausa').addEventListener('click', () => {
  tmrPausa();
});

/* ------------------------------------------------------ i video ---- */

/* Un esercizio ha un video suo, che sta in cima alla descrizione. Il file si
   sceglie dal telefono o dal PC, resta subito in questo dispositivo e al Save
   parte per GitHub, nella cartella video/ del branch del piano. Gli altri
   telefoni lo scaricano appena leggono il piano e lo tengono per sempre: in
   palestra si guarda anche senza rete. Non si cancella mai niente, ne' qui ne'
   su GitHub: i video sono pochi.
   Ogni persona ha i suoi video nella sua cartella, chiusi con la sua chiave;
   i video della libreria stanno anche nella mia. Nel telefono invece un video
   sta una volta sola, sotto il suo nome, che e' a caso e non si ripete. */

/* Oltre questa misura GitHub rischia di rifiutare il file. */
const VIDEO_MAX = 60 * 1024 * 1024;
/* i video stanno nella cartella di chi li deve vedere: vedi cartellaDi */
const TIPI_AUDIO = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav' };
const tipoVideo = n => /\.webm$/.test(n) ? 'video/webm' : /\.jpg$/.test(n) ? 'image/jpeg'
                     : TIPI_AUDIO[n.split('.').pop()] || 'video/mp4';

/* Il deposito dei video nel telefono: IndexedDB, un file per nome. */
let dbVideo = null;
function apriDb() {
  if (!dbVideo) dbVideo = new Promise((ok, ko) => {
    const q = indexedDB.open('wk-video', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('v');
    q.onsuccess = () => ok(q.result);
    q.onerror = () => ko(q.error);
  });
  return dbVideo;
}
async function vGet(n) {
  try {
    const d = await apriDb();
    return await new Promise(ok => {
      const q = d.transaction('v').objectStore('v').get(n);
      q.onsuccess = () => ok(q.result || null);
      q.onerror = () => ok(null);
    });
  } catch (e) { return null; }
}
/* I nomi dei video nel telefono, e un video tolto. */
async function vNomi() {
  try {
    const d = await apriDb();
    return await new Promise(ok => {
      const q = d.transaction('v').objectStore('v').getAllKeys();
      q.onsuccess = () => ok((q.result || []).map(String));
      q.onerror = () => ok([]);
    });
  } catch (e) { return []; }
}
async function vVia(n) {
  try {
    const d = await apriDb();
    await new Promise(ok => {
      const t = d.transaction('v', 'readwrite');
      t.objectStore('v').delete(n);
      t.oncomplete = t.onerror = ok;
    });
  } catch (e) { /* resta */ }
}
async function vPut(n, blob) {
  const d = await apriDb();
  await new Promise((ok, ko) => {
    const t = d.transaction('v', 'readwrite');
    t.objectStore('v').put(blob, n);
    t.oncomplete = ok;
    t.onerror = () => ko(t.error);
  });
}

/* Anche i video partono chiusi, con la chiave di chi li riceve: davanti al
   pacchetto c'e' una firma, cosi' chi lo apre sa che va decifrato. */
const FIRMA = new TextEncoder().encode('WKENC1');
async function cifraByte(buf, pass) {
  const u = new Uint8Array(buf);
  if (!pass) return u;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const k    = await derivaChiave(pass, salt);
  const ct   = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, u));
  const out  = new Uint8Array(FIRMA.length + 28 + ct.length);
  out.set(FIRMA, 0); out.set(salt, 6); out.set(iv, 22); out.set(ct, 34);
  return out;
}
async function decifraByte(buf, pass) {
  const u = new Uint8Array(buf);
  if (u.length < 34 || !FIRMA.every((b, i) => u[i] === b)) return u;
  if (!pass) throw new Error('key missing');
  const k = await derivaChiave(pass, u.slice(6, 22));
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(22, 34) }, k, u.slice(34)));
}

/* base64 di un file grande: lo fa il browser, a pezzi, senza bloccarsi */
const b64Blob = blob => new Promise((ok, ko) => {
  const f = new FileReader();
  f.onload = () => ok(String(f.result).split(',')[1] || '');
  f.onerror = () => ko(f.error);
  f.readAsDataURL(blob);
});

/* Un video su GitHub: blob, albero, commit, e il branch che avanza. E' la via
   di GitHub per i file grandi; quella del piano si ferma molto prima. */
/* Il corpo della richiesta costruito a pezzi: il file si trasforma in testo
   3 MB alla volta e i pezzi restano pezzi (un Blob), cosi' un video da 60 MB
   non diventa mai un'unica stringa enorme nella memoria del telefono. */
async function corpoBlob(blob) {
  const parti = ['{"encoding":"base64","content":"'];
  const PEZZO = 3 * 1024 * 1024;            /* multiplo di 3: i pezzi si attaccano senza rotture */
  for (let o = 0; o < blob.size; o += PEZZO) {
    const u = new Uint8Array(await blob.slice(o, o + PEZZO).arrayBuffer());
    let t = '';
    for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    parti.push(btoa(t));
    await aspetta(0);                        /* respiro: la pagina resta viva */
  }
  parti.push('"}');
  return new Blob(parti, { type: 'application/json' });
}

/* Il file mandato a GitHub con XMLHttpRequest e non con fetch: cosi' si sa a
   che punto e' e la riga in alto lo dice. */
function postaBlob(corpo, avanza) {
  return new Promise(ok => {
    const x = new XMLHttpRequest();
    x.open('POST', API + '/git/blobs');
    x.timeout = 15 * 60 * 1000;
    const H = Object.assign({ 'Content-Type': 'application/json' }, ghHeaders());
    for (const k of Object.keys(H)) x.setRequestHeader(k, H[k]);
    x.upload.onprogress = e => { if (e.lengthComputable && avanza) avanza(e.loaded / e.total); };
    x.onload = () => { try { ok(x.status < 300 ? JSON.parse(x.responseText).sha : null); } catch (e) { ok(null); } };
    x.onerror = x.ontimeout = x.onabort = () => ok(null);
    x.send(corpo);
  });
}

const aspetta = ms => new Promise(r => setTimeout(r, ms));

/* La chiave che apre una cartella: la mia, quella di una persona
   dell'elenco, o quella della persona aperta in questo telefono. */
function chiaveDi(f) {
  if (mia && f === mia.f) return mia.k;
  if (f === fidCorrente) return chiave;
  const p = mio && mio.persone.find(x => x.f === f);
  return p ? p.chiave : '';
}

/* C'e' gia' online? Se un caricamento e' arrivato ma il telefono non ha fatto
   in tempo a segnarlo, non lo si rimanda. */
/* Torna quanto pesa online, o -1 se non c'e'. */
async function videoOnline(percorso) {
  try {
    const r = await fetch(API + '/contents/' + percorso + '?ref=' + BRANCH, { method: 'GET', headers: ghHeaders(), cache: 'no-store' });
    if (r.status !== 200) return -1;
    try { return +(await r.json()).size || 0; } catch (e) { return 0; }
  } catch (e) { return -1; }
}

/* Un video verso la cartella di qualcuno: lo si prende dal telefono, o da
   dove sta online, lo si chiude con la sua chiave e lo si manda. Torna true
   se e' online, 'perso' se non c'e' modo di mandarlo, false per riprovare. */
async function caricaVideo(x, avanza, dice) {
  try {
    const pass = chiaveDi(x.f);
    if (!pass) return 'perso';                /* persona tolta dall'elenco */
    const percorso = cartellaDi(x.f) + x.n;
    /* gia' online: va bene, a meno che sia uno di quelli pesanti di prima */
    const online = await videoOnline(percorso);
    if (online >= 0 && (!eVideo(x.n) || online <= LEGGERO_SOGLIA)) return true;
    /* pesante, ma questo browser non sa comprimere: lo fara' un altro
       dispositivo; qui non si segna come fatto */
    if (online >= 0 && senzaCompressione) return 'perso';
    let blob = (await vGet(x.n)) || (await prendiVideo(x.n));
    if (!blob) return online >= 0 ? true : 'perso';   /* non c'e' da nessuna parte */
    blob = await alleggerisci(x.n, blob, dice);
    /* online c'era gia' e non si e' alleggerito: si lascia quello */
    if (online >= 0 && blob.size > online * 0.85) return true;
    const corpo = await corpoBlob(new Blob([await cifraByte(await blob.arrayBuffer(), pass)]));
    /* il file va su una volta sola; poi si prova ad attaccarlo al branch */
    let sha = null;
    for (let t = 0; t < 3 && !sha; t++) {
      if (t) await aspetta(5000 * t);
      sha = await postaBlob(corpo, avanza);
    }
    if (!sha) return false;
    const H = Object.assign({ 'Content-Type': 'application/json' }, ghHeaders());
    const leggiRef = () => fetch(API + '/git/ref/heads/' + BRANCH, { headers: ghHeaders(), cache: 'no-store' });
    /* Subito dopo il salvataggio del piano GitHub a volte da' ancora il
       branch vecchio, e l'aggancio viene rifiutato: si rilegge e si riprova. */
    for (let t = 0; t < 8; t++) {
      if (t) await aspetta(1500 * t);
      try {
        let ref = await leggiRef();
        if (ref.status === 404) {
          if (!(await creaBranch())) continue;
          ref = await leggiRef();
        }
        if (!ref.ok) continue;
        const base = (await ref.json()).object.sha;
        const c0 = await fetch(API + '/git/commits/' + base, { headers: ghHeaders(), cache: 'no-store' });
        if (!c0.ok) continue;
        const albero0 = (await c0.json()).tree.sha;
        const tr = await fetch(API + '/git/trees', { method: 'POST', headers: H,
          body: JSON.stringify({ base_tree: albero0,
            tree: [{ path: percorso, mode: '100644', type: 'blob', sha: sha }] }) });
        if (!tr.ok) continue;
        const cm = await fetch(API + '/git/commits', { method: 'POST', headers: H,
          body: JSON.stringify({ message: 'video: ' + x.n, tree: (await tr.json()).sha, parents: [base] }) });
        if (!cm.ok) continue;
        const up = await fetch(API + '/git/refs/heads/' + BRANCH, { method: 'PATCH', headers: H,
          body: JSON.stringify({ sha: (await cm.json()).sha }) });
        if (up.ok) return true;
      } catch (e) { /* rete caduta a meta': si riprova */ }
    }
    return false;
  } catch (e) {
    return false;
  }
}

/* Dove si cerca un video online: prima nella cartella della persona aperta,
   poi (per chi ha l'elenco) nella mia e in quelle di tutti, e alla fine
   nella cartella di prima. */
function fontiVideo() {
  const out = [];
  const metti = (f, k) => { if (f && !out.some(x => x.f === f)) out.push({ f: f, k: k }); };
  metti(fidCorrente, chiave);
  if (mio && mia) {
    metti(mia.f, mia.k);
    for (const p of mio.persone) metti(p.f, p.chiave);
  }
  metti(VECCHIO, chiaveVecchia());
  return out.map(x => ({ url: RAW + cartellaDi(x.f), k: x.k }));
}

/* Un video da GitHub al telefono. Torna il file, o null. */
async function prendiVideo(nome) {
  for (const x of fontiVideo()) {
    try {
      const r = await fetch(x.url + nome, { cache: 'no-store' });
      if (!r.ok) continue;
      const u = await decifraByte(await r.arrayBuffer(), x.k);
      const blob = new Blob([u], { type: tipoVideo(nome) });
      await vPut(nome, blob);
      return blob;
    } catch (e) { /* si prova la prossima */ }
  }
  return null;
}

/* I video che servono alla persona aperta: il suo piano, le preparazioni, le
   sorprese, e la parte di libreria che va nel suo file. */
function videoDiPersona() {
  const nomi = new Set();
  for (const tutte of [tstore.schede].concat(tstore.prep.map(p => p.schede))) {
    for (const k of Object.keys(tutte)) for (const r of tutte[k].es) for (const v of videiDi(r)) nomi.add(v);
  }
  for (const x of tstore.sorprese || []) for (const n of x ? [x.img, x.audio] : []) if (nomeVideoOk(n)) nomi.add(n);
  for (const r of tstore.libreria || []) for (const v of videiDi(r)) nomi.add(v);
  return nomi;
}
/* I video della libreria: stanno nella mia cartella. */
function videoDiLibreria() {
  const nomi = new Set();
  if (mio) for (const r of mio.libreria) for (const v of videiDi(r)) nomi.add(v);
  return nomi;
}

/* Tutti i video del piano che il telefono non ha ancora: si scaricano uno alla
   volta, in silenzio, appena il piano e' letto. */
let scaricando = false;
async function scaricaVideo() {
  if (scaricando || !fidCorrente) return;
  scaricando = true;
  try {
    const servono = videoDiPersona();
    /* le immagini delle sorprese arrivano prima del loro giorno */
    for (const n of servono) {
      const b = await vGet(n);
      if (!b) { await prendiVideo(n); continue; }
      /* un video pesante di prima, che online e' diventato leggero: si
         prende quello nuovo, e il telefono si libera */
      if (eVideo(n) && b.size > LEGGERO_SOGLIA && !leggeri.has(n)) {
        try {
          const r = await fetch(RAW + cartellaDi(fidCorrente) + n, { method: 'HEAD', cache: 'no-store' });
          const online = +r.headers.get('Content-Length') || 0;
          if (r.ok && online && online < b.size * 0.85) await prendiVideo(n);
          if (r.ok && online) segnaLeggero(n);
        } catch (e) { /* si riprova la prossima volta */ }
      }
    }
    /* chi legge e basta tiene nel telefono solo i video che gli servono */
    if (!editore() && servono.size) {
      for (const n of await vNomi()) if (!servono.has(n)) await vVia(n);
    }
  } finally {
    scaricando = false;
  }
}

/* Lo slot del video, in cima alla descrizione. Sempre orizzontale; un video
   verticale ci sta dentro intero, con le bande ai lati. */
let vURL = null;
let vMostrato = '';

function pulisciVideo() {
  for (const x of $('vSlot').querySelectorAll('.vframe, .vlink')) x.remove();
  const v = $('vVideo');
  v.pause();
  v.removeAttribute('src');
  v.load();
  if (vURL) URL.revokeObjectURL(vURL);
  vURL = null;
  vMostrato = '';
  $('vSlot').classList.remove('verticale');
  document.body.classList.remove('vland');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

async function mostraVideo(nome, scrivibile) {
  pulisciVideo();
  vMostrato = nome;
  const slot = $('vSlot'), v = $('vVideo'), st = $('vStato');
  /* senza video lo slot non si vede */
  slot.hidden = !nome;
  v.hidden = true;
  if (!nome) { st.textContent = 'Nessun video'; return; }
  st.textContent = 'Carico il video…';
  let blob = await vGet(nome);
  if (!blob && vMostrato === nome) {
    st.textContent = 'Scarico il video…';
    blob = await prendiVideo(nome);
  }
  if (vMostrato !== nome) return;            /* nel frattempo si e' chiuso o cambiato */
  if (!blob) {
    st.textContent = navigator.onLine ? 'Il video non è ancora online: riprova fra qualche minuto'
                                      : 'Il video non è ancora su questo telefono: serve internet una volta';
    return;
  }
  vURL = URL.createObjectURL(blob);
  v.muted = true;                            /* ogni video parte muto */
  v.src = vURL;
  v.hidden = false;
  st.textContent = '';
}

/* Verticale o orizzontale lo dice il video stesso, appena si apre. */
$('vVideo').addEventListener('loadedmetadata', () => {
  const v = $('vVideo');
  $('vSlot').classList.toggle('verticale', v.videoHeight > v.videoWidth);
  ruota();
});

/* I video partono muti: l'audio e lo schermo intero si comandano dai
   comandi del video stesso, quelli del telefono. */

/* Uscendo dallo schermo intero il telefono torna libero di girare. */
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) {
    try { screen.orientation.unlock(); } catch (e) { /* niente */ }
  }
});

/* Girando il telefono con un video orizzontale aperto, il video prende tutto
   lo schermo. Il browser non sempre concede lo schermo intero vero senza un
   tocco: in quel caso lo slot si allarga lo stesso sopra a tutto, e il
   risultato a occhio e' uguale. Tornando dritti, torna al suo posto. */
const orizzontale = matchMedia('(orientation: landscape) and (max-height: 600px)');
function ruota() {
  const slot = $('vSlot');
  const su = dlgDesc.open && !$('vVideo').hidden && !slot.classList.contains('verticale') && orizzontale.matches;
  document.body.classList.toggle('vland', su);
  if (su && !document.fullscreenElement && slot.requestFullscreen) slot.requestFullscreen().catch(() => {});
  if (!su && document.fullscreenElement === slot && !orizzontale.matches) document.exitFullscreen().catch(() => {});
}
if (orizzontale.addEventListener) orizzontale.addEventListener('change', ruota);

/* Un file video scelto nell'editor: resta subito nel telefono, sotto un nome
   nuovo, e al Save parte per GitHub. Torna il nome, o un errore da mostrare. */
/* La compressione dei video, prima di tenerli: il telefono registra in 1080p
   o 4K, e un esercizio si capisce benissimo in 720p. La fa il browser con i
   suoi strumenti video (WebCodecs), attraverso una libreria che si scarica
   solo quando serve. Due passate: la prima a 720p; se il file e' ancora
   sopra il limite, una seconda piu' piccola. Se il browser non ce la fa, il
   video resta com'e'. */
const MEDIABUNNY = 'https://cdn.jsdelivr.net/npm/mediabunny@1.60.0/+esm';
/* Quanto pesa un video: un esercizio si guarda su un telefono, e 540p (960
   sul lato lungo) a 30 fotogrammi basta e avanza. H.264 dentro MP4 perche'
   e' l'unico che si vede su tutti i telefoni, iPhone compresi. Audio mono e
   leggero: in un esercizio conta poco. Viene circa 5 MB al minuto. Se il
   video resta comunque grosso (oltre LEGGERO_MAX), una seconda passata piu'
   piccola. */
const PASSATE_VIDEO = [{ lato: 960, bit: 650000, audio: 48000 },
                       { lato: 640, bit: 350000, audio: 32000 }];
const LEGGERO_MAX = 20 * 1024 * 1024;

/* Questo browser non sa comprimere (niente strumenti video, o la libreria non
   si scarica): i video restano come sono, e non si segnano come provati. */
let senzaCompressione = !('VideoEncoder' in window);
async function comprimiVideo(f, avanza) {
  if (!('VideoEncoder' in window)) { senzaCompressione = true; return null; }
  let mb;
  try { mb = await import(MEDIABUNNY); } catch (e) { senzaCompressione = true; return null; }
  let migliore = null;
  for (let i = 0; i < PASSATE_VIDEO.length; i++) {
    const p = PASSATE_VIDEO[i];
    try {
      const input = new mb.Input({ source: new mb.BlobSource(f), formats: mb.ALL_FORMATS });
      const target = new mb.BufferTarget();
      const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: target });
      const conv = await mb.Conversion.init({
        input: input, output: output,
        video: t => {
          const w = t.displayWidth, h = t.displayHeight;
          const o = { codec: 'avc', bitrate: p.bit, frameRate: 30, keyFrameInterval: 2, forceTranscode: true };
          if (Math.max(w, h) > p.lato) { if (w >= h) o.width = p.lato; else o.height = p.lato; }
          return o;
        },
        audio: { numberOfChannels: 1, bitrate: p.audio, forceTranscode: true }
      });
      /* senza la parte video non e' piu' un video: si lascia com'era. Se e'
         perche' il browser non sa scrivere H.264, non ce la fara' con nessuno */
      const viaVideo = conv.discardedTracks.filter(d => d.track.type === 'video');
      if (viaVideo.some(d => d.reason === 'no_encodable_target_codec')) senzaCompressione = true;
      if (!conv.isValid || viaVideo.length) break;
      conv.onProgress = x => { if (avanza) avanza((i + x) / (i + 1)); };
      await conv.execute();
      const b = new Blob([target.buffer], { type: 'video/mp4' });
      if (!migliore || b.size < migliore.size) migliore = b;
      if (b.size <= LEGGERO_MAX) break;
    } catch (e) { break; }
  }
  return migliore;
}

/* I video gia' caricati prima, ancora pesanti: si alleggeriscono una volta,
   quando vanno nella cartella di qualcuno. La copia nel telefono diventa
   quella leggera. Chi e' gia' stato provato non si riprova. */
const LEGGERI_KEY = 'wk-leggeri-v2';
const LEGGERO_SOGLIA = 3 * 1024 * 1024;
const leggeri = (() => { try { const v = JSON.parse(localStorage.getItem(LEGGERI_KEY) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch (e) { return new Set(); } })();
function segnaLeggero(nome) {
  leggeri.add(nome);
  try { localStorage.setItem(LEGGERI_KEY, JSON.stringify([...leggeri].slice(-2000))); } catch (e) { /* niente */ }
}
const eVideo = n => /\.(mp4|webm|mov|m4v)$/.test(n);
async function alleggerisci(nome, blob, dice) {
  if (!eVideo(nome) || blob.size <= LEGGERO_SOGLIA || leggeri.has(nome)) return blob;
  const piccolo = await comprimiVideo(blob, x => { if (dice) dice('comprimo… ' + Math.min(99, Math.round(x * 100)) + '%'); });
  /* il browser non ce la fa: non si segna, cosi' ci riprova un altro dispositivo */
  if (senzaCompressione) return blob;
  segnaLeggero(nome);
  if (!piccolo || piccolo.size > blob.size * 0.85) return blob;
  const nuovo = new Blob([piccolo], { type: tipoVideo(nome) });
  try { await vPut(nome, nuovo); } catch (e) { /* resta quello di prima nel telefono */ }
  return nuovo;
}

async function tieniVideo(f, avanza) {
  const piccolo = await comprimiVideo(f, avanza);
  if (piccolo && piccolo.size < f.size) f = new File([piccolo], 'video.mp4', { type: 'video/mp4' });
  if (f.size > VIDEO_MAX) {
    return { errore: 'Video troppo grande: ' + Math.round(f.size / 1048576) + ' MB, il limite è 60 MB. Registra un pezzo più corto, o a 720p.' };
  }
  const est = (f.name.match(/\.(mp4|webm|mov|m4v)$/i) || [0, 'mp4'])[1].toLowerCase();
  const nome = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + est;
  segnaLeggero(nome);                       /* gia' compresso qui: non si rifa' */
  try {
    await vPut(nome, new Blob([f], { type: tipoVideo(nome) }));
  } catch (e) {
    return { errore: 'Su questo telefono non c\'è spazio per il video.' };
  }
  return { nome: nome };
}

/* ------------------------------------------------- il pannello dei gruppi ---- */

const stessaVia = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const dentroVia = (g, via) => g.length >= via.length && via.every((x, i) => g[i] === x);

function gruppiDi(sc) {
  const out = [];
  for (const r of sc.es) {
    const g = r[2] || [];
    for (let d = 1; d <= g.length; d++) {
      const v = g.slice(0, d);
      if (!out.some(x => stessaVia(x, v))) out.push(v);
    }
  }
  return out;
}

function accoda(sc, i, via) {
  const r = sc.es[i];
  const resto = sc.es.filter((x, j) => j !== i);
  let ultimo = -1;
  resto.forEach((x, j) => { if (dentroVia(x[2] || [], via)) ultimo = j; });
  if (ultimo < 0) return;
  sc.es = resto.slice(0, ultimo + 1).concat([r], resto.slice(ultimo + 1));
}

const dlgGrp = $('gruppo');
let grp = null;                   /* { src, scheda, via } */

/* Dopo ogni cambio nei gruppi si ridisegnano la pagina e l'editor. */
function dopoModifica() {
  paintW();
  if (typeof edRidisegna === 'function') edRidisegna();
}

/* `src` e' la fonte della scheda: il piano di sempre o una preparazione. */
function apriGruppi(src, nome, via) {
  const tutte = schedeDi(src);
  if (!tutte[nome]) tutte[nome] = { es: [], rec: '' };
  grp = { src: src, scheda: nome, via: via ? viaGruppi(via) : null };
  disegnaGruppi();
  dlgGrp.showModal();
  dlgGrp.focus();
}

function disegnaGruppi() {
  if (!grp) return;
  const sc = schedeDi(grp.src)[grp.scheda] || { es: [] };
  const vie = gruppiDi(sc);
  if (grp.via && !vie.some(v => stessaVia(v, grp.via))) vie.push(grp.via);

  const chips = $('gElenco');
  chips.textContent = '';
  for (const v of vie) {
    const c = el('button', 'chip chipw' + (grp.via && stessaVia(v, grp.via) ? ' sel' : ''),
                 v.join(' › ') || '(senza nome)');
    c.type = 'button';
    c.dataset.gapri = JSON.stringify(v);
    chips.appendChild(c);
  }
  const piu = el('button', 'chip chipw chipnuovo', '+ nuovo');
  piu.type = 'button';
  piu.dataset.gnuovo = '1';
  chips.appendChild(piu);

  const corpo = $('gCorpo');
  corpo.hidden = !grp.via;
  if (!grp.via) return;

  const via = grp.via;
  $('gNome').value = via[via.length - 1];

  const sel = $('gDentro');
  sel.textContent = '';
  const nessuno = el('option', null, 'non dentro un altro gruppo');
  nessuno.value = '';
  sel.appendChild(nessuno);
  for (const v of vie) {
    if (dentroVia(v, via)) continue;
    if (v.length >= 4) continue;
    const o = el('option', null, 'dentro ' + v.join(' › '));
    o.value = JSON.stringify(v);
    sel.appendChild(o);
  }
  const padre = via.slice(0, -1);
  sel.value = padre.length ? JSON.stringify(padre) : '';

  disegnaTipo(sc, via);

  const lista = $('gLista');
  lista.textContent = '';
  sc.es.forEach((r, i) => {
    if (!r[0] && !r[1]) return;
    const g = r[2] || [];
    const l = el('label', 'grigar');
    const c = el('input', 'schsel');
    c.type = 'checkbox';
    c.checked = dentroVia(g, via);
    c.dataset.gsel = i;
    l.appendChild(c);
    l.appendChild(el('span', 'grinome', r[0] || '—'));
    if (g.length && !stessaVia(g, via)) {
      l.appendChild(el('span', 'grialtro', dentroVia(g, via) ? g.slice(via.length).join(' › ')
                                                             : g.join(' › ')));
    }
    if (r[1]) l.appendChild(el('span', 'grival', r[1]));
    lista.appendChild(l);
  });
  if (!lista.children.length) lista.appendChild(el('p', 'vuoto', 'Ancora niente di scritto'));
  $('gNuovoEs').value = '';
  $('gNuovoQ').value = '';
  $('gElimina').textContent = 'Sciogli questo gruppo';
}

/* --- copia e incolla di un gruppo ---------------------------------------
   Tenendo premuta l'etichetta di un gruppo nel pannello compare "Copia": il
   gruppo (esercizi, quantita', gruppi dentro e tipo) va negli appunti di
   questo telefono. Nella pagina di un workout c'e' poi "Incolla". */
const APPUNTI_KEY = 'wk-appunti-gruppo-v1';
function appuntiGruppo() {
  try { const v = JSON.parse(localStorage.getItem(APPUNTI_KEY) || 'null'); return v && Array.isArray(v.es) && v.es.length ? v : null; }
  catch (e) { return null; }
}
function copiaGruppo(sc, via) {
  const d = via.length - 1;
  const es = sc.es.filter(r => r[0] && dentroVia(r[2] || [], via))
    .map(r => [r[0], r[1] || '', (r[2] || []).slice(d), r[3] || '', r[4] || '']);
  const tipi = {};
  for (const k of Object.keys(sc.tipi || {})) {
    const v = JSON.parse(k);
    if (dentroVia(v, via)) tipi[JSON.stringify(v.slice(d))] = sc.tipi[k];
  }
  try { localStorage.setItem(APPUNTI_KEY, JSON.stringify({ nome: via[d], es: es, tipi: tipi })); } catch (e) { return false; }
  return true;
}
/* Incolla in fondo alla scheda, fuori da altri gruppi. Se c'e' gia' un gruppo
   con lo stesso nome, il nuovo prende un numero dopo il nome. */
function incollaGruppo(sc) {
  const a = appuntiGruppo();
  if (!a) return '';
  const usati = new Set(sc.es.map(r => (r[2] || [])[0]).filter(Boolean));
  let nome = a.nome, n = 2;
  while (usati.has(nome)) nome = (a.nome + ' ' + n++).slice(0, 40);
  sc.es = sc.es.concat(a.es.map(r => [r[0], r[1], [nome].concat(r[2].slice(1)), r[3], r[4]]));
  for (const k of Object.keys(a.tipi || {})) {
    const v = JSON.parse(k);
    if (!sc.tipi) sc.tipi = {};
    sc.tipi[JSON.stringify([nome].concat(v.slice(1)))] = a.tipi[k];
  }
  return nome;
}

/* Il dito tenuto giu' su un'etichetta: dopo mezzo secondo compare "Copia" */
let gPremuto = null, gPremutoT = null;
$('gElenco').addEventListener('pointerdown', ev => {
  const a = ev.target.closest('button[data-gapri]');
  if (!a) return;
  clearTimeout(gPremutoT);
  gPremutoT = setTimeout(() => { gPremuto = a; mostraCopia(a); }, 550);
});
for (const t of ['pointerup', 'pointerleave', 'pointercancel']) $('gElenco').addEventListener(t, () => clearTimeout(gPremutoT));
$('gElenco').addEventListener('contextmenu', ev => { if (ev.target.closest('button[data-gapri]')) ev.preventDefault(); });
function mostraCopia(a) {
  for (const x of $('gElenco').querySelectorAll('.gcopia')) x.remove();
  const b = el('button', 'chip gcopia', 'Copia');
  b.type = 'button';
  b.addEventListener('click', ev => {
    ev.stopPropagation();
    const sc = schedeDi(grp.src)[grp.scheda];
    const via = viaGruppi(JSON.parse(a.dataset.gapri));
    b.textContent = copiaGruppo(sc, via) ? 'Copiato ✓' : 'Non riesco a copiare';
    b.disabled = true;
    setTimeout(() => b.remove(), 1500);
  });
  a.after(b);
}

$('gElenco').addEventListener('click', ev => {
  if (!grp) return;
  if (ev.target.closest('.gcopia')) return;
  const a = ev.target.closest('button[data-gapri]');
  /* il tocco lungo che ha fatto comparire Copia non apre il gruppo */
  if (a && gPremuto === a) { gPremuto = null; return; }
  if (a) { grp.via = viaGruppi(JSON.parse(a.dataset.gapri)); disegnaGruppi(); return; }
  if (ev.target.closest('button[data-gnuovo]')) {
    grp.via = [''];
    disegnaGruppi();
    $('gNome').focus();
  }
});

/* Invio nei campi del pannello non chiude il pannello: nel nome conferma il
   nome, negli esercizi aggiunge. */
for (const id of ['gNome', 'gNuovoEs', 'gNuovoQ', 'gLav', 'gRec', 'gGiri', 'gMin']) {
  $(id).addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    if (id === 'gNuovoEs' || id === 'gNuovoQ') $('gNuovoOk').click(); else $(id).blur();
  });
}

$('gNome').addEventListener('change', () => {
  if (!grp || !grp.via) return;
  const sc = schedeDi(grp.src)[grp.scheda];
  const v = $('gNome').value.slice(0, 40).trim();
  const via = grp.via, d = via.length - 1;
  if (v === via[d]) return;
  if (!v) { $('gNome').value = via[d]; return; }
  /* un nome gia' usato da un altro gruppo li unirebbe: si chiede prima */
  const altra = via.slice(0, d).concat([v]);
  if (via[d] && sc.es.some(r => dentroVia(r[2] || [], altra)) &&
      !confirm('Qui c\'è già un gruppo "' + v + '".\n\nUnire i due gruppi in uno solo?')) {
    $('gNome').value = via[d]; return;
  }
  for (const r of sc.es) {
    const g = r[2] || [];
    if (dentroVia(g, via)) g[d] = v;
  }
  spostaTipi(sc, via, via.slice(0, d).concat([v]));
  grp.via = via.slice(0, d).concat([v]);
  touch();
  disegnaGruppi();
  dopoModifica();
});

$('gDentro').addEventListener('change', () => {
  if (!grp || !grp.via) return;
  const sc = schedeDi(grp.src)[grp.scheda];
  const via = grp.via;
  const padre = $('gDentro').value ? viaGruppi(JSON.parse($('gDentro').value)) : [];
  const nuova = padre.concat([via[via.length - 1]]).slice(0, 4);
  const righe = [];
  sc.es.forEach((r, i) => { if (dentroVia(r[2] || [], via)) righe.push(i); });
  for (const i of righe) sc.es[i][2] = nuova.concat((sc.es[i][2] || []).slice(via.length)).slice(0, 4);
  spostaTipi(sc, via, nuova);
  if (padre.length) {
    const blocco = righe.map(i => sc.es[i]);
    const resto = sc.es.filter((r, i) => righe.indexOf(i) < 0);
    let ultimo = -1;
    resto.forEach((r, j) => { if (dentroVia(r[2] || [], padre)) ultimo = j; });
    sc.es = resto.slice(0, ultimo + 1).concat(blocco, resto.slice(ultimo + 1));
  }
  grp.via = nuova;
  touch();
  disegnaGruppi();
  dopoModifica();
});

$('gLista').addEventListener('change', ev => {
  const c = ev.target.closest('input[data-gsel]');
  if (!c || !grp || !grp.via) return;
  const sc = schedeDi(grp.src)[grp.scheda];
  const via = grp.via;
  if (!via[via.length - 1]) {
    c.checked = false;
    $('gNome').focus();
    return;
  }
  const i = +c.dataset.gsel;
  const r = sc.es[i];
  if (!r) return;
  r[2] = c.checked ? via.slice() : via.slice(0, -1);
  accoda(sc, i, via);
  touch();
  disegnaGruppi();
  dopoModifica();
});

$('gNuovoOk').addEventListener('click', () => {
  if (!grp || !grp.via) return;
  const sc = schedeDi(grp.src)[grp.scheda];
  const via = grp.via;
  const a = $('gNuovoEs').value.slice(0, 60).trim();
  const b = $('gNuovoQ').value.slice(0, 60).trim();
  if (!a && !b) { $('gNuovoEs').focus(); return; }
  if (!via[via.length - 1]) { $('gNome').focus(); return; }
  /* come nelle righe del workout: il nome si scrive come in libreria, e un
     nome nuovo entra in libreria */
  let nomeEs = a;
  if (a && typeof edLib === 'function') { const L = edLib(normEs(a), a); if (L) nomeEs = L[0]; }
  sc.es = sc.es.concat([[nomeEs, b, via.slice(), '', '']]);
  accoda(sc, sc.es.length - 1, via);
  touch();
  disegnaGruppi();
  dopoModifica();
  $('gNuovoEs').focus();
});

/* --- il tipo del gruppo nel pannello ---------------------------------- */

/* Dal nome si indovina il tipo, solo per consigliarlo: "Tabata 45/15 x3". */
function tipoDalNome(nome) {
  if (/tabata/i.test(nome)) {
    const t = tempiIn(nome);
    return { t: 'tabata', l: t[0] || 20, r: t.length > 1 ? t[1] : 10, g: giriIn(nome) };
  }
  if (/emom/i.test(nome)) {
    const m = nome.match(/emom\s*(?:x\s*|di\s*)?(\d{1,3})(?!\d|\s*["”″\/])/i) || nome.match(/(\d{1,3})\s*(?:min|['’′])/i);
    return { t: 'emom', m: m ? +m[1] : 0, a: [] };
  }
  return null;
}

/* Gli esercizi di un gruppo, in ordine. */
const esDelGruppo = (sc, via) => sc.es.filter(r => r[0] && dentroVia(r[2] || [], via));

/* Quanto dura, detto in chiaro: e' quello che fara' il timer. */
function riassuntoTipo(t, n) {
  if (t.t === 'tabata') {
    const tot = t.g ? t.g * n * (t.l + t.r) - t.r : 0;
    return 'Timer: ' + n + (n === 1 ? ' esercizio' : ' esercizi') + ' di fila, ' + t.l + '" di lavoro e ' + t.r + '" di recupero ciascuno, ' +
      (t.g ? t.g + (t.g === 1 ? ' giro' : ' giri') + ' · ' + mmss(tot) + ' in tutto.' : 'un giro dopo l\'altro fino a Stop.');
  }
  const a = t.a.length ? t.a : [1];
  const turno = a.slice(0, Math.max(1, n)).map(x => x + ' min').join(' + ');
  return 'Timer: un minuto nuovo ogni 60", ' + (n > 1 ? 'esercizi a turno (' + turno + '), ' : '') +
    (t.m ? t.m + ' minuti in tutto.' : 'fino a Stop.');
}

function disegnaTipo(sc, via) {
  const nome = via[via.length - 1] || '';
  const k = JSON.stringify(via);
  const t = (sc.tipi && sc.tipi[k]) || null;
  const consiglio = !t && tipoDalNome(nome);
  for (const b of $('gTipo').querySelectorAll('[data-gtipo]')) {
    b.classList.toggle('sel', (t ? t.t : '') === b.dataset.gtipo);
    b.classList.toggle('consigliato', !!consiglio && consiglio.t === b.dataset.gtipo);
  }
  $('gConsiglio').hidden = !consiglio;
  if (consiglio) $('gConsiglio').textContent = 'Il nome dice ' + (consiglio.t === 'tabata' ? 'Tabata' : 'EMOM') + ': toccalo per impostare il suo timer.';
  $('gTabata').hidden = !t || t.t !== 'tabata';
  $('gEmom').hidden = !t || t.t !== 'emom';
  const es = esDelGruppo(sc, via);
  if (t && t.t === 'tabata') {
    $('gLav').value = t.l; $('gRec').value = t.r; $('gGiri').value = t.g || '';
  }
  if (t && t.t === 'emom') {
    $('gMin').value = t.m || '';
    const box = $('gAlt');
    box.textContent = '';
    if (es.length > 1) {
      box.appendChild(el('p', 'nota', 'Minuti di fila per ogni esercizio, poi il prossimo:'));
      es.forEach((r, i) => {
        const l = el('label', 'gnum');
        l.appendChild(el('span', 'galt-es', r[0]));
        const inp = el('input', 'campo');
        inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = 1; inp.max = 10;
        inp.value = t.a[i] || 1;
        inp.dataset.galt = i;
        l.appendChild(inp);
        l.appendChild(el('span', null, 'min'));
        box.appendChild(l);
      });
    }
  }
  $('gTimerNota').hidden = !t;
  const passi = es.reduce((n, r) => n + latiDi(t, r[0]), 0);
  if (t) $('gTimerNota').textContent = es.length ? riassuntoTipo(t, passi) : 'Spunta qui sotto gli esercizi: il timer li usa in questo ordine.';
}

function tipoCambia(fa) {
  if (!grp || !grp.via || !grp.via[grp.via.length - 1]) return;
  const sc = schedeDi(grp.src)[grp.scheda];
  const k = JSON.stringify(grp.via);
  if (!sc.tipi) sc.tipi = {};
  fa(sc, k);
  if (sc.tipi[k]) sc.tipi[k] = validTipo(sc.tipi[k]);
  if (!sc.tipi[k]) delete sc.tipi[k];
  if (!Object.keys(sc.tipi).length) delete sc.tipi;
  touch();
  disegnaGruppi();
  dopoModifica();
}

$('gTipo').addEventListener('click', ev => {
  const b = ev.target.closest('[data-gtipo]');
  if (!b) return;
  if (grp && grp.via && !grp.via[grp.via.length - 1]) { $('gNome').focus(); return; }
  tipoCambia((sc, k) => {
    const tipo = b.dataset.gtipo;
    if (!tipo) { delete sc.tipi[k]; return; }
    if (sc.tipi[k] && sc.tipi[k].t === tipo) return;
    const dal = tipoDalNome(grp.via[grp.via.length - 1]);
    sc.tipi[k] = dal && dal.t === tipo ? dal : tipo === 'tabata' ? { t: 'tabata', l: 20, r: 10, g: 8 } : { t: 'emom', m: 10, a: [] };
  });
});
for (const [id, campo] of [['gLav', 'l'], ['gRec', 'r'], ['gGiri', 'g'], ['gMin', 'm']]) {
  $(id).addEventListener('change', () => tipoCambia((sc, k) => { if (sc.tipi[k]) sc.tipi[k][campo] = +$(id).value || 0; }));
}
$('gAlt').addEventListener('change', ev => {
  const inp = ev.target.closest('[data-galt]');
  if (!inp) return;
  tipoCambia((sc, k) => {
    const t = sc.tipi[k];
    if (!t) return;
    const n = esDelGruppo(sc, grp.via).length;
    const a = [];
    for (let i = 0; i < n; i++) a.push(t.a[i] || 1);
    a[+inp.dataset.galt] = +inp.value || 1;
    t.a = a;
  });
});

/* due tocchi per sciogliere il gruppo: le righe restano */
$('gElimina').addEventListener('click', () => {
  if (!grp || !grp.via) return;
  const b = $('gElimina');
  if (b.textContent !== 'Sicuro? Tocca ancora') { b.textContent = 'Sicuro? Tocca ancora'; return; }
  const sc = schedeDi(grp.src)[grp.scheda];
  const via = grp.via, d = via.length - 1;
  for (const r of sc.es) {
    const g = r[2] || [];
    if (dentroVia(g, via)) g.splice(d, 1);
  }
  /* il suo tipo se ne va; quelli dei gruppi dentro salgono di un posto */
  if (sc.tipi) {
    delete sc.tipi[JSON.stringify(via)];
    spostaTipi(sc, via, via.slice(0, -1));
  }
  grp.via = null;
  touch();
  disegnaGruppi();
  dopoModifica();
});

$('gruppoForm').addEventListener('submit', () => {
  /* un gruppo creato e mai riempito non lascia una scheda vuota */
  if (grp && schedeDi(grp.src)[grp.scheda] && !schedeDi(grp.src)[grp.scheda].es.length && !schedeDi(grp.src)[grp.scheda].rec) {
    delete schedeDi(grp.src)[grp.scheda];
  }
  grp = null; dopoModifica();
});
dlgGrp.addEventListener('cancel', () => { grp = null; });

/* ------------------------------------------------------ impostazioni ---- */

const dlgImp = $('impostazioni');
/* una chiave appena creata qui: al Salva diventa la mia, con l'elenco nuovo */
let miaNuova = '';

function openImpostazioni() {
  $('sviluppo').open = false;        /* si riapre sempre chiusa */
  $('tokenInput').value = token;
  $('miaInput').value = mia ? mia.k : '';
  miaNuova = '';
  const s = $('tokenStato');
  s.className = 'nota';
  s.textContent = token ? 'Token inserito.' : 'Nessun token: le schede si leggono ma non si salvano.';
  paintMia();
  dlgImp.showModal();
}

function paintMia() {
  const c = $('miaStato');
  c.className = 'nota' + (miaKo && !miaNuova ? ' err' : '');
  c.textContent = miaNuova ? 'Chiave nuova: scrivila sul foglio, poi premi Salva.'
                : miaKo    ? 'Questa chiave non apre nessun elenco.'
                : mia      ? 'Chiave inserita.'
                :            'Nessuna chiave: senza, non vedi le persone.';
  $('miaCrea').hidden = !!$('miaInput').value.trim();
}
$('miaInput').addEventListener('input', () => { miaNuova = ''; paintMia(); });
$('miaCrea').addEventListener('click', () => {
  miaNuova = nuovaChiave();
  $('miaInput').value = miaNuova;
  paintMia();
});

$('impostazioniBtn').addEventListener('click', openImpostazioni);

/* Il tema: scuro com'era, o chiaro su fondo bianco. Si cambia al tocco, senza
   Save: e' una preferenza di questo schermo, non un dato del piano. */
const TEMA_KEY = 'wk-tema-v1';
function paintTema() {
  const chiaro = document.documentElement.dataset.theme === 'light';
  for (const b of document.querySelectorAll('#temaScelta [data-tema]')) {
    b.classList.toggle('sel', (b.dataset.tema === 'light') === chiaro);
  }
}
$('temaScelta').addEventListener('click', ev => {
  const b = ev.target.closest('[data-tema]');
  if (!b) return;
  const chiaro = b.dataset.tema === 'light';
  if (chiaro) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  $('metaTema').content = chiaro ? '#ffffff' : '#0d0f12';
  try { localStorage.setItem(TEMA_KEY, chiaro ? 'light' : 'dark'); } catch (e) { /* solo per ora */ }
  paintTema();
});
paintTema();

$('impostazioniForm').addEventListener('submit', async () => {
  token = $('tokenInput').value.trim();
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* resta solo in memoria */ }
  salvaErr = '';
  const scritta = $('miaInput').value;
  const k = pulisciChiave(scritta);
  const nuova = !!k && k === miaNuova;
  miaNuova = '';
  if (scritta.trim() && !k) paintSync('la tua chiave non è scritta giusta: 16 lettere e numeri', true);
  else if (k !== (mia ? mia.k : '') || (token && mia && !mio) || (!token && mio)) await cambiaMia(k, nuova);
  paintTutto();
  if (token && !syncErr) provaToken();
  pullTasks();
});
$('tokenAnnulla').addEventListener('click', () => dlgImp.close());

async function provaToken() {
  try {
    const r = await fetch(API, { headers: ghHeaders(), cache: 'no-store' });
    if (r.status === 401) paintSync('token rifiutato', true);
    else if (r.ok) paintSync('token accettato');
    else if (r.status === 404) paintSync('repository non trovato', true);
    else paintSync('token: errore ' + r.status, true);
  } catch (e) {
    paintSync('niente rete', true);
  }
}

/* -------------------------------------------------------------- sync ----- */

let salvando = false, salvaErr = '', salvaRetry = false;
let syncMsg = '', syncErr = false;

function ghHeaders() {
  const h = { Accept: 'application/vnd.github+json' };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

/* ----------------------------------------------------------- cifratura --- */

/* Il repository e' pubblico: chi lo trova vede i file. Ogni file e' un
   pacchetto illeggibile, chiuso con la chiave di chi lo deve leggere —
   AES-GCM a 256 bit, chiave ricavata dalla parola con PBKDF2. Il vecchio
   poteva essere in chiaro: si legge lo stesso. */

const ITER = 150000;

const bytesB64 = u => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
const b64Bytes = b => {
  const bin = atob(String(b).replace(/\s/g, ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};

async function derivaChiave(pass, salt) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function cifra(testo, pass) {
  if (!pass) throw new Error('key missing');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const k    = await derivaChiave(pass, salt);
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k,
                                           new TextEncoder().encode(testo));
  return JSON.stringify({ enc: 1, salt: bytesB64(salt), iv: bytesB64(iv),
                          ct: bytesB64(new Uint8Array(ct)) }, null, 2) + '\n';
}

async function decifra(testo, pass) {
  let p = null;
  try { p = JSON.parse(testo); } catch (e) { return testo; }
  if (!p || p.enc !== 1) return testo;
  if (!pass) throw new Error('key missing');
  const k = await derivaChiave(pass, b64Bytes(p.salt));
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64Bytes(p.iv) },
                                          k, b64Bytes(p.ct));
  return new TextDecoder().decode(buf);
}

/* base64 di testo UTF-8: btoa da solo si rompe sugli accenti. */
function b64enc(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64dec(b) {
  return new TextDecoder().decode(b64Bytes(b));
}

/* Le ultime sha viste: una risposta rimasta in cache non deve sovrascrivere
   il telefono con una versione vecchia. */
function rememberSha(sha) {
  tstore.sha = sha;
  tstore.known = [sha].concat(tstore.known.filter(x => x !== sha)).slice(0, 4);
}

/* Il telefono ha davvero in mano la versione online `sha`: la sua `base` e'
   quella. Si chiama solo dopo che il contenuto e' entrato, mai prima: cosi'
   il telefono non puo' credersi aggiornato con in mano un piano vecchio. */
function allinea(sha, base) {
  tstore.base = base;
  tstore.shaBase = sha || null;
  if (sha) rememberSha(sha);
}

/* Il telefono si fida della sua copia solo se e' proprio quella della
   versione online, o se ha modifiche sue ancora da salvare sopra quella.
   Altrimenti la copia si e' staccata: si riprende il piano online. */
const copiaFidata = sha => !!sha && tstore.shaBase === sha && !!tstore.base &&
  (tstore.dirty || contenuto(tstore) === JSON.stringify(tstore.base));

/* C'e' da salvare: il piano della persona aperta, o il mio file. */
const daSalvare = () => (tstore.dirty && scrive()) || mioCambiato();

function paintSalva() {
  /* due bottoni, uno stato: in testata e nell'editor */
  /* il bottone serve anche per spingere i video rimasti in coda */
  const inCoda = coda.length && !caricandoVideo && editore();
  for (const b of [$('salva'), $('edSalva')]) {
    if (!b) continue;
    /* si salva da solo: il bottone compare solo se qualcosa non e' andato
       (Riprova) o se ci sono video fermi in coda */
    b.hidden = !((daSalvare() && salvaErr) || inCoda);
    b.disabled = salvando;
    b.classList.toggle('err', !!salvaErr);
    /* con un errore il bottone dice solo Riprova: il perche' sta nella riga sotto */
    b.textContent = salvando ? 'Salvo…' : salvaErr ? 'Riprova' : 'Salva';
  }
  paintPubblica();
}

function paintSync(msg, err) {
  if (msg !== undefined) { syncMsg = msg; syncErr = !!err; }
  const t = syncErr ? syncMsg : daSalvare() ? (salvando ? 'salvataggio…' : 'modifiche da salvare…') : syncMsg;
  for (const s of [$('sync'), $('edStato')]) {
    if (!s) continue;
    s.textContent = t;
    s.classList.toggle('err', syncErr);
  }
}

const leggiFile = percorso => fetch(API + '/contents/' + percorso + '?ref=' + BRANCH, { headers: ghHeaders(), cache: 'no-store' });
const leggi = () => fetch(fileApi() + '?ref=' + BRANCH, { headers: ghHeaders(), cache: 'no-store' });

/* La sha del file pubblicato (null: mai pubblicato, undefined: non si sa).
   La bozza copiata cosi' com'e' ha la stessa sha: uguali = pubblicato. */

async function leggiPubblicato() {
  if (!scrive()) return;
  const f = fidCorrente;
  try {
    const r = await fetch(pubApi() + '?ref=' + BRANCH, { headers: ghHeaders(), cache: 'no-store' });
    if (f !== fidCorrente) return;
    if (r.status === 404) shaPubblicato = null;
    else if (r.ok) shaPubblicato = (await r.json()).sha || undefined;
  } catch (e) { /* si riprova al prossimo giro */ }
  paintPubblica();
}

function paintPubblica() {
  const b = $('edPubblica');
  if (!b) return;
  b.hidden = !scrive();
  const fatto = !tstore.dirty && !!tstore.sha && shaPubblicato === tstore.sha;
  b.disabled = pubblicando || salvando || fatto || shaPubblicato === undefined;
  b.classList.toggle('err', !!pubblicaErr);
  b.classList.toggle('fatto', fatto);
  b.textContent = pubblicando ? 'Pubblico…' : pubblicaErr ? 'Riprova a pubblicare' : fatto ? 'Pubblicato ✓' : 'Pubblica';
}

/* La bozza diventa quella che vede la persona: prima si salva, poi il file
   della bozza si copia byte per byte sul suo file pubblicato. */
async function pubblica() {
  if (pubblicando || !scrive()) return;
  pubblicando = true; pubblicaErr = ''; paintPubblica();
  const esci = err => {
    pubblicando = false; pubblicaErr = err || '';
    paintPubblica();
    paintSync(err ? 'pubblicazione non riuscita: ' + err : 'pubblicato alle ' + fmtTime.format(new Date()), !!err);
  };
  clearTimeout(autoT);
  while (salvando) await new Promise(ok => setTimeout(ok, 200));
  if (daSalvare()) await pushTasks();
  while (salvando) await new Promise(ok => setTimeout(ok, 200));
  if (tstore.dirty || salvaErr) return esci('prima va salvato');
  const PUB = pubApi(), BOZ = bozzaApi();
  try {
    const b = await fetch(BOZ + '?ref=' + BRANCH, { headers: ghHeaders(), cache: 'no-store' });
    if (!b.ok) return esci('bozza non letta (' + b.status + ')');
    const bozza = await b.json();
    const p = await fetch(PUB + '?ref=' + BRANCH, { headers: ghHeaders(), cache: 'no-store' });
    if (!p.ok && p.status !== 404) return esci('errore ' + p.status);
    const pub = p.ok ? await p.json() : null;
    const payload = { message: 'pubblica', content: (bozza.content || '').replace(/\s/g, ''), branch: BRANCH };
    if (pub && pub.sha) payload.sha = pub.sha;
    const r = await fetch(PUB, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: JSON.stringify(payload)
    });
    if (!r.ok) return esci(r.status === 409 ? 'conflitto, riprova' : 'errore ' + r.status);
    let j = null;
    try { j = await r.json(); } catch (e) { /* niente */ }
    if (PUB === pubApi()) shaPubblicato = (j && j.content && j.content.sha) || bozza.sha;
  } catch (e) { return esci('niente rete'); }
  esci('');
}

/* --- il mio file: l'elenco e la libreria --- */

/* Le persone nuove arrivate online da un altro mio dispositivo entrano
   nell'elenco di questo, e cosi' gli esercizi nuovi; per il resto vince
   quello che ho qui. */
function unisciMio(data) {
  for (const p of data.persone) if (!mio.persone.some(x => x.id === p.id)) mio.persone.push(p);
  const gia = new Set(mio.libreria.map(r => normEs(r[0])));
  for (const r of data.libreria) if (!gia.has(normEs(r[0]))) mio.libreria.push(r);
  for (const k of Object.keys(data.esercizi)) if (!(k in mio.esercizi)) mio.esercizi[k] = data.esercizi[k];
}

async function pullMio() {
  if (!editore() || !mia) return;
  let r;
  try { r = await leggiFile(fileDi(mia.f)); } catch (e) { return; }
  if (r.status === 404) {
    if (!mio.sha && !mio.persone.length) {
      miaKo = true;
      paintTutto();
      paintSync('la tua chiave non apre nessun elenco: controllala in ⚙', true);
    }
    return;
  }
  if (!r.ok) return;
  let j;
  try { j = await r.json(); } catch (e) { return; }
  if (!j || !j.sha || mio.known.indexOf(j.sha) >= 0) return;
  let data;
  try { data = datiMio(JSON.parse(await decifra(b64dec(j.content), mia.k))); }
  catch (e) { miaKo = true; paintTutto(); paintSync('elenco: chiave sbagliata', true); return; }
  if (mioCambiato()) unisciMio(data);
  else { mio.persone = data.persone; mio.libreria = data.libreria; mio.esercizi = data.esercizi; }
  mio.salvato = JSON.stringify(data);
  mio.sha = j.sha;
  mio.known = [j.sha].concat(mio.known).slice(0, 4);
  saveMio();
}

/* Un file scritto sul branch, in un commit. */
async function scriviFile(percorso, testo, sha, messaggio, keepalive) {
  const payload = { message: messaggio, content: b64enc(testo), branch: BRANCH };
  if (sha) payload.sha = sha;
  const body = JSON.stringify(payload);
  let r;
  try {
    r = await fetch(API + '/contents/' + percorso, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: body,
      keepalive: !!keepalive && body.length < 60000
    });
  } catch (e) {
    return { rete: true };
  }
  let j = null;
  try { j = await r.json(); } catch (e) { /* niente */ }
  return { ok: r.ok, status: r.status, sha: j && j.content && j.content.sha, msg: (j && j.message) || '' };
}

/* Scrive, e sistema quello che puo' andare storto: manca il branch (si crea e
   si riprova); online e' cambiato qualcosa nel frattempo (`conflitto` rilegge
   e dice se e' gia' uguale, o con quale sha e quale testo riprovare). */
async function scriviConRiprova(percorso, testo, sha, messaggio, keepalive, conflitto) {
  const rete = () => { salvaRetry = true; return { errore: 'niente rete' }; };
  let r = await scriviFile(percorso, testo, sha, messaggio, keepalive);
  if (r.rete) return rete();
  if (!r.ok && (r.status === 404 || (r.status === 422 && /branch/i.test(r.msg)))) {
    if (!(await creaBranch())) return { errore: r.status === 404 ? 'repository non trovato' : 'branch mancante' };
    r = await scriviFile(percorso, testo, sha, messaggio, keepalive);
    if (r.rete) return rete();
  }
  if (!r.ok && (r.status === 409 || r.status === 422)) {
    let c = null;
    try { c = await conflitto(); } catch (e) { /* si cade nell'errore qui sotto */ }
    if (!c) return { errore: 'conflitto online' };
    if (c.uguale) return { sha: c.sha };
    r = await scriviFile(percorso, c.testo || testo, c.sha, messaggio, keepalive);
    if (r.rete) return rete();
  }
  if (!r.ok) {
    salvaRetry = r.status >= 500;
    return { errore: r.status === 401 ? 'token rifiutato'
                   : r.status === 403 ? 'token senza permesso'
                   : r.status === 404 ? 'repository non trovato'
                   :                    'errore ' + r.status };
  }
  return { sha: r.sha };
}

/* Il mio file: l'elenco e la libreria, chiusi con la mia chiave. Torna
   l'errore, o ''. */
async function salvaMio(keepalive) {
  const m = mio, k = mia.k, f = mia.f;
  const testoDi = () => cifra(JSON.stringify(datiMio(m), null, 2) + '\n', k);
  let scritto = contenutoMio(m);
  let corpo;
  try { corpo = await testoDi(); } catch (e) { return 'cifratura fallita'; }
  const r = await scriviConRiprova(fileDi(f), corpo, m.sha, 'elenco', keepalive, async () => {
    const cur = await leggiFile(fileDi(f));
    if (cur.status === 404) return { sha: null };
    if (!cur.ok) return null;
    const j = await cur.json();
    const data = datiMio(JSON.parse(await decifra(b64dec(j.content), k)));
    if (m === mio) unisciMio(data);
    scritto = contenutoMio(m);
    if (scritto === JSON.stringify(data)) return { uguale: true, sha: j.sha };
    return { sha: j.sha, testo: await testoDi() };
  });
  if (r.errore) return r.errore;
  if (r.sha) { m.sha = r.sha; m.known = [r.sha].concat(m.known).slice(0, 4); }
  m.salvato = scritto;
  if (m === mio) saveMio();
  return '';
}

/* --- il passaggio: dal vecchio alla prima persona --- */

/* Un file del vecchio: il contenuto, o null se non c'e'. */
async function leggiVecchio(percorso) {
  const r = await leggiFile(percorso);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GitHub: errore ' + r.status);
  const j = await r.json();
  return inForma(JSON.parse(await decifra(b64dec(j.content), chiaveVecchia())));
}

const nuovoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/* il segno che il passaggio e' finito: un file con dentro solo "ok" */
const SEGNO_ELENCO = '.fatto';
const SEGNO_ELENCO_FILE = 'persone/' + SEGNO_ELENCO;

/* La prima volta, con una chiave mia appena creata: l'elenco nasce qui. Il
   vecchio diventa la prima persona: la sua bozza diventa la sua bozza, il
   pubblicato il suo pubblicato, e la sua libreria (con varianti e
   categorie) diventa la mia. Il vecchio resta dov'e'. Se online c'e' gia'
   un elenco non si rifa': vuol dire che la mia chiave e' un'altra, quella
   sul foglio. */
async function creaElenco() {
  /* c'e' gia' un elenco se c'e' il segno che il passaggio e' finito, o se i
     file pubblicati sono almeno due (il mio e quello della prima persona). I
     pezzi rimasti a meta' da un passaggio interrotto non contano: non hanno
     nessuna chiave salvata che li apra. */
  let r;
  try { r = await leggiFile('persone'); } catch (e) { return 'niente rete'; }
  if (r.ok) {
    let nomi = [];
    try { const l = await r.json(); nomi = Array.isArray(l) ? l.map(x => x.name) : []; } catch (e) { /* niente */ }
    if (nomi.indexOf(SEGNO_ELENCO) >= 0 || nomi.filter(n => /\.json$/.test(n) && !/-bozza\.json$/.test(n)).length >= 2) {
      return 'online c\'è già un elenco: scrivi la chiave che hai sul foglio';
    }
  } else if (r.status !== 404) return r.status === 401 ? 'token rifiutato' : 'GitHub: errore ' + r.status;
  let pub, boz;
  try {
    pub = await leggiVecchio(fileDi(VECCHIO));
    boz = await leggiVecchio(bozzaDi(VECCHIO));
  } catch (e) { return 'il piano di prima non si legge: ' + e.message; }
  /* modifiche fatte in questo telefono e mai salvate: sono le piu' nuove */
  const qui = readStore(STORE_KEY);
  if (qui.dirty) boz = inForma(qui);
  const prima = boz || pub;
  mio = inFormaMio({ f: mia.f });
  mio.salvato = '';                   /* nuovo: va online anche se e' vuoto */
  if (!prima) { apriPersona('', ''); saveMio(); return ''; }
  const k = nuovaChiave();
  const p = { id: nuovoId(), nome: 'Sifu', chiave: k, f: await codiceDi(k) };
  /* il pubblicato, com'era, chiuso con la sua chiave */
  if (pub) {
    let corpo;
    try { corpo = await cifra(JSON.stringify(JSON.parse(contenuto(pub)), null, 2) + '\n', k); }
    catch (e) { return 'cifratura fallita'; }
    const w = await scriviConRiprova(fileDi(p.f), corpo, null, 'pubblica', false, async () => null);
    if (w.errore) return 'il passaggio non è riuscito: ' + w.errore;
  }
  mio.persone.push(p);
  mio.libreria = validLibreria(prima.libreria);
  mio.esercizi = validEsercizi(prima.esercizi);
  apriPersona(p.chiave, p.f);
  tstore = inForma(Object.assign(JSON.parse(contenuto(prima)), { dirty: true }));
  allineaLib();
  saveLocal();
  saveMio();
  try { localStorage.setItem(SCELTA_KEY, p.id); } catch (e) {}
  return '';
}

/* Cambia la mia chiave in questo dispositivo: vuota, nuova o scritta a mano. */
async function cambiaMia(k, nuova) {
  miaKo = false;
  /* senza chiave, o senza token, niente elenco: si legge e basta */
  if (!k || !token) {
    mia = k ? { k: k, f: await codiceDi(k) } : null;
    scriviChiave(MIA_KEY, mia);
    mio = null;
    apriSenzaElenco();
    return;
  }
  mia = { k: k, f: await codiceDi(k) };
  if (nuova) {
    /* la chiave nuova resta nel telefono solo quando l'elenco e' online:
       se il passaggio si interrompe, si rifa' da capo con una chiave nuova */
    const prima = leggiChiave(MIA_KEY);
    const fallito = err => {
      /* si torna com'era prima: con la chiave di prima, se c'era */
      mia = prima; mio = null;
      apriPersona('', '');
      if (mia && token) {
        const m = readStore(MIO_KEY);
        mio = inFormaMio(m.f === mia.f ? m : { f: mia.f });
        scegliIniziale();
        pullTasks();
      } else apriSenzaElenco();
      paintTutto();
      paintSync(err, true);
    };
    paintSync('preparo l\'elenco…');
    const err = await creaElenco();
    if (err) return fallito(err);
    paintTutto();
    await pushTasks();
    if (!mio || !mio.sha) return fallito('l\'elenco non è arrivato online: ' + (salvaErr || 'riprova') + '. Crea di nuovo la chiave.');
    scriviChiave(MIA_KEY, mia);
    saveMio();
    scriviFile(SEGNO_ELENCO_FILE, 'ok\n', null, 'elenco pronto').catch(() => {});
    return;
  }
  scriviChiave(MIA_KEY, mia);
  const m = readStore(MIO_KEY);
  mio = inFormaMio(m.f === mia.f ? m : { f: mia.f });
  apriPersona('', '');
  await pullMio();
  scegliIniziale();
}

/* Chi non ha l'elenco apre la persona della sua chiave; senza chiave, il
   vecchio, finche' c'e'. */
function apriSenzaElenco() {
  const p = leggiChiave(PERSONA_KEY);
  if (p) apriPersona(p.k, p.f);
  else apriPersona(chiaveVecchia(), VECCHIO);
}

/* La persona da aprire: l'ultima scelta, o la prima dell'elenco. Se e' gia'
   aperta non si tocca. Aprendola, la sua parte di libreria si rimette in
   pari con la mia. */
function scegliIniziale() {
  if (!mio) return;
  let id = '';
  try { id = localStorage.getItem(SCELTA_KEY) || ''; } catch (e) {}
  const p = mio.persone.find(x => x.id === id) || mio.persone[0];
  if (!p) { apriPersona('', ''); return; }
  if (p.f !== fidCorrente) apriPersona(p.chiave, p.f);
}

/* --- il file della persona --- */

/* Il file dal branch: per chi scrive la bozza della persona aperta, per gli
   altri il suo file pubblicato. Senza token si legge lo stesso. Se il
   telefono ha modifiche non salvate, le due versioni si uniscono (vedi
   unisci). Prima, per chi ha l'elenco, l'elenco. */
async function pullTasks(opts) {
  opts = opts || {};
  if (editore()) {
    await pullMio();
    if (editore() && (!fidCorrente || !personaCorrente())) { scegliIniziale(); paintTutto(); }
  }
  if (!fidCorrente) {
    if (!miaKo) paintSync('');
    return;
  }
  const f = fidCorrente, pass = chiave;
  let r;
  try { r = await leggi(); } catch (e) { paintSync('senza rete: uso la copia di questo telefono'); return; }
  let tokenKo = false;
  if (r.status === 401 && token) {
    tokenKo = true;
    try {
      r = await fetch(pubApi() + '?ref=' + BRANCH, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
    } catch (e) { paintSync('token rifiutato', true); return; }
  }
  if (f !== fidCorrente) return;            /* nel frattempo si e' cambiata persona */
  /* la prima volta la bozza non c'e': nasce dal file pubblicato */
  if (r.status === 404 && scrive() && !tokenKo && !opts.bozza) {
    if (await creaBozza()) return pullTasks({ bozza: true });
  }
  if (scrive() && !tokenKo) leggiPubblicato();
  /* "in sync" non si scrive: quando e' tutto a posto la riga resta vuota, e
     parla solo quando c'e' qualcosa da dire */
  const fine = msg => {
    if (/^(in sync|sincronizzato)/.test(msg || '')) msg = '';
    paintSync(tokenKo ? 'token rifiutato' : msg, tokenKo);
  };
  /* chi legge e basta non ha niente da salvare: comanda sempre quello online */
  if (!scrive() && tstore.dirty) tstore.dirty = false;
  if (r.status === 404) {
    fine(tstore.sha ? 'file non trovato online' : 'ancora nessun piano online');
    if (scrive() && tstore.dirty) autoSalva();
    return;
  }
  if (!r.ok) { fine('GitHub: errore ' + r.status); return; }

  let j;
  try { j = await r.json(); } catch (e) { return; }
  if (!j || !j.sha || f !== fidCorrente) return;
  if (copiaFidata(j.sha)) {
    chiaveKo = false;
    fine(tstore.dirty ? '' : 'in sync');
    if (scrive() && allineaLib()) touch();   /* la libreria e' cambiata nel frattempo */
    else if (tstore.dirty) autoSalva();       /* modifiche rimaste in sospeso: ripartono */
    scaricaVideo();
    return;
  }

  let data;
  try {
    data = JSON.parse(await decifra(b64dec(j.content), pass));
  } catch (e) {
    paintSync('piano cifrato: chiave mancante o sbagliata', true);
    chiaveKo = true;
    return;
  }
  if (f !== fidCorrente) return;
  chiaveKo = false;
  const remoto = { workout: validWorkout(data.workout), schede: validSchede(data.schede),
                   conti: validConti(data.conti, data.slot), mattina: validMattina(data.mattina),
                   mattinaVia: !!data.mattinaVia, prep: validPrep(data.prep),
                   mattinaQuando: validQuando(data.mattinaQuando), altre: validAltre(data.altre),
                   sorprese: validSorprese(data.sorprese), libreria: validLibreria(data.libreria),
                   esercizi: validEsercizi(data.esercizi) };

  /* chi sta scrivendo nell'editor non perde quello che ha scritto: il campo
     si chiude, e se c'era qualcosa di nuovo diventa da salvare */
  const edA = document.activeElement;
  if (!$('ed').hidden && edA && $('ed').contains(edA) && edA.blur) edA.blur();

  if (tstore.dirty) {
    if (contenuto(remoto) === contenuto(tstore)) {
      allinea(j.sha, istantanea(remoto)); tstore.dirty = false; saveLocal(); paintSalva();
      fine('sincronizzato');
      return;
    }
    const n = uniscoConOnline(remoto, j.sha);
    if (n < 0) { fine('online c\'è un\'altra versione: salvando la sostituisci'); return; }
    touch();                      /* il piano unito parte da solo */
    fine(dettoUnione(n));
    return;
  }

  tstore.workout = remoto.workout;
  tstore.schede = remoto.schede;
  tstore.conti = remoto.conti;
  tstore.prep = remoto.prep;
  tstore.mattina = remoto.mattina;
  tstore.mattinaVia = remoto.mattinaVia;
  tstore.mattinaQuando = remoto.mattinaQuando;
  tstore.altre = remoto.altre;
  tstore.sorprese = remoto.sorprese;
  tstore.libreria = remoto.libreria;
  tstore.esercizi = remoto.esercizi;
  allinea(j.sha, istantanea(remoto));
  if (typeof edRidisegna === 'function') edRidisegna();
  tstore.dirty = false;
  saveLocal();
  paintW(); paintSalva();
  fine('sincronizzato alle ' + fmtTime.format(new Date()));
  /* la libreria e' cambiata da quando la persona e' stata salvata: la sua
     parte si rimette in pari, e parte da sola */
  if (scrive() && allineaLib()) touch();
  scaricaVideo();
  controllaSorprese();
}

/* La bozza copia il file pubblicato, cosi' com'e'. Se nemmeno quello c'e',
   la bozza nascera' al primo salvataggio. */
async function creaBozza() {
  try {
    const p = await fetch(pubApi() + '?ref=' + BRANCH, { headers: ghHeaders(), cache: 'no-store' });
    if (!p.ok) return false;
    const pub = await p.json();
    const r = await fetch(bozzaApi(), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: JSON.stringify({ message: 'bozza: copia del pubblicato', content: (pub.content || '').replace(/\s/g, ''), branch: BRANCH })
    });
    return r.ok || r.status === 422;       /* 422: c'e' gia' */
  } catch (e) {
    return false;
  }
}

/* Il branch del file non c'e' ancora: lo si crea da main. Serve una volta
   sola, al primo salvataggio. Il token basta: e' il permesso Contents. */
async function creaBranch() {
  try {
    const r = await fetch(API + '/git/ref/heads/main', { headers: ghHeaders(), cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    const c = await fetch(API + '/git/refs', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: JSON.stringify({ ref: 'refs/heads/' + BRANCH, sha: j.object.sha })
    });
    return c.ok || c.status === 422;       /* 422: esiste gia' */
  } catch (e) {
    return false;
  }
}

/* Salva: prima il mio file, se e' cambiato, poi la bozza della persona
   aperta, in un commit solo. */
async function pushTasks(opts) {
  opts = opts || {};
  if (salvando) return;
  if (!editore()) {
    if (tstore.dirty && fidCorrente && fidCorrente !== VECCHIO) {
      salvaErr = 'token mancante'; paintSalva(); paintSync('token o chiave mancante: apri ⚙ Impostazioni', true);
    }
    return;
  }

  if (mioCambiato()) {
    salvando = true; salvaErr = ''; salvaRetry = false;
    paintSalva(); paintSync();
    let err = '';
    try { err = await salvaMio(!!opts.keepalive); } finally { salvando = false; }
    if (err) { salvaErr = err; paintSalva(); paintSync('elenco: ' + err, true); return; }
    paintSalva();
    if (!(tstore.dirty && scrive())) { paintSync('salvato alle ' + fmtTime.format(new Date())); if (!opts.keepalive) codaVideo(); return; }
  }
  if (!tstore.dirty || !scrive()) return;

  salvando = true; salvaErr = ''; salvaRetry = false;
  paintSalva(); paintSync();

  const api = fileApi(), pass = chiave;
  const sent = contenuto(tstore);
  /* il file si scrive gia' ripulito: righe vuote e schede vuote restano fuori */
  const testo = JSON.stringify({ workout: validWorkout(tstore.workout), conti: tstore.conti,
                                 schede: validSchede(tstore.schede),
                                 mattina: tstore.mattina || undefined,
                                 mattinaVia: tstore.mattinaVia || undefined,
                                 mattinaQuando: tstore.mattinaQuando.modo === 'sempre' ? undefined : validQuando(tstore.mattinaQuando),
                                 altre: tstore.altre.length ? validAltre(tstore.altre) : undefined,
                                 prep: tstore.prep.length ? validPrep(tstore.prep) : undefined,
                                 sorprese: validSorprese(tstore.sorprese).length ? validSorprese(tstore.sorprese) : undefined,
                                 libreria: validLibreria(tstore.libreria).length ? validLibreria(tstore.libreria) : undefined,
                                 esercizi: Object.keys(validEsercizi(tstore.esercizi)).length ? validEsercizi(tstore.esercizi) : undefined }, null, 2) + '\n';
  let corpo;
  try {
    corpo = await cifra(testo, pass);
  } catch (e) {
    salvando = false; salvaErr = 'cifratura fallita'; paintSalva();
    paintSync('cifratura fallita: controlla la chiave', true);
    return;
  }
  const payload = {
    message: 'scheda: ' + Object.keys(tstore.schede).length + ' schede, ' + tstore.prep.length + ' preparazioni',
    content: b64enc(corpo),
    branch:  BRANCH
  };
  if (tstore.sha) payload.sha = tstore.sha;
  const body = JSON.stringify(payload);

  const salvato = sha => {
    allinea(sha, JSON.parse(sent));
    if (contenuto(tstore) === sent) tstore.dirty = false;
    saveLocal(); paintSalva();
    paintSync('salvato alle ' + fmtTime.format(new Date()) + (notaUnione ? ' · ' + notaUnione : ''));
    notaUnione = '';
    if (tstore.dirty) autoSalva();       /* modifiche arrivate mentre salvava */
  };

  let r;
  try {
    r = await fetch(api, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: body,
      keepalive: !!opts.keepalive && body.length < 60000
    });
  } catch (e) {
    salvando = false; salvaErr = 'niente rete'; salvaRetry = true; paintSalva(); paintSync(); return;
  }
  salvando = false;
  if (api !== fileApi()) return;          /* nel frattempo si e' cambiata persona */

  /* manca il branch: si crea e si riprova, una volta */
  if ((r.status === 404 || r.status === 422) && !opts.branch) {
    let msg = '';
    try { msg = (await r.clone().json()).message || ''; } catch (e) { /* niente */ }
    if (/branch/i.test(msg) || r.status === 404) {
      if (await creaBranch()) return pushTasks(Object.assign({}, opts, { branch: true }));
      salvaErr = r.status === 404 ? 'repository non trovato' : 'branch mancante';
      paintSalva(); paintSync(salvaErr, true);
      return;
    }
  }

  /* sha vecchia: online e' cambiato qualcosa nel frattempo. Si rilegge; se e'
     la nostra stessa versione si e' a posto, altrimenti si riprova una volta
     con la sha giusta, dopo aver unito le modifiche dell'altro telefono. */
  if ((r.status === 409 || r.status === 422) && !opts.retry) {
    try {
      const cur = await leggi();
      if (cur.ok) {
        const j = await cur.json();
        let data = null;
        try { data = JSON.parse(await decifra(b64dec(j.content), pass)); } catch (e) { /* si riprova comunque */ }
        if (data && contenuto(data) === sent) { salvato(j.sha); return; }
        /* online c'e' la versione di un altro telefono: si unisce, poi si
           salva il piano unito. La sha nuova serve per scrivere; il
           telefono la conta come sua solo dopo l'unione o il salvataggio. */
        tstore.sha = j.sha;
        if (data) {
          const n = uniscoConOnline(data, j.sha);
          if (n >= 0) { allineaLib(); saveLocal(); notaUnione = dettoUnione(n); }
        }
        return pushTasks(Object.assign({}, opts, { retry: true }));
      }
      if (cur.status === 404) {
        tstore.sha = null;
        return pushTasks(Object.assign({}, opts, { retry: true }));
      }
    } catch (e) { /* si cade nell'errore qui sotto */ }
    salvaErr = 'conflitto online'; paintSalva(); paintSync(salvaErr, true);
    return;
  }

  if (!r.ok) {
    salvaErr = r.status === 401 ? 'token rifiutato'
             : r.status === 403 ? 'token senza permesso'
             : r.status === 404 ? 'repository non trovato'
             :                    'errore ' + r.status;
    salvaRetry = r.status >= 500;
    paintSalva(); paintSync(salvaErr, true);
    return;
  }

  let j = null;
  try { j = await r.json(); } catch (e) { /* salvato comunque */ }
  salvato(j && j.content && j.content.sha);
  /* il piano e' salvato: adesso i video nuovi, uno alla volta. Chiudendo
     l'app non si prova nemmeno: un video non parte in un colpo solo. */
  if (!opts.keepalive) codaVideo();
}

/* I video partono per GitHub, ognuno verso la cartella di chi lo deve vedere.
   Quelli che non ce la fanno restano in lista: Save resta acceso, e si
   riprova. La coda gira da sola, separata dal salvataggio del piano. Parte
   appena un video e' pronto, all'apertura dell'app, quando torna la rete o
   l'app torna davanti, e ogni minuto finche' resta qualcosa. Mentre carica
   tiene lo schermo acceso. Un video tolto dal piano esce dalla coda. */
let caricandoVideo = false;
let ritentaVideo = null;
let pesanti = 0;                /* video rimasti pesanti perche' questo browser non comprime */

let coda = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(CODA_KEY) || '[]');
    return Array.isArray(v) ? v.filter(x => x && codiceOk(x.f) && nomeVideoOk(x.n)) : [];
  } catch (e) { return []; }
})();
function scriviCoda() {
  try { localStorage.setItem(CODA_KEY, JSON.stringify(coda)); } catch (e) { /* resta in memoria */ }
}
/* I video gia' online, cartella per cartella: non si guardano ogni volta. */
const caricati = readStore(CARICATI_KEY);
function segnaCaricato(f, n) {
  const a = Array.isArray(caricati[f]) ? caricati[f] : [];
  if (a.indexOf(n) < 0) a.push(n);
  caricati[f] = a;
  writeStore(CARICATI_KEY, caricati);
}

/* Quello che deve stare online adesso, nella cartella della persona aperta e
   nella mia: entra in coda quello che non risulta gia' caricato. Nella mia
   cartella vanno solo i video della libreria che non stanno gia' nella
   cartella di qualcuno: da li' li ritrova anche un altro mio dispositivo
   (vedi fontiVideo). Cosi' ogni video non si carica due volte. */
function aggiornaCoda() {
  if (!editore()) return;
  const servono = [];
  const diPersona = scrive() ? videoDiPersona() : new Set();
  if (scrive()) servono.push({ f: fidCorrente, nomi: diPersona });
  if (mia) {
    const altrove = new Set(diPersona);
    for (const p of mio.persone) for (const n of caricati[p.f] || []) altrove.add(n);
    servono.push({ f: mia.f, nomi: new Set([...videoDiLibreria()].filter(n => !altrove.has(n))) });
  }
  for (const s of servono) {
    const gia = new Set(caricati[s.f] || []);
    coda = coda.filter(x => x.f !== s.f || s.nomi.has(x.n));
    for (const n of s.nomi) {
      if (!gia.has(n) && !coda.some(x => x.f === s.f && x.n === n)) coda.push({ f: s.f, n: n });
    }
  }
  scriviCoda();
}

async function codaVideo() {
  if (caricandoVideo || !editore()) return;
  aggiornaCoda();
  if (!coda.length) { paintSalva(); return; }
  clearTimeout(ritentaVideo);
  caricandoVideo = true;
  paintSalva();
  let luce = null;
  try { if (navigator.wakeLock) luce = await navigator.wakeLock.request('screen'); } catch (e) { /* niente */ }
  try {
    const lista = coda.slice();
    pesanti = 0;
    for (let i = 0; i < lista.length; i++) {
      const x = lista[i];
      const riga = 'carico il video ' + (i + 1) + ' di ' + lista.length;
      paintSync(riga + '… tieni l\'app aperta');
      const esito = await caricaVideo(x, p => paintSync(riga + '… ' + Math.round(p * 100) + '%'), t => paintSync(riga + ': ' + t));
      if (!esito) continue;
      if (esito === true) segnaCaricato(x.f, x.n);
      else if (senzaCompressione) pesanti++;
      coda = coda.filter(y => !(y.f === x.f && y.n === x.n));
      scriviCoda();
    }
  } finally {
    caricandoVideo = false;
    try { if (luce) await luce.release(); } catch (e) { /* niente */ }
  }
  const n = coda.length;
  if (n) {
    paintSync(n + ' video ancora da caricare: riprovo fra un minuto', true);
    ritentaVideo = setTimeout(codaVideo, 60000);
  } else if (senzaCompressione && pesanti) {
    paintSync('questo telefono non sa comprimere i video: ' + pesanti + ' restano pesanti. Apri l\'app da un altro dispositivo (per esempio il PC) per alleggerirli', true);
  } else if (!daSalvare()) {
    paintSync('video a posto alle ' + fmtTime.format(new Date()));
  }
  paintSalva();
}

/* Il salvagente: si chiama chiudendo l'app. */
function salvagente() {
  if (!daSalvare() || !editore() || salvando) return;
  pushTasks({ keepalive: true });
}

function riprovaSalva() {
  if (!(daSalvare() && salvaRetry && !salvando && editore())) return;
  sincronizzaLocale();
  if (daSalvare() && !salvando) pushTasks();
}

$('salva').addEventListener('click', () => {
  /* un campo ancora col cursore dentro non ha ancora scritto: lo si chiude */
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (daSalvare()) pushTasks(); else codaVideo();
});

/* ------------------------------------------------------ le persone ---- */

/* Ridisegna tutto quello che dipende da chi e' aperto. */
function paintTutto() {
  paintEdit();
  paintPersone();
  paintW();
  paintSalva();
  paintSync();
}

/* Il bottone in testata: il nome della persona aperta. Solo per chi scrive. */
function paintPersone() {
  const b = $('persBtn');
  b.hidden = !editore();
  const p = personaCorrente();
  b.textContent = (p ? p.nome : 'Persone') + ' ▾';
  if (dlgPers.open) disegnaPersone();
}

const dlgPers = $('persone');
let persAperta = '';

function disegnaPersone() {
  const box = $('persLista');
  box.textContent = '';
  if (!mio) return;
  if (!mio.persone.length) box.appendChild(el('p', 'vuoto', 'Ancora nessuna persona.'));
  for (const p of mio.persone) {
    const riga = el('div', 'pers-riga' + (p.f === fidCorrente ? ' sel' : ''));
    const nome = el('button', 'pers-nome', p.nome);
    nome.type = 'button';
    nome.dataset.pscegli = p.id;
    riga.appendChild(nome);
    const inv = el('button', 'schbtn', 'Invia');
    inv.type = 'button';
    inv.dataset.pinvia = p.id;
    riga.appendChild(inv);
    const piu = el('button', 'schbtn pers-piu', persAperta === p.id ? '▴' : '⋯');
    piu.type = 'button';
    piu.dataset.papri = p.id;
    piu.setAttribute('aria-label', 'Altro su ' + p.nome);
    riga.appendChild(piu);
    box.appendChild(riga);
    if (persAperta !== p.id) continue;
    const d = el('div', 'pers-dett');
    const lab = el('label', 'commento-lab', 'Nome');
    const n = el('input', 'campo');
    n.type = 'text'; n.maxLength = 40; n.value = p.nome; n.autocomplete = 'off';
    n.dataset.prinomina = p.id;
    lab.appendChild(n);
    d.appendChild(lab);
    d.appendChild(el('p', 'commento-lab', 'Chiave'));
    d.appendChild(el('p', 'pers-chiave', p.chiave));
    d.appendChild(el('p', 'nota', 'È dentro il collegamento che le mandi. Il foglio basta con la tua: questa sta nell\'elenco.'));
    const tog = el('button', 'btn btn-del btn-largo', 'Togli dall\'elenco');
    tog.type = 'button';
    tog.dataset.ptogli = p.id;
    d.appendChild(tog);
    box.appendChild(d);
  }
}

$('persBtn').addEventListener('click', () => {
  if (!editore()) return;
  persAperta = '';
  $('persNota').textContent = '';
  disegnaPersone();
  dlgPers.showModal();
});

/* Passare a un'altra persona: prima si salva quello che c'e' da salvare. */
async function cambiaPersona(p) {
  while (salvando) await aspetta(200);
  if (daSalvare()) await pushTasks();
  while (salvando) await aspetta(200);
  apriPersona(p.chiave, p.f);
  try { localStorage.setItem(SCELTA_KEY, p.id); } catch (e) {}
  mostra.solo = '';
  anteprima = null;
  paintTutto();
  pullTasks();
}

/* Il collegamento con la chiave dentro, dopo il #: quella parte non parte
   mai verso nessun server. Sul telefono si apre la condivisione (WhatsApp,
   SMS, mail); dove non c'e', il messaggio si copia. */
async function invia(p) {
  const link = location.origin + location.pathname + '#k=' + p.chiave;
  const testo = 'Ciao ' + p.nome + ', questa è la tua scheda di allenamento. Apri il collegamento; ' +
                'poi, dal menu del browser, scegli "Aggiungi a schermata Home".';
  if (navigator.share) {
    try { await navigator.share({ title: 'Workout', text: testo, url: link }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(testo + '\n' + link);
    $('persNota').textContent = 'Messaggio copiato: incollalo dove vuoi.';
  } catch (e) {
    $('persNota').textContent = link;
  }
}

$('persLista').addEventListener('click', async ev => {
  const b = ev.target.closest('button');
  if (!b || !mio) return;
  const trova = id => mio.persone.find(x => x.id === id);
  if (b.dataset.pscegli) {
    const p = trova(b.dataset.pscegli);
    dlgPers.close();
    if (p && p.f !== fidCorrente) await cambiaPersona(p);
    return;
  }
  if (b.dataset.pinvia) { const p = trova(b.dataset.pinvia); if (p) invia(p); return; }
  if (b.dataset.papri) { persAperta = persAperta === b.dataset.papri ? '' : b.dataset.papri; disegnaPersone(); return; }
  if (b.dataset.ptogli) {
    if (b.textContent !== 'Sicuro? Tocca di nuovo') { b.textContent = 'Sicuro? Tocca di nuovo'; return; }
    /* il suo file resta online, chiuso: senza la chiave non lo apre nessuno */
    mio.persone = mio.persone.filter(x => x.id !== b.dataset.ptogli);
    persAperta = '';
    saveMio();
    if (!personaCorrente()) { scegliIniziale(); }
    paintTutto();
    disegnaPersone();
    pushTasks();
    pullTasks();
  }
});

$('persLista').addEventListener('change', ev => {
  const n = ev.target.closest('input[data-prinomina]');
  if (!n || !mio) return;
  const p = mio.persone.find(x => x.id === n.dataset.prinomina);
  const v = n.value.slice(0, 40).trim();
  if (!p || !v) { if (p) n.value = p.nome; return; }
  p.nome = v;
  saveMio();
  paintTutto();
  pushTasks();
});

/* Una persona nuova: la chiave la crea l'app. Nasce col piano vuoto, si
   salva subito, e diventa quella aperta. */
async function aggiungiPersona() {
  const nome = $('persNome').value.slice(0, 40).trim();
  if (!nome) { $('persNome').focus(); return; }
  if (!editore()) return;
  const k = nuovaChiave();
  const p = { id: nuovoId(), nome: nome, chiave: k, f: await codiceDi(k) };
  mio.persone.push(p);
  saveMio();
  $('persNome').value = '';
  await cambiaPersona(p);
  tstore.dirty = true;
  saveLocal();
  disegnaPersone();
  $('persNota').textContent = nome + ' è pronta: prepara la scheda con Editor, premi Pubblica, poi tocca Invia.';
  pushTasks();
}
$('persAggiungi').addEventListener('click', aggiungiPersona);
$('persNome').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); aggiungiPersona(); } });

/* ---------------------------------------------------------- avviamento --- */

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { salvagente(); return; }
  if (!sincronizzaLocale()) paintW();
  pullTasks();
  riprovaSalva();
});
window.addEventListener('pagehide', salvagente);
window.addEventListener('online', () => { riprovaSalva(); pullTasks(); codaVideo(); });

/* A mezzanotte cambia la riga di oggi: si ridisegna al passare del giorno. */
let giornoVisto = today().getTime();
setInterval(() => {
  const t = today().getTime();
  if (t !== giornoVisto) { giornoVisto = t; paintW(); }
}, 60000);

/* All'apertura. Prima la chiave arrivata col collegamento, se c'e': resta
   nel telefono, e dall'indirizzo si toglie. Poi chi apre: chi ha token e
   chiave mia vede l'elenco e apre l'ultima persona scelta; gli altri aprono
   la persona della loro chiave, o il vecchio se una chiave non ce l'hanno. */
async function avvia() {
  const h = location.hash.match(/[#&]k=([A-Za-z0-9-]+)/);
  if (h) {
    history.replaceState(history.state, '', location.pathname + location.search);
    const k = pulisciChiave(h[1]);
    if (k) scriviChiave(PERSONA_KEY, { k: k, f: await codiceDi(k) });
  }
  if (token && mia) {
    const m = readStore(MIO_KEY);
    mio = inFormaMio(m.f === mia.f ? m : { f: mia.f });
    scegliIniziale();
  } else {
    apriSenzaElenco();
  }
  paintTutto();
  paintSync('');
  await pullTasks();
  codaVideo();
}
avvia();

/* I video stanno nel telefono per sempre: si chiede al browser di non buttare
   mai i dati di questa app, nemmeno quando la memoria scarseggia. */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* Con l'app aperta, ogni cinque minuti si guarda se il piano e' cambiato: chi
   legge dal telefono vede le modifiche fatte dal PC senza chiudere e riaprire.
   Non piu' spesso: senza token GitHub concede 60 letture l'ora. */
setInterval(() => {
  /* con l'editor aperto no: ridisegnerebbe sotto le dita di chi scrive */
  if (document.visibilityState === 'visible' && !daSalvare() && !salvando && $('ed').hidden) pullTasks();
}, 5 * 60 * 1000);

/* Il tasto indietro (anche quello del telefono) chiude l'anteprima. */
window.addEventListener('popstate', () => {
  if (anteprima && !(history.state && history.state.ant)) {
    anteprima = null;
    disegnaW();
    window.scrollTo(0, 0);
  }
});

/* ------------------------------------------------ le sorprese ---- */

/* Quali sorprese questo telefono ha gia' visto: ognuna si vede una volta. */
const VISTE_KEY = 'wk-sorprese-viste-v1';
function vistiLeggi() {
  try { const v = JSON.parse(localStorage.getItem(VISTE_KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
function vistiSegna(ids) {
  try { localStorage.setItem(VISTE_KEY, JSON.stringify(vistiLeggi().concat(ids).slice(-400))); } catch (e) {}
}

function postille(box, dove) {
  for (const n of festa) {
    if (n.dove !== dove) continue;
    box.appendChild(el('div', 'postilla c' + n.colore, n.testo));
  }
}
function spegniPostille() {
  if (!festa.length) return;
  festa = [];
  document.removeEventListener('pointerdown', spegniPostille, true);
  window.removeEventListener('scroll', spegniPostille);
  paintW();
}
function armaPostille() {
  /* un attimo di respiro: il disegno della pagina non deve spegnerle */
  setTimeout(() => {
    document.addEventListener('pointerdown', spegniPostille, true);
    window.addEventListener('scroll', spegniPostille, { passive: true });
  }, 400);
}

/* L'immagine a tutto schermo: si chiude toccandola. Prima di chiuderla si
   puo' salvare: sul telefono si apre la condivisione, da dove va in galleria
   ("Salva immagine"); dove la condivisione non c'e', si scarica il file. */
async function salvaImmagine(blob) {
  const f = new File([blob], 'sorpresa-' + chiaveData(today()) + '.jpg', { type: blob.type || 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f] }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const u = URL.createObjectURL(f);
  const a = el('a');
  a.href = u; a.download = f.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}

function mostraImmagine(blob) {
  return new Promise(ok => {
    const u = URL.createObjectURL(blob);
    const box = el('div', 'egg-img');
    const img = el('img');
    img.src = u; img.alt = '';
    box.appendChild(img);
    const salva = el('button', 'egg-img-salva', 'Salva nella galleria');
    salva.type = 'button';
    salva.addEventListener('click', ev => { ev.stopPropagation(); salvaImmagine(blob); });
    box.appendChild(salva);
    box.appendChild(el('p', 'egg-img-nota', 'tocca per chiudere'));
    const chiudi = () => { box.classList.remove('on'); setTimeout(() => { box.remove(); URL.revokeObjectURL(u); ok(); }, 250); };
    box.addEventListener('click', chiudi);
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('on'));
  });
}

/* Alla prima apertura del giorno: prima le immagini, poi le postille. */
let festeggiando = false;
async function controllaSorprese(prova) {
  if (festeggiando) return;
  const k = chiaveData(today());
  const visti = vistiLeggi();
  const nuove = prova ? [prova] : validSorprese(tstore.sorprese).filter(x => x.tipo !== 'suono' && x.giorno === k && visti.indexOf(x.id) < 0);
  if (!nuove.length) return;
  festeggiando = true;
  try {
    const immagini = [];
    for (const x of nuove) {
      if (x.tipo !== 'img') continue;
      const b = (await vGet(x.img)) || (await prendiVideo(x.img));
      if (b) immagini.push({ x: x, b: b });
    }
    /* si segna come vista solo quello che si e' potuto mostrare */
    if (!prova) vistiSegna(nuove.filter(x => x.tipo === 'nota' || immagini.some(i => i.x === x)).map(x => x.id));
    for (const i of immagini) await mostraImmagine(i.b);
    const note = nuove.filter(x => x.tipo === 'nota');
    if (note.length) {
      festa = festa.concat(note);
      paintW();
      armaPostille();
    }
  } finally {
    festeggiando = false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) spegniPostille();
  else controllaSorprese();
});
controllaSorprese();

/* I video rimasti in coda ripartono da soli: all'apertura e quando l'app
   torna davanti. */
document.addEventListener('visibilitychange', () => { if (!document.hidden) codaVideo(); });
setTimeout(codaVideo, 3000);
