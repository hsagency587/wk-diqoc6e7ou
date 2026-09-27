'use strict';

/* =========================================================================
   Workout — il piano degli allenamenti, tolto da G Work e messo in una app
   sua. Nessuna dipendenza. Parla solo con GitHub, dove tiene il file del
   piano, e con i siti dei video che si mettono nelle descrizioni.
   ========================================================================= */

/* Dove sta il file del piano. Il repository e' quello dell'app; il file vive
   su un branch suo, "scheda", cosi' ogni salvataggio non rifa' il sito. Se il
   branch non c'e' ancora, il primo Salva lo crea. */
const REPO        = 'hsagency587/wk-diqoc6e7ou';
const BRANCH      = 'scheda';
const FILE        = 'scheda.json';
const API         = 'https://api.github.com/repos/' + REPO;
const FILE_API    = API + '/contents/' + FILE;

/* La copia che comanda sta nel telefono: ogni tocco e' istantaneo e resta qui
   anche se non si salva. Salva la manda su GitHub in un commit solo. */
const STORE_KEY   = 'wk-store-v1';        /* { workout, schede, sha, known, dirty, stamp } */
const TOKEN_KEY   = 'wk-token-v1';
const CHIAVE_KEY  = 'wk-chiave-v1';
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
const ORDINALI = ['1st', '2nd', '3rd', '4th'];

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
      nomeVideoOk(Array.isArray(r) ? r[4] : '') ? r[4] : ''
    ]).filter(r => r[0] || r[1]);
    const rec = String(v.rec == null ? '' : v.rec).slice(0, 60).trim();
    if (es.length || rec) out[nome] = { es: es, rec: rec };
  }
  return out;
}

/* Il nome di un video: lettere e numeri a caso, e l'estensione. Lo sceglie
   l'app quando si carica il file, e non cambia piu'. */
const nomeVideoOk = v => typeof v === 'string' && /^[a-z0-9]{6,30}\.(mp4|webm|mov|m4v)$/.test(v);

/* Il contenuto del file, e basta: serve a capire se due versioni sono uguali. */
const contenuto = s => JSON.stringify({ workout: validWorkout(s.workout), schede: validSchede(s.schede),
                                         slot: validSlot(s.slot), mattina: validMattina(s.mattina) });

/* ------------------------------------------------------- lo stato ---- */

let tstore = readStore(STORE_KEY);
if (!Array.isArray(tstore.known)) tstore.known = [];
tstore.workout = validWorkout(tstore.workout);
tstore.schede  = validSchede(tstore.schede);
tstore.slot    = validSlot(tstore.slot);
tstore.mattina = validMattina(tstore.mattina);
tstore.dirty   = !!tstore.dirty;
/* i video scelti in questo telefono e non ancora arrivati su GitHub */
if (!Array.isArray(tstore.daCaricare)) tstore.daCaricare = [];

let token = '';
try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* niente token */ }
let chiave = '';
let chiaveKo = false;
try { chiave = localStorage.getItem(CHIAVE_KEY) || ''; } catch (e) { /* niente chiave */ }

/* mw: i campi del piano aperti; sch: la tendina WORKOUTS aperta;
   off: le schede spente con la loro pastiglia */
let mostra = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(VISTA_KEY) || 'null');
    if (v && typeof v === 'object')
      return { mw: !!v.mw, sch: v.sch !== false, off: (Array.isArray(v.off) ? v.off : []).map(String) };
  } catch (e) { /* si parte col piano da leggere */ }
  return { mw: false, sch: true, off: [] };
})();
function salvaMostra() {
  try { localStorage.setItem(VISTA_KEY, JSON.stringify(mostra)); } catch (e) {}
}
/* Chi ha il token scrive, chi non ce l'ha legge e basta. Cosi' la stessa app
   serve a due persone: chi tiene il piano lo scrive dal PC, chi si allena lo
   legge dal telefono, e gli arriva aggiornato. Senza token non si vede nessun
   bottone per scrivere: una modifica fatta li' non si potrebbe salvare, e
   bloccherebbe gli aggiornamenti che arrivano da GitHub. */
const scrive = () => !!token;
const modifica = () => scrive() && mostra.mw;

/* Ogni scrittura nel telefono lascia l'ora: se un'altra copia dell'app aperta
   ha scritto dopo, e' quella la buona. */
function saveLocal() {
  tstore.stamp = Date.now();
  writeStore(STORE_KEY, tstore);
}

function ripescaLocale() {
  const v = readStore(STORE_KEY);
  if (!(v.stamp > (tstore.stamp || 0))) return false;
  tstore = v;
  if (!Array.isArray(tstore.known)) tstore.known = [];
  tstore.workout = validWorkout(tstore.workout);
  tstore.schede  = validSchede(tstore.schede);
  tstore.slot    = validSlot(tstore.slot);
  tstore.mattina = validMattina(tstore.mattina);
  if (!Array.isArray(tstore.daCaricare)) tstore.daCaricare = [];
  return true;
}

function sincronizzaLocale() {
  if (!ripescaLocale()) return false;
  paintW();
  paintSalva();
  return true;
}

/* Ogni modifica passa di qui: si segna, e compare Salva. */
function touch() {
  tstore.dirty = true;
  saveLocal();
  paintSalva();
  paintSync();
}

/* ------------------------------------------------ il piano ---- */

const GIORNI  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const GIORNI2 = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/* Una riga di tabella: le celle in ordine, ognuna con le sue classi. */
function tabRiga(celle, cls) {
  const r = el('div', 'tabr' + (cls ? ' ' + cls : ''));
  for (const c of celle) {
    const d = el('div', 'tabc' + (c.cls ? ' ' + c.cls : ''), c.t);
    if (c.k) d.dataset.cella = c.k;
    r.appendChild(d);
  }
  return r;
}

function paintEdit() {
  const b = $('wMod');
  b.hidden = !scrive();
  b.textContent = modifica() ? 'done' : 'edit';
  b.classList.toggle('on', modifica());
}

$('wMod').addEventListener('click', () => {
  mostra.mw = !mostra.mw;
  salvaMostra();
  paintEdit();
  paintW();
});

/* Ridisegnare la pagina la rifa' da zero: la posizione dello scorrimento si
   segna prima e si rimette dopo, se no toccare una pastiglia in fondo
   riporterebbe su. */
function paintW() {
  const y = window.scrollY;
  disegnaW();
  window.scrollTo(0, y);
}

/* La fila delle pastiglie scorre di lato per conto suo: ridisegnandola resta
   dove l'aveva lasciata il dito. */
let chipX = 0;

/* Sette giorni, due caselle per giorno. Da leggere e' una tabella; con edit
   acceso diventa i campi per scriverla. Mai tutte e due insieme. */
