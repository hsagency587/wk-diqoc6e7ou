'use strict';

/* =========================================================================
   L'editor: una schermata a parte, solo per chi ha il token. A sinistra
   l'elenco di tutto quello che si scrive (il piano di sempre e le
   preparazioni), a destra i campi di quello che si e' scelto. Sul telefono
   prima l'elenco, poi la pagina, con la freccia per tornare indietro.
   Ogni cambio resta subito nel telefono; chiudendo l'editor si salva su
   GitHub da solo.
   ========================================================================= */

const edBox = $('ed');

/* Cosa si sta guardando: { pag, ctx, nome, sett }.
   pag: 'week' | 'morning' | 'workout' | 'new' | 'prep' | 'newprep'.
   ctx: 'base' per il piano di sempre, o l'id di una preparazione. */
let edVista = { pag: 'week', ctx: 'base', sett: 0 };
/* Sul telefono: true quando si vede la pagina, false quando si vede l'elenco */
let edInPagina = false;
/* Gli esercizi con la descrizione aperta, per non chiuderli a ogni ridisegno */
let edAperti = new Set();
/* Gli indirizzi dei video in anteprima: si liberano a ogni ridisegno */
let edUrl = [];

const GIORNI_ED = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 0: 'Sunday' };
const stretto = matchMedia('(max-width: 899px)');
const copia = x => JSON.parse(JSON.stringify(x));

/* La fonte di una pagina: il piano di sempre (le sue settimane sono una, e
   sta dentro tstore) o una preparazione. */
function edFonte(ctx) {
  if (ctx === 'base') return { base: true, obj: tstore, schede: tstore.schede, settimane: [tstore] };
  const p = tstore.prep.find(x => x.id === ctx);
  return p ? { base: false, obj: p, prep: p, schede: p.schede, settimane: p.settimane } : null;
}

/* I workout di una fonte: quelli scritti nella settimana e quelli che hanno
   una scheda, senza doppioni, nell'ordine in cui compaiono. */
function edWorkout(f) {
  const out = [];
  for (const w of f.settimane) {
    for (const g of SETTIMANA) {
      for (const v of (w.workout[g] || []).slice(0, w.conti[g] || 0)) if (v && v !== MORNING && out.indexOf(v) < 0) out.push(v);
    }
  }
  for (const k of Object.keys(f.schede)) if (k !== MORNING && out.indexOf(k) < 0) out.push(k);
  return out;
}

const nomePrep = p => p.nome || 'Preparation';
const datePrep = p => dataCorta(p.dal) + ' – ' + dataCorta(p.al);

/* Ogni cambio passa di qui: resta nel telefono, compare Salva, e la pagina
   sotto l'editor si aggiorna. */
function edCambio(ridisegnaElenco) {
  touch();
  paintW();
  if (ridisegnaElenco) edElenco();
}

/* ------------------------------------------------ aprire e chiudere ---- */

function edApri() {
  if (!scrive()) return;
  edVista = { pag: 'week', ctx: 'base', sett: 0 };
  edInPagina = !stretto.matches;
  edAperti = new Set();
  edBox.hidden = false;
  document.body.classList.add('ed-aperto');
  history.pushState({ ed: 1 }, '');
  edRidisegna();
}

/* Chiudendo si salva da solo, se c'e' qualcosa da salvare. */
function edChiudi(daIndietro) {
  if (edBox.hidden) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  edBox.hidden = true;
  document.body.classList.remove('ed-aperto');
  edLibera();
  paintW();
  if (tstore.dirty) pushTasks();
  if (!daIndietro && history.state && history.state.ed) history.back();
}

$('wMod').addEventListener('click', edApri);
$('edChiudi').addEventListener('click', () => edChiudi(false));
$('edSalva').addEventListener('click', () => {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  pushTasks();
});

/* Il tasto indietro del telefono: dalla pagina all'elenco, dall'elenco fuori. */
$('edIndietro').addEventListener('click', () => history.back());
window.addEventListener('popstate', () => {
  if (edBox.hidden) return;
  if (edInPagina && stretto.matches) { edInPagina = false; edRidisegna(); return; }
  edChiudi(true);
});

function edVai(vista) {
  edVista = vista;
  edAperti = new Set();
  if (stretto.matches && !edInPagina) history.pushState({ ed: 2 }, '');
  edInPagina = true;
  edRidisegna();
  $('edPane').scrollTop = 0;
}

function edLibera() {
  for (const u of edUrl) URL.revokeObjectURL(u);
  edUrl = [];
}