function disegnaW() {
  const pagina = $('wlist');
  pagina.textContent = '';
  const oggi = today().getDay();
  /* Due colonne: a sinistra il piano e quello di oggi, a destra le schede. Sul
     telefono stanno una sotto l'altra, nello stesso ordine; dal PC, affiancate,
     si scrive una scheda guardando il piano. */
  const box = el('section', 'col col-sx');
  const dx = el('section', 'col col-dx');
  pagina.appendChild(box);
  pagina.appendChild(dx);
  if (!scrive()) { scheda = null; scelti = []; }

  if (!modifica()) {
    const n = tstore.slot;
    const tab = el('div', 'tab tab-w');
    /* le colonne sono quante i workout del giorno: la griglia la decide qui */
    tab.style.setProperty('--wcol', n);
    tab.appendChild(tabRiga([{ t: '' }].concat(ORDINALI.slice(0, n).map(t => ({ t: t }))), 'capo'));
    for (const g of [1, 2, 3, 4, 5, 6, 0]) {
      const r = tstore.workout[g] || [];
      const celle = [{ t: GIORNI2[g], cls: 'eti' }];
      for (let i = 0; i < n; i++) celle.push({ t: r[i] || '—', cls: r[i] ? '' : 'vuota' });
      tab.appendChild(tabRiga(celle, g === oggi ? 'oggi' : ''));
    }
    box.appendChild(tab);
    paintMorning(box);
    paintOggi(box);
    paintSchede(dx);
    return;
  }

  /* Quanti workout al giorno: meno e piu', da uno a quattro. Vale per tutti i
     giorni. Togliere una colonna non cancella quello che c'e' scritto dentro. */
  const n = tstore.slot;
  const cnt = el('div', 'wconta');
  cnt.appendChild(el('span', 'wconta-eti', 'Workouts per day'));
  const meno = el('button', 'schbtn wconta-btn', '\u2212');
  meno.type = 'button';
  meno.dataset.slotdir = '-1';
  meno.disabled = n <= 1;
  meno.setAttribute('aria-label', 'One workout less per day');
  const piu = el('button', 'schbtn wconta-btn', '+');
  piu.type = 'button';
  piu.dataset.slotdir = '1';
  piu.disabled = n >= MAX_SLOT;
  piu.setAttribute('aria-label', 'One workout more per day');
  cnt.appendChild(meno);
  cnt.appendChild(el('span', 'wconta-num', String(n)));
  cnt.appendChild(piu);
  box.appendChild(cnt);
  /* se in una colonna nascosta c'e' ancora del testo, lo si dice */
  const nascosti = [1, 2, 3, 4, 5, 6, 0].some(g => (tstore.workout[g] || []).slice(n).some(Boolean));
  if (nascosti) box.appendChild(el('p', 'nota wnota', 'The hidden columns keep what you wrote: add them back and it returns.'));

  /* Il piano e' generico: da lunedi' a domenica, sempre uguale. */
  for (const g of [1, 2, 3, 4, 5, 6, 0]) {
    /* un giorno per riquadro: sul PC il nome sta a sinistra e i campi in fila */
    const giorno = el('div', 'wday');
    giorno.style.setProperty('--wcol', n);
    giorno.appendChild(el('p', 'wgiorno' + (g === oggi ? ' oggi' : ''), GIORNI[g]));
    box.appendChild(giorno);
    for (let slot = 0; slot < n; slot++) {
      const row = el('div', 'wrow');
      row.appendChild(el('span', 'wslot', ORDINALI[slot]));
      const inp = el('input', 'wcampo');
      inp.type = 'text';
      inp.maxLength = 60;
      inp.dataset.g = g;
      inp.dataset.slot = slot;
      inp.value = (tstore.workout[g] || [])[slot] || '';
      inp.placeholder = 'What you do';
      row.appendChild(inp);
      giorno.appendChild(row);
    }
  }
  paintSchede(dx);
}

/* Gli allenamenti diversi scritti nel piano, nell'ordine in cui compaiono. */
function allenamenti() {
  const out = [];
  for (const g of [1, 2, 3, 4, 5, 6, 0]) {
    for (const v of (tstore.workout[g] || []).slice(0, tstore.slot)) {
      if (v && out.indexOf(v) < 0) out.push(v);
    }
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

/* Quale scheda si sta scrivendo, o null: una per volta. */
let scheda = null;

/* Una scheda da leggere: il nome nella riga grigia in alto, poi gli esercizi.
   In fondo alla testata ci va quello che passa `coda`: il bottone per
   modificarla. */
function tabScheda(nome, sc, coda) {
  const tab = el('div', 'tab tab-i');
  const cap = el('div', 'tabr capo schcapo');
  cap.appendChild(el('div', 'tabc', nome));
  /* una quantita' scritta senza esercizio sta nella banda del nome */
  const sole = (sc.es || []).filter(r => !r[0] && r[1]).map(r => r[1]);
  if (sole.length) cap.appendChild(el('div', 'tabc val', sole.join('  ·  ')));
  if (coda) {
    const cb = el('div', 'tabc tabbtn');
    cb.appendChild(coda);
    cap.appendChild(cb);
  }
  tab.appendChild(cap);
  return tab;
}

/* Le righe di una scheda: gli esercizi, e il recupero in fondo a destra. Con
   `dx` il recupero esiste solo se e' scritto. */
function righeScheda(tab, sc, dx, nome) {
  const pila = new Pila(tab);
  sc.es.forEach((r, i) => {
    if (!r[0] && r[1]) return;
    const dove = pila.vai(r[2] || []);
    const riga = r[1]
      ? tabRiga([{ t: r[0] || '—', cls: r[0] ? 'eti' : 'eti vuota' },
                 { t: r[1], cls: 'val' }])
      : tabRiga([{ t: r[0], cls: 'eti' }], 'solo');
    /* con una descrizione dentro, la riga si tocca e si apre. La freccia dice
       che sotto c'e' qualcosa da leggere; il triangolo che c'e' un video. */
    if ((r[3] || r[4]) && nome) {
      riga.classList.add('condesc');
      riga.dataset.desces = nome + '|' + i;
      riga.lastChild.appendChild(el('span', 'desfrec', r[4] || haVideo(r[3]) ? '▶' : '▾'));
    }
    dove.appendChild(riga);
  });
  if (sc.rec || !dx) {
    const r = el('div', 'tabr recgiu');
    const c = el('div', 'tabc');
    c.appendChild(el('span', 'receti', 'Recovery'));
    c.appendChild(el('span', 'recval' + (sc.rec ? '' : ' vuota'), sc.rec || '—'));
    r.appendChild(c);
    tab.appendChild(r);
  } else if (!sc.es.length) {
    tab.appendChild(tabRiga([{ t: '—', cls: 'vuota' }, { t: '' }]));
  }
  return tab;
}

/* Le scatole dei gruppi aperte mentre si scorre le righe di una scheda. Ogni
   riga dice la sua via: quello che e' in comune con la riga prima resta
   aperto, il resto si chiude e si riapre. In modifica la targhetta e' un
   bottone che apre il pannello dei gruppi su quel gruppo. */
function Pila(radice, modifica) {
  this.via = [];
  this.dove = [radice];
  this.modifica = !!modifica;
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
  if (primo) {
    const testo = g.slice(n).join(' › ');
    const t = el(this.modifica ? 'button' : 'span', 'grpeti', testo);
    if (this.modifica) {
      t.type = 'button';
      t.dataset.gvia = JSON.stringify(g);
      t.setAttribute('aria-label', 'Edit group ' + testo);
    }
    primo.appendChild(t);
  }
  return this.dove[this.dove.length - 1];
};

/* I campi di una scheda aperta, dentro un riquadro col bordo verde. */
function campiScheda(nome, sc, tab, senzaRec) {
  const voci = { es: 'exercise', qta: 'how much', piu: '+  Add an exercise' };
  const cassa = el('div', 'schapri');
  /* lo spazio a destra per le barre dei gruppi: lo lasciano tutte le righe */
  const prof = sc.es.reduce((m, r) => Math.max(m, (r[2] || []).length), 0);
  cassa.style.setProperty('--gres', (prof ? prof * 5 + 2 : 0) + 'px');
  cassa.appendChild(tab);

  /* la scheda del mattino si rinomina qui, al posto del recupero */
  if (nome === MORNING) {
    const nrow = el('div', 'wrow wrec');
    nrow.appendChild(el('span', 'wslot', 'Name'));
    const nin = el('input', 'wcampo');
    nin.type = 'text';
    nin.maxLength = 40;
    nin.dataset.mattina = '1';
    nin.value = tstore.mattina || '';
    nin.placeholder = MATTINA_BASE;
    nin.setAttribute('aria-label', 'Name of this list');
    nrow.appendChild(nin);
    cassa.appendChild(nrow);
  }

  if (!senzaRec) {
    const rrow = el('div', 'wrow wrec');
    rrow.appendChild(el('span', 'wslot', 'Rec.'));
    const rin = el('input', 'wcampo');
    rin.type = 'text';
    rin.maxLength = 60;
    rin.dataset.rec = nome;
    rin.value = sc.rec || '';
    rin.placeholder = 'recovery';
    rrow.appendChild(rin);
    cassa.appendChild(rrow);
  }

  const pila = new Pila(cassa, true);
  for (let i = 0; i < sc.es.length; i++) {
    const dove = pila.vai(sc.es[i][2] || []);
    const row = el('div', 'wrow');
    const sel = el('input', 'schsel');
    sel.type = 'checkbox';
    sel.checked = scelti.indexOf(i) >= 0;
    sel.dataset.sel = i;
    sel.setAttribute('aria-label', 'Pick this exercise');
    row.appendChild(sel);
    for (const j of [0, 1]) {
      const inp = el('input', 'wcampo');
      inp.type = 'text';
      inp.maxLength = 60;
      inp.dataset.sch = nome;
      inp.dataset.riga = i;
      inp.dataset.col = j;
      inp.value = sc.es[i][j] || '';
      inp.placeholder = j === 0 ? voci.es : voci.qta;
      row.appendChild(inp);
    }
    /* il bottone della descrizione: acceso quando la descrizione c'e' gia' */
    const d = sc.es[i][3], vd = sc.es[i][4];
    const dsc = el('button', 'schbtn schdesc' + (d || vd ? ' piena' : ''), vd || haVideo(d) ? '▶' : '▾');
    dsc.type = 'button';
    dsc.dataset.desmod = nome + '|' + i;
    dsc.setAttribute('aria-label', 'Description of this exercise');
    row.appendChild(dsc);
    const x = el('button', 'schx', '×');
    x.type = 'button';
    x.dataset.togli = nome;
    x.dataset.riga = i;
    x.setAttribute('aria-label', 'Remove this exercise');
    row.appendChild(x);
    dove.appendChild(row);
  }
  if (scelti.length) {
    const row = el('div', 'wrow wgrp');
    const b = el('button', 'schbtn', 'group');
    b.type = 'button';
    b.dataset.raggruppa = nome;
    row.appendChild(b);
    if (scelti.some(i => ((sc.es[i] || [])[2] || []).length)) {
      const u = el('button', 'schbtn', 'ungroup');
      u.type = 'button';
      u.dataset.sgruppa = nome;
      row.appendChild(u);
    }
    for (const f of [['su', '↑'], ['giu', '↓']]) {
      const m = el('button', 'schbtn schfrec', f[1]);
      m.type = 'button';
      m.dataset[f[0]] = nome;
      m.setAttribute('aria-label', f[0] === 'su' ? 'Move up' : 'Move down');
      row.appendChild(m);
    }
    cassa.appendChild(row);
  }
  const piu = el('button', 'lpiu', voci.piu);
  piu.type = 'button';
  piu.dataset.piues = nome;
  cassa.appendChild(piu);
  const pg = el('button', 'lpiu', 'Groups');
  pg.type = 'button';
  pg.dataset.piugrp = nome;
  cassa.appendChild(pg);
  return cassa;
}

/* Le righe scelte dentro la scheda aperta. Si svuotano appena la scheda cambia
   o le righe si spostano. */
let scelti = [];

function sgruppa(nome) {
  const sc = tstore.schede[nome];
  if (!sc || !scelti.length) return;
  const dentro = scelti.slice().sort((a, b) => a - b).filter(i => sc.es[i]);
  if (!dentro.length) { scelti = []; return paintW(); }
  const prese = dentro.map(i => sc.es[i]);
  for (const r of prese) r[2] = (r[2] || []).slice(0, -1);
  const resto = sc.es.filter((r, i) => dentro.indexOf(i) < 0);
  const posto = sc.es.slice(0, dentro[0]).filter((r, i) => dentro.indexOf(i) < 0).length;
  sc.es = resto.slice(0, posto).concat(prese, resto.slice(posto));
  scelti = [];
  touch();
  paintW();
}

/* Le righe scelte salgono o scendono di un posto. La riga scavalcata dice
   anche in quale gruppo si finisce. */
function spostaScelti(nome, dir) {
  const sc = tstore.schede[nome];
  if (!sc || !scelti.length) return;
  const idx = scelti.slice().sort((a, b) => a - b).filter(i => sc.es[i]);
  if (!idx.length) return;
  const vicino = dir < 0 ? idx[0] - 1 : idx[idx.length - 1] + 1;
  if (vicino < 0 || vicino >= sc.es.length || idx.indexOf(vicino) >= 0) return;
  const blocco = idx.map(i => sc.es[i]);
  const scavalcata = sc.es[vicino];
  for (const r of blocco) r[2] = (scavalcata[2] || []).slice();
  const resto = sc.es.filter((r, i) => idx.indexOf(i) < 0);
  const posto = resto.indexOf(scavalcata) + (dir < 0 ? 0 : 1);
  sc.es = resto.slice(0, posto).concat(blocco, resto.slice(posto));
  scelti = blocco.map(r => sc.es.indexOf(r));
  touch();
  paintW();
}

/* L'attivita' del mattino ha una scheda sua, che non viene dal piano: niente
   recupero. Nel file sta sotto una chiave fissa, che non cambia mai; il nome
   che si legge sta a parte e si riscrive quando si vuole. */
const MORNING = '__morning';
/* il nome da mostrare di una scheda: quello della mattina e' scritto a parte */
const nomeVisto = nome => nome === MORNING ? nomeMattina() : nome;

function paintMorning(box) {
  const sc = tstore.schede[MORNING] || { es: [], rec: '' };
  const aperta = scheda === MORNING;
  /* chi legge e basta non vede la mattina vuota: non avrebbe niente da farci */
  if (!scrive() && !sc.es.length) return;
  const b = scrive() ? el('button', 'schbtn', aperta ? 'done' : 'edit') : null;
  if (b) { b.type = 'button'; b.dataset.scheda = MORNING; }
  const tab = tabScheda(nomeMattina(), sc, b);
  box.appendChild(aperta ? campiScheda(MORNING, sc, tab, true)
                         : righeScheda(tab, { es: sc.es, rec: '' }, true, MORNING));
}

/* Quello che si fa oggi, senza aprire niente: le due schede del giorno, solo
   se hanno degli esercizi scritti. */
function paintOggi(box) {
  const r = tstore.workout[today().getDay()] || [];
  let capo = false;
  for (let slot = 0; slot < tstore.slot; slot++) {
    const nome = r[slot];
    if (!nome) continue;
    const sc = tstore.schede[nome];
    if (!sc || (!sc.es.length && !sc.rec)) continue;
    if (!capo) { box.appendChild(el('p', 'grp', 'TODAY WORKOUTS')); capo = true; }
    const t = tabScheda(nome, sc, null);
    t.classList.add('tab-oggi');
    box.appendChild(righeScheda(t, sc, true, nome));
  }
}

/* Le schede, sotto la tabella del piano. Chiuse si leggono come tabelle; con il
   loro bottone si aprono i campi. */
function paintSchede(box) {
  const apri = el('button', 'grp grpcli grproot' + (mostra.sch ? ' open' : ''));
  apri.type = 'button';
  apri.dataset.schroot = '1';
  apri.setAttribute('aria-expanded', mostra.sch ? 'true' : 'false');
  apri.appendChild(el('span', 'grpfrec', mostra.sch ? '▾' : '▸'));
  apri.appendChild(el('span', 'grpnome', 'WORKOUTS'));
  box.appendChild(apri);
  if (!mostra.sch) return;

  /* chi legge e basta vede solo le schede con qualcosa dentro */
  const nomi = allenamenti().filter(n => scrive() || (tstore.schede[n] && (tstore.schede[n].es.length || tstore.schede[n].rec)));
  if (!nomi.length) {
    box.appendChild(el('p', 'vuoto', scrive() ? 'Nothing in the plan yet: tap edit and write what you do each day.'
                                              : 'Nothing in the plan yet.'));
    return;
  }

  const riga = el('div', 'chiprow');
  const sx = el('button', 'chipfrec', '‹');
  sx.type = 'button'; sx.dataset.chipscorri = '-1';
  sx.setAttribute('aria-label', 'Scroll the workouts left');
  const chips = el('div', 'chips chipsch');
  for (const nome of nomi) {
    const acceso = mostra.off.indexOf(nome) < 0;
    const c = el('button', 'chip chipw' + (acceso ? ' sel' : ''), nome);
    c.type = 'button';
    c.dataset.chipsch = nome;
    c.setAttribute('aria-pressed', acceso ? 'true' : 'false');
    chips.appendChild(c);
  }
  const dx = el('button', 'chipfrec', '›');
  dx.type = 'button'; dx.dataset.chipscorri = '1';
  dx.setAttribute('aria-label', 'Scroll the workouts right');
  riga.appendChild(sx); riga.appendChild(chips); riga.appendChild(dx);
  box.appendChild(riga);
  chips.scrollLeft = chipX;
  chips.addEventListener('scroll', () => {
    chipX = chips.scrollLeft;
    frecceChip(riga);
  }, { passive: true });
  requestAnimationFrame(() => frecceChip(riga));

  const visti = nomi.filter(x => mostra.off.indexOf(x) < 0);
  if (!visti.length) {
    box.appendChild(el('p', 'vuoto', 'No workout chosen'));
    return;
  }

  /* le schede stanno in un contenitore loro: sul PC largo si mettono in due
     colonne */
  const lista = el('div', 'schlista');
  box.appendChild(lista);
  for (const nome of visti) {
    const sc = tstore.schede[nome] || { es: [], rec: '' };
    const apertaSc = scheda === nome;
    const b = scrive() ? el('button', 'schbtn', apertaSc ? 'done' : 'edit') : null;
    if (b) { b.type = 'button'; b.dataset.scheda = nome; }
    const tab = tabScheda(nome, sc, b);
    lista.appendChild(apertaSc ? campiScheda(nome, sc, tab) : righeScheda(tab, sc, false, nome));
  }
}

/* Si scrive quando si esce dalla casella: cosi' non si segna il file da
   salvare a ogni lettera battuta. */
$('wlist').addEventListener('change', ev => {
  const i = ev.target.closest('input.wcampo');
  if (!i) return;
  if (i.dataset.mattina) {
    const v = validMattina(i.value);
    if (v === MATTINA_BASE ? !tstore.mattina : v === tstore.mattina) return;
    if (v && v !== MATTINA_BASE) tstore.mattina = v; else delete tstore.mattina;
    touch();
    /* si cambia solo la scritta in testata: ridisegnare adesso si mangerebbe il
       tocco che ha fatto uscire dal campo */
    const cap = i.closest('.schapri').querySelector('.schcapo .tabc');
    if (cap) cap.textContent = nomeMattina();
    return;
  }
  if (i.dataset.sch || i.dataset.rec) {
    const n = i.dataset.sch || i.dataset.rec;
    const sc = tstore.schede[n] || { es: [], rec: '' };
    const v = i.value.slice(0, 60).trim();
    if (i.dataset.rec) { if (sc.rec === v) return; sc.rec = v; }
    else {
      const r = +i.dataset.riga, c = +i.dataset.col;
      if (!sc.es[r]) sc.es[r] = ['', '', [], ''];
      if (sc.es[r][c] === v) return;
      sc.es[r][c] = v;
    }
    if (sc.es.some(x => x[0] || x[1]) || sc.rec) tstore.schede[n] = sc;
    else delete tstore.schede[n];
    touch();
    return;
  }
  if (i.dataset.g == null) return;
  const g = +i.dataset.g, slot = +i.dataset.slot;
  const r = (tstore.workout[g] || []).slice();
  while (r.length <= slot) r.push('');
  const v = i.value.slice(0, 60).trim();
  if (r[slot] === v) return;
  r[slot] = v;
  while (r.length && !r[r.length - 1]) r.pop();
  if (r.length) tstore.workout[g] = r; else delete tstore.workout[g];
  touch();
});

/* ------------------------------------------- descrizione di un esercizio --- */

/* Si apre a tutto schermo, col testo grande: si legge mentre si fa
   l'esercizio. Dalla scheda aperta la stessa finestra si scrive. */
const dlgDesc = $('descrizione');
let desc = null;                  /* { nome, riga } mentre si scrive, o null */

/* Un link scritto da solo su una riga: e' un video. */
const RIGA_LINK = /^\s*(https?:\/\/\S+)\s*$/i;
const haVideo = txt => String(txt || '').split('\n').some(r => RIGA_LINK.test(r));

/* Da un link al modo di mostrarlo. YouTube, Vimeo e Google Drive hanno un
   lettore da incorporare; un file video diretto si suona da solo; tutto il
   resto (Instagram, TikTok...) diventa un bottone che apre il link. */
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
             src: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1' + (inizio ? '&start=' + inizio : '') };
  }
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)/);
    if (m) return { tipo: 'frame', src: 'https://player.vimeo.com/video/' + m[1] };
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
  const a = el('a', 'deslink', '▶  Open the video');
  a.href = v.src;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/* Il testo della descrizione, riga per riga. Una riga che comincia con un
   trattino, un asterisco o un numero e' una voce di elenco. Un link da solo
   su una riga e' un video. */