function edRidisegna() {
  if (edBox.hidden) return;
  /* una pagina che non c'e' piu' (preparazione cancellata): si torna al piano */
  if (!edFonte(edVista.ctx)) edVista = { pag: 'week', ctx: 'base', sett: 0 };
  edBox.classList.toggle('in-pagina', edInPagina);
  edElenco();
  edPagina();
  paintSalva();
}

/* ------------------------------------------------ l'elenco ---- */

function edVoce(testo, vista, attiva, cls) {
  const b = el('button', 'ed-voce' + (attiva ? ' on' : '') + (cls ? ' ' + cls : ''), testo);
  b.type = 'button';
  b.addEventListener('click', () => edVai(vista));
  return b;
}

function edVociFonte(box, ctx) {
  const f = edFonte(ctx);
  const v = edVista;
  if (f.base) {
    box.appendChild(edVoce('Week', { pag: 'week', ctx: ctx, sett: 0 }, v.pag === 'week' && v.ctx === ctx));
  } else {
    f.settimane.forEach((w, i) => {
      box.appendChild(edVoce('Week ' + (i + 1), { pag: 'week', ctx: ctx, sett: i },
        v.pag === 'week' && v.ctx === ctx && v.sett === i));
    });
  }
  /* la lista di tutti i giorni sta nella sua categoria: Every day */
  if (edTendina(box, ctx, 'every', 'Every day')) {
    box.appendChild(edVoce(nomeMattinaDi(f.obj) + (f.obj.mattinaVia ? ' (hidden)' : ''), { pag: 'morning', ctx: ctx },
      v.pag === 'morning' && v.ctx === ctx, f.obj.mattinaVia ? 'spenta' : ''));
  }
  /* i workout nuovi non hanno un bottone: nascono scrivendoli in un giorno della settimana */
  const nomi = edWorkout(f);
  if (edTendina(box, ctx, 'wk', 'Workouts')) {
    for (const n of nomi) {
      box.appendChild(edVoce(n, { pag: 'workout', ctx: ctx, nome: n },
        v.pag === 'workout' && v.ctx === ctx && v.nome === n, 'wk'));
    }
  }
}

/* Le tendine dell'elenco (Every day, Workouts): si aprono e si chiudono con un
   tocco. Quali sono chiuse lo ricorda questo dispositivo. */
const ED_CHIUSE_KEY = 'wk-edchiuse-v1';
let edChiuse = (() => {
  try { const v = JSON.parse(localStorage.getItem(ED_CHIUSE_KEY) || '[]'); return new Set(Array.isArray(v) ? v.map(String) : []); }
  catch (e) { return new Set(); }
})();
function edTendina(box, ctx, chi, testo) {
  const k = (ctx === 'base' ? 'base' : 'prep') + ':' + chi;
  const aperta = !edChiuse.has(k);
  const b = el('button', 'ed-sub ed-tendina' + (aperta ? ' open' : ''));
  b.type = 'button';
  b.setAttribute('aria-expanded', aperta ? 'true' : 'false');
  b.appendChild(el('span', 'ed-tendina-nome', testo));
  b.appendChild(el('span', 'ed-tendina-frec', '\u25BE'));
  b.addEventListener('click', () => {
    if (aperta) edChiuse.add(k); else edChiuse.delete(k);
    try { localStorage.setItem(ED_CHIUSE_KEY, JSON.stringify([...edChiuse])); } catch (e) {}
    edElenco();
  });
  box.appendChild(b);
  return aperta;
}

function edElenco() {
  const nav = $('edNav');
  const y = nav.scrollTop;
  nav.textContent = '';

  nav.appendChild(el('p', 'ed-sez', 'PLAN'));
  const base = el('div', 'ed-gruppo');
  edVociFonte(base, 'base');
  nav.appendChild(base);

  nav.appendChild(el('p', 'ed-sez', 'PREPARATIONS'));
  const kOggi = chiaveData(today());
  for (const p of tstore.prep) {
    const stato = p.al < kOggi ? ' fatta' : (p.dal <= kOggi ? ' incorso' : '');
    const testa = el('button', 'ed-voce ed-prep' + stato +
      (edVista.pag === 'prep' && edVista.ctx === p.id ? ' on' : ''));
    testa.type = 'button';
    testa.appendChild(el('span', 'ed-prep-nome', nomePrep(p)));
    testa.appendChild(el('span', 'ed-prep-date', datePrep(p) +
      (stato === ' incorso' ? ' · now' : stato === ' fatta' ? ' · ended' : '')));
    testa.addEventListener('click', () => edVai({ pag: 'prep', ctx: p.id }));
    nav.appendChild(testa);
    /* le pagine della preparazione si vedono quando ci si lavora dentro */
    if (edVista.ctx === p.id) {
      const g = el('div', 'ed-gruppo ed-figli');
      edVociFonte(g, p.id);
      nav.appendChild(g);
    }
  }
  nav.appendChild(edVoce('+ Add preparation', { pag: 'newprep', ctx: 'base' }, edVista.pag === 'newprep', 'piu'));
  nav.scrollTop = y;
}