function testoDesc(box, txt) {
  box.textContent = '';
  for (const riga of String(txt || '').split('\n')) {
    const lk = riga.match(RIGA_LINK);
    if (lk) { box.appendChild(videoNodo(lk[1])); continue; }
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

function apriDesc(nome, i, scrivibile) {
  const sc = tstore.schede[nome];
  const r = sc && sc.es[i];
  if (!r) return;
  $('descTit').textContent = r[0] || nomeVisto(nome);
  testoDesc($('descTesto'), r[3]);
  $('descTesto').hidden = !!scrivibile;
  $('descCampo').hidden = !scrivibile;
  $('descVideo').hidden = !scrivibile;
  $('descCampo').value = r[3] || '';
  $('descLink').value = '';
  $('descOk').hidden = !scrivibile;
  desc = scrivibile ? { nome: nome, riga: i, video: r[4] || '' } : null;
  dlgDesc.showModal();
  dlgDesc.focus();                /* niente tastiera addosso appena si apre */
  mostraVideo(r[4] || '', !!scrivibile);
}

/* Chiudendo, i video si fermano: la finestra si svuota. */
function chiudiDesc() {
  desc = null;
  pulisciVideo();
  dlgDesc.close();
  $('descTesto').textContent = '';
}

$('descChiudi').addEventListener('click', chiudiDesc);
dlgDesc.addEventListener('cancel', () => { desc = null; pulisciVideo(); $('descTesto').textContent = ''; });

/* Il link incollato va in fondo al testo, su una riga sua. */
$('descLinkOk').addEventListener('click', () => {
  const v = $('descLink').value.trim();
  if (!/^https?:\/\/\S+$/i.test(v)) { $('descLink').focus(); return; }
  const c = $('descCampo');
  const t = c.value.replace(/\s+$/, '');
  c.value = (t ? t + '\n' : '') + v + '\n';
  $('descLink').value = '';
});

$('descOk').addEventListener('click', () => {
  if (desc) {
    /* un link rimasto nel campo senza premere "+ link" non si perde */
    const pend = $('descLink').value.trim();
    if (/^https?:\/\/\S+$/i.test(pend)) $('descLinkOk').click();
    const sc = tstore.schede[desc.nome];
    const r = sc && sc.es[desc.riga];
    if (r) {
      const v = $('descCampo').value.slice(0, 4000).trim();
      let cambiato = false;
      if ((r[3] || '') !== v) { r[3] = v; cambiato = true; }
      /* il video: il file e' gia' nel telefono; al prossimo Save parte per GitHub */
      if ((r[4] || '') !== desc.video) {
        r[4] = desc.video;
        if (desc.video && tstore.daCaricare.indexOf(desc.video) < 0) tstore.daCaricare.push(desc.video);
        cambiato = true;
      }
      if (cambiato) touch();
    }
  }
  chiudiDesc();
  paintW();
});

/* ------------------------------------------------------ i video ---- */

/* Un esercizio ha un video suo, che sta in cima alla descrizione. Il file si
   sceglie dal telefono o dal PC, resta subito in questo dispositivo e al Save
   parte per GitHub, nella cartella video/ del branch del piano. Gli altri
   telefoni lo scaricano appena leggono il piano e lo tengono per sempre: in
   palestra si guarda anche senza rete. Non si cancella mai niente, ne' qui ne'
   su GitHub: i video sono pochi. */

/* Oltre questa misura GitHub rischia di rifiutare il file. */
const VIDEO_MAX = 45 * 1024 * 1024;
const RAW_VIDEO = 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/video/';
const tipoVideo = n => /\.webm$/.test(n) ? 'video/webm' : 'video/mp4';

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
async function vPut(n, blob) {
  const d = await apriDb();
  await new Promise((ok, ko) => {
    const t = d.transaction('v', 'readwrite');
    t.objectStore('v').put(blob, n);
    t.oncomplete = ok;
    t.onerror = () => ko(t.error);
  });
}

/* Con la Data key anche i video partono chiusi: davanti al pacchetto c'e' una
   firma, cosi' chi lo apre sa che va decifrato. */
const FIRMA = new TextEncoder().encode('WKENC1');
async function cifraByte(buf) {
  const u = new Uint8Array(buf);
  if (!chiave) return u;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const k    = await derivaChiave(chiave, salt);
  const ct   = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, u));
  const out  = new Uint8Array(FIRMA.length + 28 + ct.length);
  out.set(FIRMA, 0); out.set(salt, 6); out.set(iv, 22); out.set(ct, 34);
  return out;
}
async function decifraByte(buf) {
  const u = new Uint8Array(buf);
  if (u.length < 34 || !FIRMA.every((b, i) => u[i] === b)) return u;
  if (!chiave) throw new Error('key missing');
  const k = await derivaChiave(chiave, u.slice(6, 22));
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
async function caricaVideo(nome) {
  try {
    const blob = await vGet(nome);
    if (!blob) return true;                   /* sparito dal telefono: niente da mandare */
    const b64 = await b64Blob(new Blob([await cifraByte(await blob.arrayBuffer())]));
    const H = Object.assign({ 'Content-Type': 'application/json' }, ghHeaders());
    const leggiRef = () => fetch(API + '/git/ref/heads/' + BRANCH, { headers: ghHeaders(), cache: 'no-store' });
    let ref = await leggiRef();
    if (ref.status === 404) {
      if (!(await creaBranch())) return false;
      ref = await leggiRef();
    }
    if (!ref.ok) return false;
    const base = (await ref.json()).object.sha;
    const c0 = await fetch(API + '/git/commits/' + base, { headers: ghHeaders(), cache: 'no-store' });
    if (!c0.ok) return false;
    const albero0 = (await c0.json()).tree.sha;
    const bl = await fetch(API + '/git/blobs', { method: 'POST', headers: H,
      body: JSON.stringify({ content: b64, encoding: 'base64' }) });
    if (!bl.ok) return false;
    const tr = await fetch(API + '/git/trees', { method: 'POST', headers: H,
      body: JSON.stringify({ base_tree: albero0,
        tree: [{ path: 'video/' + nome, mode: '100644', type: 'blob', sha: (await bl.json()).sha }] }) });
    if (!tr.ok) return false;
    const cm = await fetch(API + '/git/commits', { method: 'POST', headers: H,
      body: JSON.stringify({ message: 'video: ' + nome, tree: (await tr.json()).sha, parents: [base] }) });
    if (!cm.ok) return false;
    const up = await fetch(API + '/git/refs/heads/' + BRANCH, { method: 'PATCH', headers: H,
      body: JSON.stringify({ sha: (await cm.json()).sha }) });
    return up.ok;
  } catch (e) {
    return false;
  }
}

/* Un video da GitHub al telefono. Torna il file, o null. */
async function prendiVideo(nome) {
  try {
    const r = await fetch(RAW_VIDEO + nome, { cache: 'no-store' });
    if (!r.ok) return null;
    const u = await decifraByte(await r.arrayBuffer());
    const blob = new Blob([u], { type: tipoVideo(nome) });
    await vPut(nome, blob);
    return blob;
  } catch (e) {
    return null;
  }
}

/* Tutti i video del piano che il telefono non ha ancora: si scaricano uno alla
   volta, in silenzio, appena il piano e' letto. */
let scaricando = false;
async function scaricaVideo() {
  if (scaricando) return;
  scaricando = true;
  try {
    const nomi = [];
    for (const k of Object.keys(tstore.schede)) {
      for (const r of tstore.schede[k].es) if (r[4] && nomi.indexOf(r[4]) < 0) nomi.push(r[4]);
    }
    for (const n of nomi) if (!(await vGet(n))) await prendiVideo(n);
  } finally {
    scaricando = false;
  }
}

/* Lo slot del video, in cima alla descrizione. Sempre orizzontale; un video
   verticale ci sta dentro intero, con le bande ai lati. */
let vURL = null;
let vMostrato = '';

function pulisciVideo() {
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
  $('vEdit').hidden = !scrivibile;
  $('vTogli').hidden = !nome;
  $('vScegli').textContent = nome ? 'change video' : '+ video';
  /* chi legge non vede uno slot vuoto; chi scrive si', per riempirlo */
  slot.hidden = !nome && !scrivibile;
  v.hidden = true;
  $('vFull').hidden = true;
  if (!nome) { st.textContent = 'No video'; return; }
  st.textContent = 'Loading video…';
  let blob = await vGet(nome);
  if (!blob && vMostrato === nome) {
    st.textContent = 'Downloading video…';
    blob = await prendiVideo(nome);
  }
  if (vMostrato !== nome) return;            /* nel frattempo si e' chiuso o cambiato */
  if (!blob) {
    st.textContent = navigator.onLine ? 'Video not online yet: try again in a few minutes'
                                      : 'Video not on this phone yet: it needs the internet once';
    return;
  }
  vURL = URL.createObjectURL(blob);
  v.src = vURL;
  v.hidden = false;
  $('vFull').hidden = false;
  st.textContent = '';
}

/* Verticale o orizzontale lo dice il video stesso, appena si apre. */
$('vVideo').addEventListener('loadedmetadata', () => {
  const v = $('vVideo');
  $('vSlot').classList.toggle('verticale', v.videoHeight > v.videoWidth);
  ruota();
});

/* Il bottone a schermo intero. Un video orizzontale gira anche il telefono,
   dove il browser lo permette; uno verticale resta dritto e riempie lo schermo. */
$('vFull').addEventListener('click', async () => {
  const slot = $('vSlot'), v = $('vVideo');
  try {
    if (slot.requestFullscreen) await slot.requestFullscreen();
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  } catch (e) {
    try { if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); } catch (e2) { /* niente */ }
  }
  if (!slot.classList.contains('verticale') && screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
});

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

/* Scegliere un video: il file resta subito nel telefono, e lo slot lo mostra.
   Nel piano entra con Confirm. */
$('vFile').addEventListener('change', async ev => {
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!f || !desc) return;
  if (f.size > VIDEO_MAX) {
    $('vSlot').hidden = false;
    $('vStato').textContent = 'Video too big: ' + Math.round(f.size / 1048576) + ' MB, the limit is 45 MB. Record a shorter clip, or at 720p.';
    return;
  }
  const est = (f.name.match(/\.(mp4|webm|mov|m4v)$/i) || [0, 'mp4'])[1].toLowerCase();
  const nome = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + est;
  try {
    await vPut(nome, new Blob([f], { type: tipoVideo(nome) }));
  } catch (e) {
    $('vStato').textContent = 'This phone has no room for the video.';
    return;
  }
  desc.video = nome;
  mostraVideo(nome, true);
});
$('vScegli').addEventListener('click', () => $('vFile').click());

/* Togliere il video dall'esercizio: il file resta, nel telefono e su GitHub. */
$('vTogli').addEventListener('click', () => {
  if (!desc) return;
  desc.video = '';
  mostraVideo('', true);
});

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
let grp = null;                   /* { scheda, via } */

function apriGruppi(nome, via) {
  if (!tstore.schede[nome]) tstore.schede[nome] = { es: [], rec: '' };
  grp = { scheda: nome, via: via ? viaGruppi(via) : null };
  disegnaGruppi();
  dlgGrp.showModal();
  dlgGrp.focus();
}

function disegnaGruppi() {
  if (!grp) return;
  const sc = tstore.schede[grp.scheda] || { es: [] };
  const vie = gruppiDi(sc);
  if (grp.via && !vie.some(v => stessaVia(v, grp.via))) vie.push(grp.via);

  const chips = $('gElenco');
  chips.textContent = '';
  for (const v of vie) {
    const c = el('button', 'chip chipw' + (grp.via && stessaVia(v, grp.via) ? ' sel' : ''),
                 v.join(' › ') || '(no name)');
    c.type = 'button';
    c.dataset.gapri = JSON.stringify(v);
    chips.appendChild(c);
  }
  const piu = el('button', 'chip chipw chipnuovo', '+ new');
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
  const nessuno = el('option', null, 'top level');
  nessuno.value = '';
  sel.appendChild(nessuno);
  for (const v of vie) {
    if (dentroVia(v, via)) continue;
    if (v.length >= 4) continue;
    const o = el('option', null, 'in ' + v.join(' › '));
    o.value = JSON.stringify(v);
    sel.appendChild(o);
  }
  const padre = via.slice(0, -1);
  sel.value = padre.length ? JSON.stringify(padre) : '';

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
  if (!lista.children.length) lista.appendChild(el('p', 'vuoto', 'Nothing written yet'));
  $('gNuovoEs').value = '';
  $('gNuovoQ').value = '';
  $('gElimina').textContent = 'Delete this group';
}