/* ------------------------------------------------ le pagine ---- */

function edTitolo(box, testo, sotto) {
  box.appendChild(el('h3', 'ed-h', testo));
  if (sotto) box.appendChild(el('p', 'ed-sotto', sotto));
}

/* Il nome della fonte, sopra il titolo: per sapere sempre dove si scrive. */
function edDove(box, ctx) {
  const f = edFonte(ctx);
  box.appendChild(el('p', 'ed-dove' + (f.base ? '' : ' prep'),
    f.base ? 'PLAN' : 'PREPARATION · ' + nomePrep(f.prep) + ' · ' + datePrep(f.prep)));
}

function edPagina() {
  edLibera();
  const pane = $('edPane');
  const y = pane.scrollTop;
  pane.textContent = '';
  const v = edVista;
  if (v.pag === 'week') edPagSettimana(pane, v.ctx, v.sett || 0);
  else if (v.pag === 'morning') edPagMattina(pane, v.ctx);
  else if (v.pag === 'workout') edPagWorkout(pane, v.ctx, v.nome);
  else if (v.pag === 'new') edPagNuovo(pane, v.ctx);
  else if (v.pag === 'prep') edPagPrep(pane, v.ctx);
  else if (v.pag === 'newprep') edPagNuovaPrep(pane);
  pane.scrollTop = y;
}

/* Un campo di testo con la sua etichetta. `cambia` riceve il valore quando si
   esce dal campo. */
function edCampo(box, etichetta, valore, attr, cambia) {
  const l = el('label', 'ed-campo');
  l.appendChild(el('span', 'ed-eti', etichetta));
  const i = el('input', 'campo');
  i.type = attr.type || 'text';
  if (attr.max) i.maxLength = attr.max;
  if (attr.ph) i.placeholder = attr.ph;
  if (attr.list) i.setAttribute('list', attr.list);
  i.value = valore || '';
  i.addEventListener('change', () => cambia(i.value, i));
  l.appendChild(i);
  box.appendChild(l);
  return i;
}

function edBottone(box, testo, cls, fa) {
  const b = el('button', 'schbtn ' + (cls || ''), testo);
  b.type = 'button';
  b.addEventListener('click', fa);
  box.appendChild(b);
  return b;
}

/* Un bottone che chiede conferma: al primo tocco dice "Sure?", al secondo fa. */
function edConferma(box, testo, fa) {
  const b = edBottone(box, testo, 'btn-del', () => {
    if (b.dataset.sicuro) { fa(); return; }
    b.dataset.sicuro = '1';
    b.textContent = 'Sure? Tap again';
    setTimeout(() => { if (b.isConnected) { delete b.dataset.sicuro; b.textContent = testo; } }, 4000);
  });
  return b;
}

/* --- la settimana ------------------------------------------------------ */