$('gElenco').addEventListener('click', ev => {
  if (!grp) return;
  const a = ev.target.closest('button[data-gapri]');
  if (a) { grp.via = viaGruppi(JSON.parse(a.dataset.gapri)); disegnaGruppi(); return; }
  if (ev.target.closest('button[data-gnuovo]')) {
    grp.via = [''];
    disegnaGruppi();
    $('gNome').focus();
  }
});

$('gNome').addEventListener('change', () => {
  if (!grp || !grp.via) return;
  const sc = tstore.schede[grp.scheda];
  const v = $('gNome').value.slice(0, 40).trim();
  const via = grp.via, d = via.length - 1;
  if (v === via[d]) return;
  if (!v) { $('gNome').value = via[d]; return; }
  for (const r of sc.es) {
    const g = r[2] || [];
    if (dentroVia(g, via)) g[d] = v;
  }
  grp.via = via.slice(0, d).concat([v]);
  touch();
  disegnaGruppi();
  paintW();
});

$('gDentro').addEventListener('change', () => {
  if (!grp || !grp.via) return;
  const sc = tstore.schede[grp.scheda];
  const via = grp.via;
  const padre = $('gDentro').value ? viaGruppi(JSON.parse($('gDentro').value)) : [];
  const nuova = padre.concat([via[via.length - 1]]).slice(0, 4);
  const righe = [];
  sc.es.forEach((r, i) => { if (dentroVia(r[2] || [], via)) righe.push(i); });
  for (const i of righe) sc.es[i][2] = nuova.concat((sc.es[i][2] || []).slice(via.length)).slice(0, 4);
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
  paintW();
});

$('gLista').addEventListener('change', ev => {
  const c = ev.target.closest('input[data-gsel]');
  if (!c || !grp || !grp.via) return;
  const sc = tstore.schede[grp.scheda];
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
  paintW();
});

$('gNuovoOk').addEventListener('click', () => {
  if (!grp || !grp.via) return;
  const sc = tstore.schede[grp.scheda];
  const via = grp.via;
  const a = $('gNuovoEs').value.slice(0, 60).trim();
  const b = $('gNuovoQ').value.slice(0, 60).trim();
  if (!a && !b) { $('gNuovoEs').focus(); return; }
  if (!via[via.length - 1]) { $('gNome').focus(); return; }
  sc.es = sc.es.concat([[a, b, via.slice(), '']]);
  accoda(sc, sc.es.length - 1, via);
  touch();
  disegnaGruppi();
  paintW();
  $('gNuovoEs').focus();
});

/* due tocchi per sciogliere il gruppo: le righe restano */
$('gElimina').addEventListener('click', () => {
  if (!grp || !grp.via) return;
  const b = $('gElimina');
  if (b.textContent !== 'Sure?') { b.textContent = 'Sure?'; return; }
  const sc = tstore.schede[grp.scheda];
  const via = grp.via, d = via.length - 1;
  for (const r of sc.es) {
    const g = r[2] || [];
    if (dentroVia(g, via)) g.splice(d, 1);
  }
  grp.via = null;
  touch();
  disegnaGruppi();
  paintW();
});

$('gruppoForm').addEventListener('submit', () => {
  /* un gruppo creato e mai riempito non lascia una scheda vuota */
  if (grp && tstore.schede[grp.scheda] && !tstore.schede[grp.scheda].es.length && !tstore.schede[grp.scheda].rec) {
    delete tstore.schede[grp.scheda];
  }
  grp = null; scelti = []; paintW();
});
dlgGrp.addEventListener('cancel', () => { grp = null; });

/* ------------------------------------------------- i tocchi sulla pagina ---- */

$('wlist').addEventListener('click', ev => {
  const sd = ev.target.closest('button[data-slotdir]');
  if (sd) {
    const n = validSlot(tstore.slot + +sd.dataset.slotdir);
    if (n === tstore.slot) return;
    tstore.slot = n;
    touch();
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
    const i = mostra.off.indexOf(n);
    if (i < 0) { mostra.off = mostra.off.concat([n]); if (scheda === n) { scheda = null; scelti = []; } }
    else mostra.off = mostra.off.filter(x => x !== n);
    salvaMostra();
    paintW();
    return;
  }
  const sb = ev.target.closest('button[data-scheda]');
  if (sb) {
    scheda = scheda === sb.dataset.scheda ? null : sb.dataset.scheda;
    scelti = [];
    paintW();
    return;
  }
  const cs = ev.target.closest('input[data-sel]');
  if (cs) {
    const i = +cs.dataset.sel;
    scelti = scelti.indexOf(i) < 0 ? scelti.concat([i]) : scelti.filter(v => v !== i);
    paintW();
    return;
  }
  const rg = ev.target.closest('button[data-raggruppa]');
  if (rg) { apriGruppi(rg.dataset.raggruppa, null); return; }
  const sg = ev.target.closest('button[data-sgruppa]');
  if (sg) { sgruppa(sg.dataset.sgruppa); return; }
  const dm = ev.target.closest('button[data-desmod]');
  if (dm) {
    const q = dm.dataset.desmod.split('|');
    /* un esercizio appena aggiunto e ancora vuoto non ha dove tenere il testo */
    const sc = tstore.schede[q[0]];
    if (!sc || !sc.es[+q[1]] || (!sc.es[+q[1]][0] && !sc.es[+q[1]][1])) {
      const inp = dm.parentElement.querySelector('input.wcampo');
      if (inp) inp.focus();
      return;
    }
    apriDesc(q[0], +q[1], true);
    return;
  }
  const dl = ev.target.closest('.tabr[data-desces]');
  if (dl) {
    const q = dl.dataset.desces.split('|');
    apriDesc(q[0], +q[1], false);
    return;
  }
  const su = ev.target.closest('button[data-su]');
  if (su) { spostaScelti(su.dataset.su, -1); return; }
  const giu = ev.target.closest('button[data-giu]');
  if (giu) { spostaScelti(giu.dataset.giu, 1); return; }
  const pgr = ev.target.closest('button[data-piugrp]');
  if (pgr) { apriGruppi(pgr.dataset.piugrp, null); return; }
  const tgv = ev.target.closest('button[data-gvia]');
  if (tgv && scheda) { apriGruppi(scheda, JSON.parse(tgv.dataset.gvia)); return; }
  const pe = ev.target.closest('button[data-piues]');
  if (pe) {
    const n = pe.dataset.piues;
    const sc = tstore.schede[n] || { es: [], rec: '' };
    sc.es = sc.es.concat([['', '', [], '']]);
    tstore.schede[n] = sc;
    paintW();
    /* il cursore va subito nel campo nuovo */
    const campi = $('wlist').querySelectorAll('input[data-sch="' + CSS.escape(n) + '"][data-col="0"]');
    if (campi.length) campi[campi.length - 1].focus();
    return;
  }
  const tg = ev.target.closest('button[data-togli]');
  if (tg) {
    const n = tg.dataset.togli, i = +tg.dataset.riga;
    const sc = tstore.schede[n];
    if (sc) {
      sc.es = sc.es.filter((r, j) => j !== i);
      scelti = [];
      if (!sc.es.length && !sc.rec) delete tstore.schede[n];
      touch();
      paintW();
    }
    return;
  }
});

/* ------------------------------------------------------ impostazioni ---- */

const dlgImp = $('impostazioni');

function openImpostazioni() {
  $('tokenInput').value = token;
  $('chiaveInput').value = chiave;
  const s = $('tokenStato');
  s.className = 'nota';
  s.textContent = token ? 'Token set.' : 'No token: the plan can be read but not saved.';
  const c = $('chiaveStato');
  c.className = 'nota';
  c.textContent = chiaveKo ? 'The last file would not open: key missing or wrong.'
                : chiave   ? 'Key set.'
                :            'No key: the plan travels in the clear.';
  dlgImp.showModal();
}

$('impostazioniBtn').addEventListener('click', openImpostazioni);

$('impostazioniForm').addEventListener('submit', () => {
  const chiaveNuova = $('chiaveInput').value.trim() !== chiave;
  token = $('tokenInput').value.trim();
  chiave = $('chiaveInput').value.trim();
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (chiave) localStorage.setItem(CHIAVE_KEY, chiave);
    else localStorage.removeItem(CHIAVE_KEY);
  } catch (e) { /* restano solo in memoria */ }
  chiaveKo = false;
  salvaErr = '';
  /* cambiare la chiave cambia il file online: va risalvato */
  if (chiaveNuova && tstore.sha) touch();
  pullTasks();
  paintSalva();
  paintEdit();
  paintW();
  if (token) provaToken();
  else paintSync('view only');
});
$('tokenAnnulla').addEventListener('click', () => dlgImp.close());