function edPagSettimana(box, ctx, si) {
  const f = edFonte(ctx);
  const w = f.settimane[Math.min(si, f.settimane.length - 1)];
  edDove(box, ctx);
  if (f.base) {
    edTitolo(box, 'Week', 'The plan that repeats every week. Tap − and + to choose how many workouts each day has; 0 is a rest day.');
  } else {
    const inizio = piuGiorni(lunedi(daChiave(f.prep.dal)), 7 * si);
    const fine = piuGiorni(inizio, 6);
    const ultima = si === f.settimane.length - 1;
    edTitolo(box, 'Week ' + (si + 1), dataCorta(chiaveData(inizio)) + ' – ' + dataCorta(chiaveData(fine)) +
      (ultima && f.settimane.length < settimaneDel(f.prep) ? ' · repeats until the end of the preparation' : ''));
  }

  /* i nomi gia' usati, da scegliere mentre si scrive */
  const lista = el('datalist');
  lista.id = 'edNomi';
  /* in cima la lista di tutti i giorni: scelta in un giorno, quel giorno
     porta il suo nome */
  const nomeEvery = nomeMattinaDi(f.obj);
  for (const n of [nomeEvery].concat(edWorkout(f))) { const o = el('option'); o.value = n; lista.appendChild(o); }
  box.appendChild(lista);
  box.appendChild(el('p', 'ed-sotto', 'Tip: write "' + nomeEvery + '" in a day to give that day the Every day list.'));

  /* In una preparazione la prima e l'ultima settimana possono essere a meta':
     i giorni prima dell'inizio e dopo la fine restano al piano di sempre, e
     qui si vedono spenti, con la data, invece dei campi. */
  const lunSett = f.base ? null : piuGiorni(lunedi(daChiave(f.prep.dal)), 7 * si);
  SETTIMANA.forEach((g, pos) => {
    const n = w.conti[g] || 0;
    const kGiorno = lunSett ? chiaveData(piuGiorni(lunSett, pos)) : null;
    const fuori = kGiorno && (kGiorno < f.prep.dal || kGiorno > f.prep.al);
    const riga = el('div', 'ed-giorno' + (n ? '' : ' riposo') + (fuori ? ' fuori' : ''));
    const testa = el('div', 'ed-giorno-testa');
    const nomeG = el('span', 'ed-giorno-nome', GIORNI_ED[g]);
    if (kGiorno) nomeG.appendChild(el('span', 'ed-giorno-data', ' ' + dataCorta(kGiorno)));
    testa.appendChild(nomeG);
    if (fuori) {
      riga.appendChild(testa);
      riga.appendChild(el('span', 'ed-riposo', kGiorno < f.prep.dal
        ? 'Before the preparation: the normal plan applies'
        : 'After the preparation: the normal plan applies'));
      box.appendChild(riga);
      return;
    }
    const conta = el('div', 'ed-conta');
    const meno = edBottone(conta, '−', 'ed-piumeno', () => { w.conti[g] = Math.max(0, n - 1); edCambio(true); edPagina(); });
    meno.disabled = n <= 0;
    meno.setAttribute('aria-label', 'One workout less on ' + GIORNI_ED[g]);
    conta.appendChild(el('span', 'ed-conta-num', String(n)));
    const piu = edBottone(conta, '+', 'ed-piumeno', () => { w.conti[g] = Math.min(MAX_SLOT, n + 1); edCambio(true); edPagina(); });
    piu.disabled = n >= MAX_SLOT;
    piu.setAttribute('aria-label', 'One workout more on ' + GIORNI_ED[g]);
    testa.appendChild(conta);
    riga.appendChild(testa);

    const campi = el('div', 'ed-giorno-campi');
    if (!n) campi.appendChild(el('span', 'ed-riposo', 'Rest day'));
    for (let i = 0; i < n; i++) {
      const inp = el('input', 'campo');
      inp.type = 'text';
      inp.maxLength = 60;
      inp.setAttribute('list', 'edNomi');
      inp.placeholder = ORDINALI[i] + ' workout';
      const val = (w.workout[g] || [])[i] || '';
      inp.value = val === MORNING ? nomeEvery : val;
      if (val === MORNING) inp.classList.add('every');
      inp.addEventListener('change', () => {
        const r = (w.workout[g] || []).slice();
        while (r.length <= i) r.push('');
        const scritto = inp.value.slice(0, 60).trim();
        r[i] = scritto && scritto.toLowerCase() === nomeEvery.toLowerCase() ? MORNING : scritto;
        while (r.length && !r[r.length - 1]) r.pop();
        if (r.length) w.workout[g] = r; else delete w.workout[g];
        inp.classList.toggle('every', r[i] === MORNING);
        edCambio(true);
      });
      campi.appendChild(inp);
    }
    riga.appendChild(campi);
    box.appendChild(riga);
  });

  if (!f.base && f.settimane.length > 1) {
    const b = el('div', 'ed-azioni');
    edConferma(b, 'Delete week ' + (si + 1), () => {
      f.settimane.splice(si, 1);
      edVista = { pag: 'week', ctx: ctx, sett: Math.max(0, si - 1) };
      edCambio(true);
      edRidisegna();
    });
    box.appendChild(b);
  }
}

/* Quante settimane del calendario tocca una preparazione. */
const settimaneDel = p =>
  Math.floor(giorniFra(chiaveData(lunedi(daChiave(p.dal))), chiaveData(lunedi(daChiave(p.al)))) / 7) + 1;

/* --- gli esercizi: la parte comune a FIRST 15' e ai workout -------------- */

/* Le righe di una scheda da scrivere: nome, quantita', descrizione, frecce,
   croce. Il ▾ apre sotto la riga la descrizione e il video. */