async function provaToken() {
  try {
    const r = await fetch(API, { headers: ghHeaders(), cache: 'no-store' });
    if (r.status === 401) paintSync('token rejected', true);
    else if (r.ok) paintSync('token accepted');
    else if (r.status === 404) paintSync('repository not found', true);
    else paintSync('token: error ' + r.status, true);
  } catch (e) {
    paintSync('no network', true);
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

/* Il repository e' pubblico: chi lo trova legge il piano. Con una chiave il
   file diventa un pacchetto illeggibile — AES-GCM a 256 bit, chiave ricavata
   dalla parola con PBKDF2. Senza chiave si scrive e si legge in chiaro. */

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

async function cifra(testo) {
  if (!chiave) return testo;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const k    = await derivaChiave(chiave, salt);
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k,
                                           new TextEncoder().encode(testo));
  return JSON.stringify({ enc: 1, salt: bytesB64(salt), iv: bytesB64(iv),
                          ct: bytesB64(new Uint8Array(ct)) }, null, 2) + '\n';
}

async function decifra(testo) {
  let p = null;
  try { p = JSON.parse(testo); } catch (e) { return testo; }
  if (!p || p.enc !== 1) return testo;
  if (!chiave) throw new Error('key missing');
  const k = await derivaChiave(chiave, b64Bytes(p.salt));
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

function paintSalva() {
  const b = $('salva');
  b.hidden = !tstore.dirty;
  b.disabled = salvando;
  b.classList.toggle('err', !!salvaErr);
  b.textContent = salvando ? 'Saving…' : salvaErr ? 'Save — ' + salvaErr : 'Save';
}

function paintSync(msg, err) {
  if (msg !== undefined) { syncMsg = msg; syncErr = !!err; }
  const s = $('sync');
  s.textContent = syncErr ? syncMsg : tstore.dirty ? 'unsaved changes' : syncMsg;
  s.classList.toggle('err', syncErr);
}

const leggi = () => fetch(FILE_API + '?ref=' + BRANCH, { headers: ghHeaders(), cache: 'no-store' });

/* Il file dal branch. Senza token si legge lo stesso. Se il telefono ha
   modifiche non salvate, vince il telefono: online si guarda soltanto. */
async function pullTasks() {
  let r;
  try { r = await leggi(); } catch (e) { paintSync('offline: using the copy on this phone'); return; }
  let tokenKo = false;
  if (r.status === 401 && token) {
    tokenKo = true;
    try {
      r = await fetch(FILE_API + '?ref=' + BRANCH, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
    } catch (e) { paintSync('token rejected', true); return; }
  }
  const fine = msg => paintSync(tokenKo ? 'token rejected' : (!token && msg ? 'view only · ' + msg : msg), tokenKo);
  /* chi legge e basta non ha niente da salvare: comanda sempre quello online */
  if (!token && tstore.dirty) tstore.dirty = false;
  if (r.status === 404) { fine(tstore.sha ? 'file not found online' : 'no plan online yet'); return; }
  if (!r.ok) { fine('GitHub: error ' + r.status); return; }

  let j;
  try { j = await r.json(); } catch (e) { return; }
  if (!j || !j.sha) return;
  if (tstore.known.indexOf(j.sha) >= 0) { fine(tstore.dirty ? '' : 'in sync'); scaricaVideo(); return; }

  let data;
  try {
    data = JSON.parse(await decifra(b64dec(j.content)));
  } catch (e) {
    paintSync('plan encrypted: key missing or wrong', true);
    chiaveKo = true;
    return;
  }
  const remoto = { workout: validWorkout(data.workout), schede: validSchede(data.schede),
                   slot: validSlot(data.slot), mattina: validMattina(data.mattina) };

  if (tstore.dirty) {
    if (contenuto(remoto) === contenuto(tstore)) {
      rememberSha(j.sha); tstore.dirty = false; saveLocal(); paintSalva();
      fine('in sync');
    } else {
      fine('a different version is online: saving overwrites it');
    }
    return;
  }

  tstore.workout = remoto.workout;
  tstore.schede = remoto.schede;
  tstore.slot = remoto.slot;
  tstore.mattina = remoto.mattina;
  rememberSha(j.sha);
  tstore.dirty = false;
  saveLocal();
  paintW(); paintSalva();
  fine('in sync at ' + fmtTime.format(new Date()));
  scaricaVideo();
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

/* Un commit solo, con tutto dentro. */
async function pushTasks(opts) {
  opts = opts || {};
  if (!tstore.dirty || salvando) return;
  if (!token) { salvaErr = 'token missing'; paintSalva(); paintSync('token missing: open ⚙ Settings', true); return; }

  salvando = true; salvaErr = ''; salvaRetry = false;
  paintSalva();

  const sent = contenuto(tstore);
  const testo = JSON.stringify({ workout: tstore.workout, schede: tstore.schede, slot: tstore.slot,
                                 mattina: tstore.mattina || undefined }, null, 2) + '\n';
  let corpo;
  try {
    corpo = await cifra(testo);
  } catch (e) {
    salvando = false; salvaErr = 'encryption failed'; paintSalva();
    paintSync('encryption failed: check the key', true);
    return;
  }
  const n = allenamenti().length;
  const payload = {
    message: 'scheda: ' + n + ' allenamenti, ' + Object.keys(tstore.schede).length + ' schede',
    content: b64enc(corpo),
    branch:  BRANCH
  };
  if (tstore.sha) payload.sha = tstore.sha;
  const body = JSON.stringify(payload);

  const salvato = () => {
    if (contenuto(tstore) === sent) tstore.dirty = false;
    saveLocal(); paintSalva();
    paintSync('saved at ' + fmtTime.format(new Date()));
  };

  let r;
  try {
    r = await fetch(FILE_API, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: body,
      keepalive: !!opts.keepalive && body.length < 60000
    });
  } catch (e) {
    salvando = false; salvaErr = 'no network'; salvaRetry = true; paintSalva(); return;
  }
  salvando = false;

  /* manca il branch: si crea e si riprova, una volta */
  if ((r.status === 404 || r.status === 422) && !opts.branch) {
    let msg = '';
    try { msg = (await r.clone().json()).message || ''; } catch (e) { /* niente */ }
    if (/branch/i.test(msg) || r.status === 404) {
      if (await creaBranch()) return pushTasks(Object.assign({}, opts, { branch: true }));
      salvaErr = r.status === 404 ? 'repository not found' : 'branch missing';
      paintSalva(); paintSync(salvaErr, true);
      return;
    }
  }

  /* sha vecchia: online e' cambiato qualcosa nel frattempo. Si rilegge; se e'
     la nostra stessa versione si e' a posto, altrimenti si riprova una volta
     con la sha giusta. Vince il telefono. */
  if ((r.status === 409 || r.status === 422) && !opts.retry) {
    try {
      const cur = await leggi();
      if (cur.ok) {
        const j = await cur.json();
        rememberSha(j.sha);
        let data = null;
        try { data = JSON.parse(await decifra(b64dec(j.content))); } catch (e) { /* si riprova comunque */ }
        if (data && contenuto(data) === sent) { salvato(); return; }
        return pushTasks(Object.assign({}, opts, { retry: true }));
      }
      if (cur.status === 404) {
        tstore.sha = null;
        return pushTasks(Object.assign({}, opts, { retry: true }));
      }
    } catch (e) { /* si cade nell'errore qui sotto */ }
    salvaErr = 'conflict online'; paintSalva(); paintSync(salvaErr, true);
    return;
  }

  if (!r.ok) {
    salvaErr = r.status === 401 ? 'token rejected'
             : r.status === 403 ? 'token without permission'
             : r.status === 404 ? 'repository not found'
             :                    'error ' + r.status;
    salvaRetry = r.status >= 500;
    paintSalva(); paintSync(salvaErr, true);
    return;
  }

  let j = null;
  try { j = await r.json(); } catch (e) { /* salvato comunque */ }
  if (j && j.content && j.content.sha) rememberSha(j.content.sha);
  salvato();
  /* il piano e' salvato: adesso i video nuovi, uno alla volta. Chiudendo
     l'app non si prova nemmeno: un video non parte in un colpo solo. */
  if (!opts.keepalive) await caricaPendenti();
}

/* I video scelti da questo telefono partono per GitHub. Quelli che non ce la
   fanno restano in lista: Save resta acceso, e si riprova. */
async function caricaPendenti() {
  if (!tstore.daCaricare.length) return;
  salvando = true; paintSalva();
  const lista = tstore.daCaricare.slice();
  for (let i = 0; i < lista.length; i++) {
    paintSync('uploading video ' + (i + 1) + ' of ' + lista.length + '…');
    const ok = await caricaVideo(lista[i]);
    if (ok) {
      tstore.daCaricare = tstore.daCaricare.filter(x => x !== lista[i]);
      saveLocal();
    }
  }
  salvando = false;
  if (tstore.daCaricare.length) {
    tstore.dirty = true; saveLocal();
    salvaErr = 'video upload failed';
    paintSalva(); paintSync('video upload failed: press Save to try again', true);
  } else {
    paintSalva(); paintSync('saved at ' + fmtTime.format(new Date()));
  }
}

/* Il salvagente: si chiama chiudendo l'app. */
function salvagente() {
  if (!tstore.dirty || !token || salvando) return;
  pushTasks({ keepalive: true });
}

function riprovaSalva() {
  if (!(tstore.dirty && salvaRetry && !salvando && token)) return;
  sincronizzaLocale();
  if (tstore.dirty && !salvando) pushTasks();
}

$('salva').addEventListener('click', () => {
  /* un campo ancora col cursore dentro non ha ancora scritto: lo si chiude */
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  pushTasks();
});

/* ---------------------------------------------------------- avviamento --- */

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { salvagente(); return; }
  if (!sincronizzaLocale()) paintW();
  pullTasks();
  riprovaSalva();
});
window.addEventListener('pagehide', salvagente);
window.addEventListener('online', () => { riprovaSalva(); pullTasks(); });

/* A mezzanotte cambia la riga di oggi: si ridisegna al passare del giorno. */
let giornoVisto = today().getTime();
setInterval(() => {
  const t = today().getTime();
  if (t !== giornoVisto) { giornoVisto = t; paintW(); }
}, 60000);

paintEdit();
disegnaW();
paintSalva();
paintSync(token ? '' : 'view only');
pullTasks();

/* I video stanno nel telefono per sempre: si chiede al browser di non buttare
   mai i dati di questa app, nemmeno quando la memoria scarseggia. */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* Con l'app aperta, ogni cinque minuti si guarda se il piano e' cambiato: chi
   legge dal telefono vede le modifiche fatte dal PC senza chiudere e riaprire.
   Non piu' spesso: senza token GitHub concede 60 letture l'ora. */
setInterval(() => {
  if (document.visibilityState === 'visible' && !tstore.dirty && !salvando) pullTasks();
}, 5 * 60 * 1000);