function edEsercizi(box, ctx, nomeScheda, sc) {
  const cont = el('div', 'ed-es-lista');
  box.appendChild(cont);
  sc.es.forEach((r, i) => {
    const chiave = ctx + '|' + nomeScheda + '|' + i;
    const aperto = edAperti.has(chiave);
    const es = el('div', 'ed-es' + (aperto ? ' aperto' : ''));
    const riga = el('div', 'ed-es-riga');

    const nome = el('input', 'campo ed-es-nome');
    nome.type = 'text'; nome.maxLength = 60; nome.placeholder = 'exercise';
    nome.value = r[0] || '';
    nome.dataset.focus = chiave + '|0';
    nome.addEventListener('change', () => { r[0] = nome.value.slice(0, 60).trim(); edCambio(false); });
    const qta = el('input', 'campo ed-es-qta');
    qta.type = 'text'; qta.maxLength = 60; qta.placeholder = 'how much';
    qta.value = r[1] || '';
    qta.addEventListener('change', () => { r[1] = qta.value.slice(0, 60).trim(); edCambio(false); });
    riga.appendChild(nome);
    riga.appendChild(qta);

    const tasti = el('div', 'ed-es-tasti');
    const pieno = !!(r[3] || r[4]);
    const d = edBottone(tasti, aperto ? '▴' : (r[4] ? '▶' : '▾'), 'ed-tasto ed-desc' + (pieno ? ' piena' : ''), () => {
      if (edAperti.has(chiave)) edAperti.delete(chiave); else edAperti.add(chiave);
      edPagina();
    });
    d.setAttribute('aria-label', 'Description and video');
    d.title = 'Description and video';
    const su = edBottone(tasti, '↑', 'ed-tasto', () => edSposta(sc, i, -1));
    su.disabled = i === 0; su.setAttribute('aria-label', 'Move up');
    const giu = edBottone(tasti, '↓', 'ed-tasto', () => edSposta(sc, i, 1));
    giu.disabled = i === sc.es.length - 1; giu.setAttribute('aria-label', 'Move down');
    const x = edBottone(tasti, '×', 'ed-tasto ed-x', () => {
      sc.es.splice(i, 1);
      edAperti = new Set();
      edCambio(false);
      edPagina();
    });
    x.setAttribute('aria-label', 'Remove this exercise');
    riga.appendChild(tasti);
    es.appendChild(riga);

    /* il gruppo in cui sta, se ci sta: si legge, si cambia dal bottone Groups */
    if ((r[2] || []).length) es.appendChild(el('p', 'ed-es-grp', 'in ' + r[2].join(' › ')));

    if (aperto) es.appendChild(edDescrizione(r));
    cont.appendChild(es);
  });

  edBottone(box, '+ Exercise', 'ed-aggiungi', () => {
    sc.es.push(['', '', [], '', '']);
    edPagina();
    const campi = $('edPane').querySelectorAll('.ed-es-nome');
    if (campi.length) campi[campi.length - 1].focus();
  });
}

/* Le righe cambiano posto una alla volta. Un gruppo resta com'e': la riga
   spostata porta con se' il suo. */
function edSposta(sc, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= sc.es.length) return;
  const t = sc.es[i]; sc.es[i] = sc.es[j]; sc.es[j] = t;
  edAperti = new Set();
  edCambio(false);
  edPagina();
}

/* La descrizione di un esercizio, aperta sotto la sua riga: in cima il video,
   sotto il testo. Un link scritto da solo su una riga del testo e' un video
   anche lui, come prima. */
function edDescrizione(r) {
  const box = el('div', 'ed-desc-box');

  const v = el('div', 'ed-video');
  if (r[4]) {
    const st = el('p', 'ed-video-stato', 'Loading video…');
    v.appendChild(st);
    (async () => {
      let blob = await vGet(r[4]);
      if (!blob) blob = await prendiVideo(r[4]);
      if (!blob) { st.textContent = 'Video not on this device yet.'; return; }
      const u = URL.createObjectURL(blob);
      edUrl.push(u);
      const vid = el('video');
      vid.src = u; vid.controls = true; vid.playsInline = true; vid.preload = 'metadata';
      st.replaceWith(vid);
    })();
  }
  const tasti = el('div', 'ed-video-tasti');
  const file = el('input');
  file.type = 'file'; file.accept = 'video/*'; file.hidden = true;
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    const esito = await tieniVideo(f);
    if (esito.errore) { errore.textContent = esito.errore; errore.hidden = false; return; }
    r[4] = esito.nome;
    if (tstore.daCaricare.indexOf(esito.nome) < 0) tstore.daCaricare.push(esito.nome);
    edCambio(false);
    edPagina();
  });
  tasti.appendChild(file);
  edBottone(tasti, r[4] ? 'Change video' : '+ Video', '', () => file.click());
  if (r[4]) edBottone(tasti, 'Remove video', 'btn-del', () => { r[4] = ''; edCambio(false); edPagina(); });
  v.appendChild(tasti);
  const errore = el('p', 'nota err');
  errore.hidden = true;
  v.appendChild(errore);
  box.appendChild(v);

  const t = el('textarea', 'commento ed-desc-testo');
  t.placeholder = 'How it goes, what to watch out for. Lines starting with - become a list; a YouTube link on its own line becomes a video.';
  t.value = r[3] || '';
  const alto = () => { t.rows = Math.max(4, Math.min(24, t.value.split('\n').length + 1)); };
  alto();
  t.addEventListener('input', alto);
  t.addEventListener('change', () => { r[3] = t.value.slice(0, 4000).trim(); edCambio(false); });
  box.appendChild(t);
  return box;
}

/* --- FIRST 15' ---------------------------------------------------------- */

function edPagMattina(box, ctx) {
  const f = edFonte(ctx);
  const o = f.obj;
  edDove(box, ctx);
  box.appendChild(el('p', 'ed-sez-pag ed-cat', 'EVERY DAY'));
  edTitolo(box, nomeMattinaDi(o), 'The list shown every day, above the workouts. Untick "Show it in the app" to hide it: what is written stays.');
  const l = el('label', 'ed-spunta');
  const c = el('input', 'schsel');
  c.type = 'checkbox';
  c.checked = !o.mattinaVia;
  c.addEventListener('change', () => { o.mattinaVia = !c.checked; edCambio(true); });
  l.appendChild(c);
  l.appendChild(el('span', null, 'Show it in the app'));
  box.appendChild(l);
  edCampo(box, 'Name', o.mattina, { max: 40, ph: MATTINA_BASE }, (val) => {
    const v = validMattina(val);
    if (v && v !== MATTINA_BASE) o.mattina = v; else o.mattina = '';
    edCambio(true);
    edPagina();
  });
  if (!f.schede[MORNING]) f.schede[MORNING] = { es: [], rec: '' };
  box.appendChild(el('p', 'ed-sez-pag', 'EXERCISES'));
  edEsercizi(box, ctx, MORNING, f.schede[MORNING]);
  edGruppiBottone(box, ctx, MORNING);
}

/* --- un workout --------------------------------------------------------- */

function edPagWorkout(box, ctx, nome) {
  const f = edFonte(ctx);
  if (!f.schede[nome]) f.schede[nome] = { es: [], rec: '' };
  const sc = f.schede[nome];
  edDove(box, ctx);
  edTitolo(box, nome, edUsato(f, nome));

  const errore = el('p', 'nota err');
  errore.hidden = true;
  edCampo(box, 'Name', nome, { max: 60 }, (val, inp) => {
    const nuovo = val.slice(0, 60).trim();
    if (nuovo === nome) return;
    const msg = !nuovo ? 'A workout needs a name.'
      : nuovo === MORNING || f.schede[nuovo] || edWorkout(f).indexOf(nuovo) >= 0 ? 'There is already a workout called "' + nuovo + '".'
      : '';
    if (msg) { errore.textContent = msg; errore.hidden = false; inp.value = nome; return; }
    edRinomina(f, nome, nuovo);
    edVista = { pag: 'workout', ctx: ctx, nome: nuovo };
    edCambio(true);
    edPagina();
  });
  box.appendChild(errore);
  edCampo(box, 'Recovery', sc.rec, { max: 60, ph: 'e.g. 1’' }, (val) => {
    sc.rec = val.slice(0, 60).trim();
    edCambio(false);
  });

  box.appendChild(el('p', 'ed-sez-pag', 'EXERCISES'));
  edEsercizi(box, ctx, nome, sc);
  edGruppiBottone(box, ctx, nome);

  const az = el('div', 'ed-azioni');
  edConferma(az, 'Delete workout', () => {
    delete f.schede[nome];
    /* tolto anche dai giorni in cui era scritto */
    for (const w of f.settimane) {
      for (const g of SETTIMANA) {
        const r = w.workout[g];
        if (!r) continue;
        for (let i = 0; i < r.length; i++) if (r[i] === nome) r[i] = '';
        while (r.length && !r[r.length - 1]) r.pop();
        if (!r.length) delete w.workout[g];
      }
    }
    edVista = f.base ? { pag: 'week', ctx: ctx, sett: 0 } : { pag: 'prep', ctx: ctx };
    edCambio(true);
    edRidisegna();
  });
  box.appendChild(az);
}

/* In quali giorni c'e' un workout: si legge sotto il titolo. */
function edUsato(f, nome) {
  const giorni = [];
  f.settimane.forEach((w, i) => {
    for (const g of SETTIMANA) {
      if ((w.workout[g] || []).slice(0, w.conti[g] || 0).indexOf(nome) >= 0) {
        giorni.push((f.settimane.length > 1 ? 'W' + (i + 1) + ' ' : '') + GIORNI2[g]);
      }
    }
  });
  return giorni.length ? 'On: ' + giorni.join(', ') : 'Not in the week yet: write its name on a day in Week.';
}

/* Cambiare nome a un workout: la scheda passa sotto il nome nuovo, e i giorni
   in cui era scritto lo seguono. */
function edRinomina(f, vecchio, nuovo) {
  f.schede[nuovo] = f.schede[vecchio];
  delete f.schede[vecchio];
  for (const w of f.settimane) {
    for (const g of SETTIMANA) {
      const r = w.workout[g];
      if (r) for (let i = 0; i < r.length; i++) if (r[i] === vecchio) r[i] = nuovo;
    }
  }
  if (mostra.off.indexOf(vecchio) >= 0) { mostra.off = mostra.off.map(x => x === vecchio ? nuovo : x); salvaMostra(); }
}

function edGruppiBottone(box, ctx, nome) {
  const b = el('div', 'ed-azioni');
  edBottone(b, 'Groups', '', () => apriGruppi(ctx, nome, null));
  box.appendChild(b);
}

/* --- un workout nuovo --------------------------------------------------- */

function edPagNuovo(box, ctx) {
  const f = edFonte(ctx);
  edDove(box, ctx);
  edTitolo(box, 'New workout', 'Give it a name, then write it on the days in Week.');
  const errore = el('p', 'nota err');
  errore.hidden = true;
  const inp = edCampo(box, 'Name', '', { max: 60, ph: 'e.g. CALI' }, () => {});
  box.appendChild(errore);
  const az = el('div', 'ed-azioni');
  /* Invio nel campo vale come Create */
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); crea.click(); } });
  const crea = edBottone(az, 'Create', 'ed-ok', () => {
    const nome = inp.value.slice(0, 60).trim();
    const msg = !nome ? 'Write a name first.'
      : f.schede[nome] || edWorkout(f).indexOf(nome) >= 0 ? 'There is already a workout called "' + nome + '".' : '';
    if (msg) { errore.textContent = msg; errore.hidden = false; inp.focus(); return; }
    f.schede[nome] = { es: [['', '', [], '', '']], rec: '' };
    edVista = { pag: 'workout', ctx: ctx, nome: nome };
    edCambio(true);
    edRidisegna();
  });
  box.appendChild(az);
  setTimeout(() => inp.focus(), 50);
}

/* --- le preparazioni ---------------------------------------------------- */

/* Le date di una preparazione vanno bene? Torna il problema, o ''. */
function edDateOk(dal, al, id) {
  if (!dataOk(dal) || !dataOk(al)) return 'Choose both dates.';
  if (al < dal) return 'The end is before the start.';
  const altra = tstore.prep.find(p => p.id !== id && p.dal <= al && dal <= p.al);
  if (altra) return 'These dates overlap "' + nomePrep(altra) + '" (' + datePrep(altra) + ').';
  return '';
}

/* Una preparazione nuova: una copia del piano di sempre, settimana, schede e
   FIRST 15', che poi si cambia. */
function edNuovaPrep(nome, dal, al) {
  const p = {
    id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nome: nome, dal: dal, al: al,
    settimane: [{ workout: copia(tstore.workout), conti: copia(tstore.conti) }],
    schede: copia(tstore.schede),
    mattina: tstore.mattina, mattinaVia: tstore.mattinaVia
  };
  tstore.prep.push(p);
  tstore.prep.sort((a, b) => a.dal < b.dal ? -1 : 1);
  return p;
}

function edPagNuovaPrep(box) {
  edTitolo(box, 'Add preparation', 'Choose the dates: the preparation starts as a copy of the plan, then you change what changes. In those days the app shows the preparation; the day after the end, the plan comes back by itself.');
  const k0 = chiaveData(today());
  const nome = edCampo(box, 'Name (optional)', '', { max: 50, ph: 'e.g. Exam November' }, () => {});
  const dal = edCampo(box, 'From', k0, { type: 'date' }, () => {});
  const al = edCampo(box, 'To', chiaveData(piuGiorni(today(), 27)), { type: 'date' }, () => {});
  const errore = el('p', 'nota err');
  errore.hidden = true;
  box.appendChild(errore);
  const az = el('div', 'ed-azioni');
  edBottone(az, 'Create preparation', 'ed-ok', () => {
    const msg = edDateOk(dal.value, al.value, null);
    if (msg) { errore.textContent = msg; errore.hidden = false; return; }
    const p = edNuovaPrep(nome.value.slice(0, 50).trim(), dal.value, al.value);
    edVista = { pag: 'prep', ctx: p.id };
    edCambio(true);
    edRidisegna();
  });
  box.appendChild(az);
}

function edPagPrep(box, id) {
  const f = edFonte(id);
  const p = f.prep;
  const k0 = chiaveData(today());
  edDove(box, id);
  const stato = p.al < k0 ? 'Ended.' : p.dal <= k0 ? 'In progress: the app shows it now.' : 'Starts in ' + giorniFra(k0, p.dal) + ' days.';
  edTitolo(box, nomePrep(p), stato);

  const errore = el('p', 'nota err');
  errore.hidden = true;
  edCampo(box, 'Name', p.nome, { max: 50, ph: 'Preparation' }, (val) => {
    p.nome = val.slice(0, 50).trim();
    edCambio(true);
    edPagina();
  });
  const dal = edCampo(box, 'From', p.dal, { type: 'date' }, () => cambiaDate());
  const al = edCampo(box, 'To', p.al, { type: 'date' }, () => cambiaDate());
  box.appendChild(errore);
  function cambiaDate() {
    const msg = edDateOk(dal.value, al.value, p.id);
    if (msg) { errore.textContent = msg; errore.hidden = false; dal.value = p.dal; al.value = p.al; return; }
    p.dal = dal.value; p.al = al.value;
    tstore.prep.sort((a, b) => a.dal < b.dal ? -1 : 1);
    edCambio(true);
    edPagina();
  }

  /* le settimane: quante ne tocca il periodo, e quante sono scritte */
  const tot = settimaneDel(p);
  box.appendChild(el('p', 'ed-sez-pag', 'WEEKS'));
  box.appendChild(el('p', 'ed-sotto', 'The period touches ' + tot + (tot === 1 ? ' week' : ' weeks') +
    ' (Monday to Sunday). Written: ' + p.settimane.length + '.' +
    (p.settimane.length < tot ? ' The last one repeats until the end.' : '')));
  const lista = el('div', 'ed-lista-sett');
  p.settimane.forEach((w, i) => {
    const inizio = piuGiorni(lunedi(daChiave(p.dal)), 7 * i);
    const b = el('button', 'ed-voce', 'Week ' + (i + 1) + ' · ' + dataCorta(chiaveData(inizio)) + ' – ' + dataCorta(chiaveData(piuGiorni(inizio, 6))));
    b.type = 'button';
    b.addEventListener('click', () => edVai({ pag: 'week', ctx: id, sett: i }));
    lista.appendChild(b);
  });
  box.appendChild(lista);
  const az1 = el('div', 'ed-azioni');
  edBottone(az1, '+ Add week (copy of week ' + p.settimane.length + ')', '', () => {
    p.settimane.push(copia(p.settimane[p.settimane.length - 1]));
    edVista = { pag: 'week', ctx: id, sett: p.settimane.length - 1 };
    edCambio(true);
    edRidisegna();
  });
  box.appendChild(az1);

  const az2 = el('div', 'ed-azioni');
  edBottone(az2, 'Duplicate', '', () => {
    /* la copia parte il giorno dopo la fine, e dura uguale */
    const durata = giorniFra(p.dal, p.al);
    const dal2 = chiaveData(piuGiorni(daChiave(p.al), 1));
    const al2 = chiaveData(piuGiorni(daChiave(dal2), durata));
    const msg = edDateOk(dal2, al2, null);
    if (msg) { errore.textContent = 'The copy would start on ' + dataCorta(dal2) + ': ' + msg; errore.hidden = false; return; }
    const q = copia(p);
    q.id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    q.nome = (p.nome || 'Preparation') + ' (copy)';
    q.dal = dal2; q.al = al2;
    tstore.prep.push(q);
    tstore.prep.sort((a, b) => a.dal < b.dal ? -1 : 1);
    edVista = { pag: 'prep', ctx: q.id };
    edCambio(true);
    edRidisegna();
  });
  edConferma(az2, 'Delete preparation', () => {
    tstore.prep = tstore.prep.filter(x => x.id !== p.id);
    edVista = { pag: 'week', ctx: 'base', sett: 0 };
    edCambio(true);
    edRidisegna();
  });
  box.appendChild(az2);
}

/* Girando il telefono o allargando la finestra l'editor cambia forma. */
if (stretto.addEventListener) stretto.addEventListener('change', () => { if (!stretto.matches) edInPagina = true; edRidisegna(); });
