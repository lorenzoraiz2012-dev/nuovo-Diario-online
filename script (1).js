// ============================================================
// DIARIO SUPERIORI — v1.0
// ============================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, deleteUser, reauthenticateWithCredential, EmailAuthProvider,
  updatePassword
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getDatabase, ref, get, set, push, onValue, update, remove
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// ── CONFIGURAZIONE FIREBASE ──────────────────────────────────
// Puoi riusare lo stesso progetto Firebase della vecchia app: i dati
// vivono in un nodo radice diverso ("studenti") quindi non si mescolano
// con quelli del vecchio Diario ("utenti"). Ricorda di:
//  1. Abilitare "Email/Password" in Authentication > Sign-in method
//  2. Aggiornare le regole del Realtime Database (vedi database.rules.json)
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBMNlet3_yKvVvTyRLY-1Cr7LyVICUwZuo",
  authDomain: "nuovo-diario-online.firebaseapp.com",
  databaseURL: "https://nuovo-diario-online-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "nuovo-diario-online",
  storageBucket: "nuovo-diario-online.firebasestorage.app",
  messagingSenderId: "737251318034",
  appId: "1:737251318034:web:670b4feabfc1ab11fd7bcb"
};

// Initialize Firebase
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getDatabase(fbApp);
const ROOT = 'studenti';

// ── PRESET MATERIE PER INDIRIZZO ─────────────────────────────
const BASE_COMUNI = ['Italiano', 'Storia', 'Lingua e Cultura Inglese', 'Matematica', 'Scienze Motorie e Sportive', 'Educazione Civica', 'Religione / Att. Alternativa'];
const MATERIE_PRESETS = {
  'Liceo Scientifico': [...BASE_COMUNI, 'Latino', 'Fisica', 'Scienze Naturali', 'Disegno e Storia dell\'Arte', 'Filosofia'],
  'Liceo Scientifico (Scienze Applicate)': [...BASE_COMUNI, 'Fisica', 'Scienze Naturali', 'Informatica', 'Disegno e Storia dell\'Arte', 'Filosofia'],
  'Liceo Classico': [...BASE_COMUNI, 'Latino', 'Greco', 'Filosofia', 'Storia dell\'Arte'],
  'Liceo Linguistico': [...BASE_COMUNI, 'Seconda Lingua Straniera', 'Terza Lingua Straniera', 'Filosofia', 'Storia dell\'Arte'],
  'Liceo delle Scienze Umane': [...BASE_COMUNI, 'Scienze Umane', 'Diritto ed Economia', 'Filosofia', 'Storia dell\'Arte'],
  'Liceo Artistico': [...BASE_COMUNI, 'Discipline Pittoriche/Plastiche', 'Storia dell\'Arte', 'Filosofia', 'Chimica'],
  'Liceo Musicale': [...BASE_COMUNI, 'Storia della Musica', 'Teoria Analisi e Composizione', 'Esecuzione e Interpretazione', 'Tecnologie Musicali'],
  'Istituto Tecnico Economico': [...BASE_COMUNI, 'Economia Aziendale', 'Diritto ed Economia', 'Seconda Lingua Straniera', 'Informatica'],
  'Istituto Tecnico Tecnologico': [...BASE_COMUNI, 'Informatica', 'Sistemi e Reti', 'Tecnologie e Progettazione', 'Fisica', 'Chimica'],
  'Istituto Professionale': [...BASE_COMUNI, 'Laboratori Tecnico-Professionali', 'Tecnologie', 'Diritto ed Economia'],
  'Personalizzato': []
};
const INDIRIZZI = Object.keys(MATERIE_PRESETS);

// ── COLORI (dot materie) ─────────────────────────────────────
const DOT_COLORS = ['#1E3A5F', '#8B5E34', '#3F6B4F', '#7C3F61', '#1F6F78', '#6B5B95', '#A15C2E', '#4B5563', '#8A6D3B', '#2E6F6E'];
function hashColor(str) {
  let h = 0;
  for (const c of str) h = (h << 5) - h + c.charCodeAt(0);
  return DOT_COLORS[Math.abs(h) % DOT_COLORS.length];
}

// ── STATO GLOBALE ─────────────────────────────────────────────
let currentUser = null;
let profilo = {};
let materieMap = {};
let diarioData = {};
let votiData = {};
let archivioData = {};
let cartelleEspanse = new Set();
let searchQuery = '';
let activeFilter = 'tutti';
let selectedIndirizzo = null;
let unsubListeners = [];
let notificaTimer = null;

// ── UTILITÀ ────────────────────────────────────────────────────
const MONTHS_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
function todayISO() { return new Date().toISOString().split('T')[0]; }
function tomorrowISO() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }
function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS_IT[parseInt(m) - 1]} ${y}`;
}
function getMediaClass(v) {
  if (v >= 8.5) return 'green';
  if (v >= 7) return 'blue';
  if (v >= 6) return 'yellow';
  return 'red';
}
function nomeMateria(id) {
  return (materieMap[id] && materieMap[id].nome) || 'Materia eliminata';
}
function authErrorIt(code) {
  const map = {
    'auth/user-not-found': 'Account non trovato. Controlla l\'email o registrati.',
    'auth/wrong-password': 'Password errata.',
    'auth/invalid-credential': 'Email o password non corrette.',
    'auth/invalid-email': 'Indirizzo email non valido.',
    'auth/email-already-in-use': 'Esiste già un account con questa email.',
    'auth/weak-password': 'La password deve avere almeno 6 caratteri.',
    'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',
    'auth/missing-password': 'Inserisci la password.',
  };
  return map[code] || 'Si è verificato un errore. Riprova.';
}
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError(id) { document.getElementById(id).classList.add('hidden'); }

// ── AUTENTICAZIONE ────────────────────────────────────────────
async function doLogin(email, password) {
  if (!email.trim() || !password) return 'Inserisci email e password.';
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
    return null;
  } catch (e) { return authErrorIt(e.code); }
}
async function doRegister(nome, email, password, password2) {
  if (!nome.trim() || !email.trim() || !password) return 'Compila tutti i campi.';
  if (password.length < 6) return 'La password deve avere almeno 6 caratteri.';
  if (password !== password2) return 'Le password non coincidono.';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await set(ref(db, `${ROOT}/${cred.user.uid}/profilo`), {
      nome: nome.trim(), email: email.trim(), createdAt: Date.now(), onboardingFatto: false
    });
    return null;
  } catch (e) { return authErrorIt(e.code); }
}

// ── OPERAZIONI DATABASE — MATERIE ────────────────────────────
async function addMateria(nome) {
  await push(ref(db, `${ROOT}/${currentUser.uid}/materie`), { nome: nome.trim() });
}
async function renameMateria(id, nome) {
  await update(ref(db, `${ROOT}/${currentUser.uid}/materie/${id}`), { nome: nome.trim() });
}
async function deleteMateria(id) {
  await remove(ref(db, `${ROOT}/${currentUser.uid}/materie/${id}`));
}
async function applyPreset(indirizzo) {
  const preset = MATERIE_PRESETS[indirizzo] || [];
  const esistenti = new Set(Object.values(materieMap).map(m => m.nome.toLowerCase()));
  const updates = {};
  for (const nome of preset) {
    if (!esistenti.has(nome.toLowerCase())) {
      const newRef = push(ref(db, `${ROOT}/${currentUser.uid}/materie`));
      updates[newRef.key] = { nome };
    }
  }
  if (Object.keys(updates).length) {
    await update(ref(db, `${ROOT}/${currentUser.uid}/materie`), updates);
  }
}

// ── OPERAZIONI DATABASE — DIARIO ─────────────────────────────
async function addDiarioItem(data) {
  await push(ref(db, `${ROOT}/${currentUser.uid}/diario`), { ...data, completato: false, preparato: false });
}
async function toggleDiario(id, field) {
  const cur = diarioData[id];
  await update(ref(db, `${ROOT}/${currentUser.uid}/diario/${id}`), { [field]: !cur[field] });
}
async function deleteDiarioItem(id) {
  await remove(ref(db, `${ROOT}/${currentUser.uid}/diario/${id}`));
}

// ── OPERAZIONI DATABASE — VOTI ────────────────────────────────
async function addVoto(materiaId, voto) {
  await push(ref(db, `${ROOT}/${currentUser.uid}/voti`), { materiaId, voto });
}
async function deleteVoto(id) {
  await remove(ref(db, `${ROOT}/${currentUser.uid}/voti/${id}`));
}

// ── OPERAZIONI DATABASE — ARCHIVIO ────────────────────────────
async function addCartella(nome) {
  await push(ref(db, `${ROOT}/${currentUser.uid}/archivio`), { nome: nome.trim(), createdAt: Date.now() });
}
async function renameCartella(id, nome) {
  await update(ref(db, `${ROOT}/${currentUser.uid}/archivio/${id}`), { nome: nome.trim() });
}
async function deleteCartella(id) {
  await remove(ref(db, `${ROOT}/${currentUser.uid}/archivio/${id}`));
}
async function salvaVotiInCartella(id) {
  const grouped = {};
  for (const v of Object.values(votiData)) {
    if (!grouped[v.materiaId]) grouped[v.materiaId] = [];
    grouped[v.materiaId].push(Number(v.voto));
  }
  const ids = Object.keys(grouped);
  if (!ids.length) { alert('Non hai ancora nessun voto da salvare in questo momento.'); return; }
  if (!confirm('Salvare i voti attuali in questa cartella? Se c\'erano già dei voti salvati qui, verranno sostituiti.')) return;
  const materieSnap = {};
  let sommaMedie = 0;
  for (const mid of ids) {
    const voti = grouped[mid];
    const media = voti.reduce((a, b) => a + b, 0) / voti.length;
    materieSnap[mid] = { nome: nomeMateria(mid), voti, media };
    sommaMedie += media;
  }
  await update(ref(db, `${ROOT}/${currentUser.uid}/archivio/${id}`), {
    materie: materieSnap, mediaGenerale: sommaMedie / ids.length, savedAt: Date.now()
  });
}
async function riavviaDiario() {
  if (!confirm('Questo cancella TUTTI i compiti, le verifiche, le interrogazioni, gli eventi e i voti dell\'anno corrente. Le cartelle archivio non vengono toccate. Continuare?')) return;
  await remove(ref(db, `${ROOT}/${currentUser.uid}/diario`));
  await remove(ref(db, `${ROOT}/${currentUser.uid}/voti`));
  alert('Diario riavviato: buon nuovo anno scolastico!');
}

// ── SINCRONIZZAZIONE ──────────────────────────────────────────
function subscribeAll() {
  const uid = currentUser.uid;
  unsubListeners.push(onValue(ref(db, `${ROOT}/${uid}/materie`), snap => {
    materieMap = snap.val() || {};
    renderMaterieSelects();
    renderMaterieList();
    renderHome();
    renderVoti();
  }));
  unsubListeners.push(onValue(ref(db, `${ROOT}/${uid}/diario`), snap => {
    diarioData = snap.val() || {};
    renderHome();
  }));
  unsubListeners.push(onValue(ref(db, `${ROOT}/${uid}/voti`), snap => {
    votiData = snap.val() || {};
    renderVoti();
  }));
  unsubListeners.push(onValue(ref(db, `${ROOT}/${uid}/archivio`), snap => {
    archivioData = snap.val() || {};
    renderArchivio();
  }));
  unsubListeners.push(onValue(ref(db, `${ROOT}/${uid}/impostazioni/notificheAttive`), snap => {
    const attivo = snap.val() === true;
    document.getElementById('toggle-notifiche').checked = attivo;
    if (attivo) avviaControlloScadenze(); else fermaControlloScadenze();
  }));
}
function unsubscribeAll() {
  unsubListeners.forEach(u => u());
  unsubListeners = [];
  fermaControlloScadenze();
  cartelleEspanse = new Set();
}

// ── RENDER: HOME ──────────────────────────────────────────────
function renderHome() {
  const t = todayISO();
  let todo = 0, done = 0;
  const items = [];
  for (const [id, item] of Object.entries(diarioData)) {
    const past = item.data < t;
    if (item.tipo === 'Compito') { item.completato ? done++ : todo++; }
    else if (item.tipo === 'Evento') { past ? done++ : todo++; }
    else { (item.preparato || past) ? done++ : todo++; }

    if (activeFilter !== 'tutti' && item.tipo !== activeFilter) continue;
    const q = searchQuery.toLowerCase();
    const materiaName = nomeMateria(item.materiaId).toLowerCase();
    if (q && !materiaName.includes(q) && !(item.note || '').toLowerCase().includes(q)) continue;
    if (item.tipo === 'Compito' && item.completato) continue;
    if (item.tipo !== 'Compito' && past) continue;
    items.push({ id, ...item });
  }
  items.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);

  document.getElementById('stat-todo').textContent = todo;
  document.getElementById('stat-done').textContent = done;

  const list = document.getElementById('diario-list');
  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state"><h3>Tutto pronto</h3><p>Nessun impegno in vista per questo filtro.</p></div>`;
    return;
  }
  list.innerHTML = items.map(buildCard).join('');
}

function buildCard(item) {
  const col = hashColor(nomeMateria(item.materiaId));
  const isC = item.tipo === 'Compito';
  const isPreparabile = item.tipo === 'Verifica' || item.tipo === 'Interrogazione';
  const fatto = isC ? item.completato : (isPreparabile ? item.preparato : false);

  const checkHtml = isC ? `
    <button class="checkbox-btn ${item.completato ? 'checked' : ''}" onclick="handleToggle('${item.id}','completato')" title="Segna come completato">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>` : isPreparabile ? `
    <button class="checkbox-btn square ${item.preparato ? 'checked' : ''}" onclick="handleToggle('${item.id}','preparato')" title="Segna come preparato">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>` : `
    <div class="event-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>`;

  return `
    <div class="diario-card ${fatto ? 'stato-fatto' : ''}" data-tipo="${item.tipo}">
      <div class="card-action">${checkHtml}</div>
      <div class="card-body">
        <div class="card-meta">
          <span class="materia-dot" style="background:${col}"></span>
          <span class="materia-name">${nomeMateria(item.materiaId)}</span>
          <span class="tipo-label">${item.tipo}</span>
        </div>
        <div class="card-desc ${item.completato ? 'completed-text' : ''}">${item.note || ''}</div>
        <div class="card-footer">
          <div class="card-date tnum">${fmtDate(item.data)}</div>
          <button class="btn-delete" onclick="handleDeleteDiario('${item.id}')" title="Elimina">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    </div>`;
}

// ── RENDER: VOTI ──────────────────────────────────────────────
function renderVoti() {
  const grouped = {};
  for (const [id, v] of Object.entries(votiData)) {
    if (!grouped[v.materiaId]) grouped[v.materiaId] = [];
    grouped[v.materiaId].push({ id, voto: Number(v.voto) });
  }
  const materiaIds = Object.keys(grouped).sort((a, b) => nomeMateria(a).localeCompare(nomeMateria(b)));
  const mediaEl = document.getElementById('media-generale');
  if (materiaIds.length === 0) {
    mediaEl.textContent = '—';
  } else {
    const totale = materiaIds.reduce((sum, mid) => {
      const voti = grouped[mid].map(v => v.voto);
      return sum + (voti.reduce((a, b) => a + b, 0) / voti.length);
    }, 0) / materiaIds.length;
    mediaEl.textContent = totale.toFixed(2);
  }
  const grid = document.getElementById('voti-grid');
  if (materiaIds.length === 0) {
    grid.innerHTML = `<div class="empty-state"><h3>Nessun voto</h3><p>Aggiungi il tuo primo voto qui sopra.</p></div>`;
    return;
  }
  grid.innerHTML = materiaIds.map(mid => {
    const voti = grouped[mid].map(v => v.voto);
    const media = voti.reduce((a, b) => a + b, 0) / voti.length;
    return `
      <div class="voto-card">
        <div class="voto-card-header">
          <span class="voto-materia-name">${nomeMateria(mid)}</span>
          <span class="voto-media tnum ${getMediaClass(media)}">${media.toFixed(2)}</span>
        </div>
        <div class="voti-chips">
          ${grouped[mid].map(e => `<span class="voto-chip tnum" onclick="handleDeleteVoto('${e.id}',${e.voto})">${e.voto}</span>`).join('')}
        </div>
      </div>`;
  }).join('');
}

// ── RENDER: ARCHIVIO ──────────────────────────────────────────
function renderArchivio() {
  const ids = Object.keys(archivioData).sort((a, b) => (archivioData[b].createdAt || 0) - (archivioData[a].createdAt || 0));
  const list = document.getElementById('cartelle-list');
  if (ids.length === 0) {
    list.innerHTML = `<div class="empty-state"><h3>Nessuna cartella</h3><p>Crea la tua prima cartella qui sopra per archiviare un anno scolastico.</p></div>`;
    return;
  }
  list.innerHTML = ids.map(buildCartellaCard).join('');
  list.querySelectorAll('.cartella-nome-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const nuovo = inp.value.trim();
      if (nuovo) renameCartella(inp.dataset.id, nuovo);
    });
  });
}

function buildCartellaCard(id) {
  const c = archivioData[id];
  const aperta = cartelleEspanse.has(id);
  const haVoti = c.materie && Object.keys(c.materie).length > 0;
  const mediaHtml = haVoti
    ? `<span class="cartella-media tnum ${getMediaClass(c.mediaGenerale)}">${c.mediaGenerale.toFixed(2)}</span>`
    : `<span class="cartella-media muted">vuota</span>`;
  const dataCreazione = new Date(c.createdAt || Date.now()).toISOString().split('T')[0];
  const dataSalvataggio = c.savedAt ? new Date(c.savedAt).toISOString().split('T')[0] : null;

  let bodyHtml = '';
  if (aperta) {
    let contenuto;
    if (haVoti) {
      const idsM = Object.keys(c.materie).sort((a, b) => c.materie[a].nome.localeCompare(c.materie[b].nome));
      contenuto = `<div class="voti-grid">${idsM.map(mid => {
        const m = c.materie[mid];
        return `<div class="voto-card">
          <div class="voto-card-header">
            <span class="voto-materia-name">${m.nome}</span>
            <span class="voto-media tnum ${getMediaClass(m.media)}">${m.media.toFixed(2)}</span>
          </div>
          <div class="voti-chips">${m.voti.map(v => `<span class="voto-chip tnum">${v}</span>`).join('')}</div>
        </div>`;
      }).join('')}</div>`;
    } else {
      contenuto = `<p class="panel-hint">Nessun voto salvato in questa cartella per ora.</p>`;
    }
    bodyHtml = `
      <div class="cartella-body">
        ${contenuto}
        <div class="cartella-actions">
          <button class="btn btn-secondary" onclick="handleSalvaVoti('${id}')">Salva voti in questa cartella</button>
          ${haVoti ? `<button class="btn btn-secondary" onclick="handleScaricaCartellaPDF('${id}')">Scarica PDF</button>` : ''}
          <button class="btn btn-danger-outline" onclick="handleRiavviaDiario()">Riavvia diario</button>
          <button class="btn btn-text" onclick="handleDeleteCartella('${id}')">Elimina cartella</button>
        </div>
      </div>`;
  }

  return `
    <div class="cartella-card">
      <div class="cartella-header">
        <input type="text" class="cartella-nome-input" value="${c.nome}" data-id="${id}" />
        ${mediaHtml}
        <button class="cartella-toggle ${aperta ? 'open' : ''}" onclick="handleToggleCartella('${id}')" title="Espandi">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <div class="cartella-meta">Creata il ${fmtDate(dataCreazione)}${dataSalvataggio ? ' · voti salvati il ' + fmtDate(dataSalvataggio) : ''}</div>
      ${bodyHtml}
    </div>`;
}

// ── RENDER: MATERIE (select + impostazioni) ──────────────────
function renderMaterieSelects() {
  const ids = Object.keys(materieMap).sort((a, b) => materieMap[a].nome.localeCompare(materieMap[b].nome));
  const html = ids.length
    ? ids.map(id => `<option value="${id}">${materieMap[id].nome}</option>`).join('')
    : `<option value="">Nessuna materia — aggiungine una in Impostazioni</option>`;
  document.getElementById('form-materia').innerHTML = html;
  document.getElementById('voto-materia').innerHTML = html;
}
function renderMaterieList() {
  const ids = Object.keys(materieMap).sort((a, b) => materieMap[a].nome.localeCompare(materieMap[b].nome));
  const list = document.getElementById('materie-list');
  if (ids.length === 0) {
    list.innerHTML = `<p class="panel-hint">Non hai ancora nessuna materia.</p>`;
    return;
  }
  list.innerHTML = ids.map(id => `
    <div class="materia-row">
      <input type="text" value="${materieMap[id].nome}" data-id="${id}" class="materia-input" />
      <button class="btn-delete" onclick="handleDeleteMateria('${id}')" title="Elimina materia">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>`).join('');
  list.querySelectorAll('.materia-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const nuovo = inp.value.trim();
      if (nuovo) renameMateria(inp.dataset.id, nuovo);
    });
  });
}
function renderIndirizzoSelect() {
  const sel = document.getElementById('reset-indirizzo-select');
  sel.innerHTML = INDIRIZZI.filter(i => i !== 'Personalizzato').map(i => `<option value="${i}">${i}</option>`).join('');
}

// ── NOTIFICHE ─────────────────────────────────────────────────
function avviaControlloScadenze() {
  if (notificaTimer) return;
  controllaScadenze();
  notificaTimer = setInterval(controllaScadenze, 15 * 60 * 1000);
}
function fermaControlloScadenze() {
  if (notificaTimer) { clearInterval(notificaTimer); notificaTimer = null; }
}
function controllaScadenze() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const t = todayISO(), dom = tomorrowISO();
  const chiaveGiorno = `diario_notif_${t}`;
  const gia = new Set(JSON.parse(localStorage.getItem(chiaveGiorno) || '[]'));
  for (const [id, item] of Object.entries(diarioData)) {
    if (item.tipo === 'Evento') continue;
    if (item.tipo === 'Compito' && item.completato) continue;
    if ((item.tipo === 'Verifica' || item.tipo === 'Interrogazione') && item.preparato) continue;
    if ((item.data === t || item.data === dom) && !gia.has(id)) {
      const quando = item.data === t ? 'oggi' : 'domani';
      new Notification(`${item.tipo} di ${nomeMateria(item.materiaId)}`, {
        body: `Scade ${quando}: ${item.note || ''}`
      });
      gia.add(id);
    }
  }
  localStorage.setItem(chiaveGiorno, JSON.stringify([...gia]));
}

// ── EXPORT PDF ────────────────────────────────────────────────
function mediaGeneraleCorrente() {
  const grouped = {};
  for (const v of Object.values(votiData)) {
    if (!grouped[v.materiaId]) grouped[v.materiaId] = [];
    grouped[v.materiaId].push(Number(v.voto));
  }
  const ids = Object.keys(grouped);
  if (!ids.length) return null;
  const totale = ids.reduce((sum, mid) => {
    const voti = grouped[mid];
    return sum + (voti.reduce((a, b) => a + b, 0) / voti.length);
  }, 0) / ids.length;
  return { grouped, media: totale };
}

function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const margin = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(30, 58, 95);
  doc.text('Nuovo Diario Online', margin, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(100, 100, 100);
  doc.text(`${profilo.nome || ''} — esportato il ${fmtDate(todayISO())}`, margin, 25);

  let y = 34;
  const info = mediaGeneraleCorrente();

  // ── Sezione voti ──
  if (info) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(30, 58, 95);
    doc.text('Voti per materia', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(80, 80, 80);
    doc.text(`Media generale: ${info.media.toFixed(2)}`, 196, y, { align: 'right' });
    y += 4;

    const idsVoti = Object.keys(info.grouped).sort((a, b) => nomeMateria(a).localeCompare(nomeMateria(b)));
    const rowsVoti = idsVoti.map(mid => {
      const voti = info.grouped[mid];
      const media = voti.reduce((a, b) => a + b, 0) / voti.length;
      return [nomeMateria(mid), voti.join(' · '), media.toFixed(2)];
    });
    doc.autoTable({
      startY: y + 3,
      margin: { left: margin, right: margin },
      head: [['Materia', 'Voti', 'Media']],
      body: rowsVoti,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 95], fontSize: 9.5 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 2: { halign: 'right', cellWidth: 22 } }
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // ── Sezione impegni ──
  const items = Object.values(diarioData).sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
  if (items.length) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(30, 58, 95);
    doc.text('Impegni', margin, y);
    y += 4;

    const rowsImpegni = items.map(it => {
      const stato = it.tipo === 'Compito' ? (it.completato ? 'Completato' : 'Da fare')
        : it.tipo === 'Evento' ? '—' : (it.preparato ? 'Preparato' : 'Da preparare');
      return [fmtDate(it.data), it.tipo, nomeMateria(it.materiaId), it.note || '', stato];
    });
    doc.autoTable({
      startY: y + 3,
      margin: { left: margin, right: margin },
      head: [['Data', 'Tipo', 'Materia', 'Note', 'Stato']],
      body: rowsImpegni,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 95], fontSize: 9.5 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 3: { cellWidth: 62 } }
    });
  }

  if (!info && !items.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(120, 120, 120);
    doc.text('Nessun dato da esportare per ora.', margin, y);
  }

  doc.save(`nuovo-diario-online_${todayISO()}.pdf`);
}

function exportCartellaPDF(id) {
  const c = archivioData[id];
  if (!c) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const margin = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(30, 58, 95);
  doc.text('Nuovo Diario Online', margin, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text(`Archivio — ${c.nome}`, margin, 26);
  doc.setFontSize(9.5);
  doc.setTextColor(130, 130, 130);
  doc.text(`${profilo.nome || ''} — esportato il ${fmtDate(todayISO())}`, margin, 32);

  const haVoti = c.materie && Object.keys(c.materie).length > 0;
  let y = 42;
  if (haVoti) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(30, 58, 95);
    doc.text('Voti per materia', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(80, 80, 80);
    doc.text(`Media generale: ${c.mediaGenerale.toFixed(2)}`, 196, y, { align: 'right' });
    y += 4;
    const ids = Object.keys(c.materie).sort((a, b) => c.materie[a].nome.localeCompare(c.materie[b].nome));
    const rows = ids.map(mid => {
      const m = c.materie[mid];
      return [m.nome, m.voti.join(' · '), m.media.toFixed(2)];
    });
    doc.autoTable({
      startY: y + 3,
      margin: { left: margin, right: margin },
      head: [['Materia', 'Voti', 'Media']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 95], fontSize: 9.5 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 2: { halign: 'right', cellWidth: 22 } }
    });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(120, 120, 120);
    doc.text('Nessun voto salvato in questa cartella.', margin, y);
  }
  doc.save(`archivio_${c.nome.replace(/[^a-z0-9]/gi, '_')}.pdf`);
}

// ── HANDLERS GLOBALI ──────────────────────────────────────────
window.handleToggle = (id, field) => toggleDiario(id, field);
window.handleDeleteDiario = (id) => { if (confirm('Eliminare questo impegno?')) deleteDiarioItem(id); };
window.handleDeleteVoto = (id, voto) => { if (confirm(`Eliminare il voto ${voto}?`)) deleteVoto(id); };
window.handleDeleteMateria = (id) => { if (confirm('Eliminare questa materia? I voti e gli impegni collegati resteranno ma senza nome materia.')) deleteMateria(id); };
window.handleToggleCartella = (id) => { cartelleEspanse.has(id) ? cartelleEspanse.delete(id) : cartelleEspanse.add(id); renderArchivio(); };
window.handleDeleteCartella = (id) => { if (confirm('Eliminare questa cartella e tutti i voti salvati al suo interno? Non è recuperabile.')) deleteCartella(id); };
window.handleSalvaVoti = (id) => salvaVotiInCartella(id);
window.handleRiavviaDiario = () => riavviaDiario();
window.handleScaricaCartellaPDF = (id) => exportCartellaPDF(id);

// ── NAVIGAZIONE ───────────────────────────────────────────────
function showTab(tab) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelector('.tab-content').scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ── SCHERMATE ─────────────────────────────────────────────────
function renderOnboardingGrid() {
  const grid = document.getElementById('onboarding-grid');
  grid.innerHTML = INDIRIZZI.map(i => `<button type="button" class="indirizzo-card" data-indirizzo="${i}">${i}</button>`).join('');
  grid.querySelectorAll('.indirizzo-card').forEach(btn => {
    btn.onclick = () => {
      selectedIndirizzo = btn.dataset.indirizzo;
      grid.querySelectorAll('.indirizzo-card').forEach(b => b.classList.toggle('selected', b === btn));
      document.getElementById('btn-onboarding-conferma').disabled = false;
    };
  });
}
async function showOnboarding() {
  selectedIndirizzo = null;
  renderOnboardingGrid();
  document.getElementById('btn-onboarding-conferma').disabled = true;
  showScreen('onboarding-screen');
}
async function showApp() {
  document.getElementById('user-badge').textContent = profilo.nome || '';
  document.getElementById('account-nome').textContent = profilo.nome || '';
  document.getElementById('account-email').textContent = profilo.email || currentUser.email;
  renderIndirizzoSelect();
  document.getElementById('form-data').value = todayISO();
  showTab('home');
  showScreen('app-screen');
  subscribeAll();
}
function showAuth() {
  unsubscribeAll();
  showScreen('auth-screen');
}

// ── CICLO DI VITA AUTENTICAZIONE ─────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { currentUser = null; showAuth(); return; }
  currentUser = user;
  const snap = await get(ref(db, `${ROOT}/${user.uid}/profilo`));
  profilo = snap.val() || { nome: user.email.split('@')[0], email: user.email, onboardingFatto: false };
  if (!profilo.onboardingFatto) {
    await showOnboarding();
  } else {
    await showApp();
  }
});

// ── EVENTI UI ─────────────────────────────────────────────────
function initEvents() {
  // Switch login/registrazione
  document.getElementById('btn-to-register').onclick = () => {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.remove('hidden');
  };
  document.getElementById('btn-to-login').onclick = () => {
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('login-section').classList.remove('hidden');
  };

  // Login
  document.getElementById('btn-accedi').onclick = async () => {
    hideError('login-error');
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const err = await doLogin(email, password);
    if (err) showError('login-error', err);
  };
  document.getElementById('btn-reset-password').onclick = async () => {
    const email = document.getElementById('login-email').value.trim();
    if (!email) { showError('login-error', 'Inserisci prima la tua email qui sopra.'); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      hideError('login-error');
      alert('Ti abbiamo inviato una email per reimpostare la password.');
    } catch (e) { showError('login-error', authErrorIt(e.code)); }
  };

  // Registrazione
  document.getElementById('btn-crea').onclick = async () => {
    hideError('register-error');
    const nome = document.getElementById('reg-nome').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;
    const err = await doRegister(nome, email, password, password2);
    if (err) showError('register-error', err);
  };

  // Onboarding
  document.getElementById('btn-onboarding-conferma').onclick = async () => {
    if (!selectedIndirizzo) return;
    const btn = document.getElementById('btn-onboarding-conferma');
    btn.disabled = true; btn.textContent = 'Preparazione…';
    try {
      await update(ref(db, `${ROOT}/${currentUser.uid}/profilo`), { indirizzo: selectedIndirizzo, onboardingFatto: true });
      if (selectedIndirizzo !== 'Personalizzato') {
        materieMap = {};
        await applyPreset(selectedIndirizzo);
      }
      profilo.onboardingFatto = true;
      profilo.indirizzo = selectedIndirizzo;
      await showApp();
    } catch (e) {
      showError('onboarding-error', 'Errore durante la configurazione. Riprova.');
      btn.disabled = false; btn.textContent = 'Continua';
    }
  };

  // Logout
  document.getElementById('btn-logout').onclick = () => { if (confirm('Vuoi uscire?')) signOut(auth); };

  // Export
  document.getElementById('btn-export').onclick = exportPDF;

  // Navigazione tab (side-nav + bottom-nav condividono data-tab)
  document.querySelectorAll('.nav-btn').forEach(btn => { btn.onclick = () => showTab(btn.dataset.tab); });

  // Ricerca e filtri home
  document.getElementById('search-input').oninput = (e) => { searchQuery = e.target.value; renderHome(); };
  document.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
      activeFilter = chip.dataset.filter;
      document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
      renderHome();
    };
  });

  // Aggiungi impegno
  document.getElementById('add-form').onsubmit = async (e) => {
    e.preventDefault();
    hideError('add-error');
    const materiaId = document.getElementById('form-materia').value;
    if (!materiaId) { showError('add-error', 'Aggiungi prima una materia in Impostazioni.'); return; }
    const tipo = document.getElementById('form-tipo').value;
    const data = document.getElementById('form-data').value;
    const note = document.getElementById('form-note').value.trim();
    if (!data || !note) { showError('add-error', 'Compila data e note.'); return; }
    await addDiarioItem({ materiaId, tipo, data, note });
    document.getElementById('form-note').value = '';
    showTab('home');
  };

  // Aggiungi voto
  document.getElementById('voto-form').onsubmit = async (e) => {
    e.preventDefault();
    hideError('voto-error');
    const materiaId = document.getElementById('voto-materia').value;
    if (!materiaId) { showError('voto-error', 'Aggiungi prima una materia in Impostazioni.'); return; }
    const voto = parseFloat(document.getElementById('voto-value').value);
    if (!(voto >= 1 && voto <= 10)) { showError('voto-error', 'Inserisci un voto tra 1 e 10.'); return; }
    await addVoto(materiaId, voto);
    document.getElementById('voto-value').value = '';
  };

  // Archivio — nuova cartella
  document.getElementById('btn-aggiungi-cartella').onclick = () => {
    const inp = document.getElementById('nuova-cartella-input');
    const nome = inp.value.trim();
    if (!nome) return;
    addCartella(nome);
    inp.value = '';
  };
  document.getElementById('nuova-cartella-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-aggiungi-cartella').click(); }
  });

  // Inserisci — scorciatoie data
  document.querySelectorAll('#date-shortcuts .chip-sm').forEach(btn => {
    btn.onclick = () => {
      const giorni = parseInt(btn.dataset.shortcut, 10);
      const d = new Date();
      d.setDate(d.getDate() + giorni);
      document.getElementById('form-data').value = d.toISOString().split('T')[0];
      document.querySelectorAll('#date-shortcuts .chip-sm').forEach(b => b.classList.toggle('active', b === btn));
    };
  });

  // Impostazioni — materie
  document.getElementById('btn-aggiungi-materia').onclick = () => {
    const inp = document.getElementById('nuova-materia-input');
    const nome = inp.value.trim();
    if (!nome) return;
    addMateria(nome);
    inp.value = '';
  };
  document.getElementById('nuova-materia-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-aggiungi-materia').click(); }
  });
  document.getElementById('btn-applica-preset').onclick = () => {
    const indirizzo = document.getElementById('reset-indirizzo-select').value;
    applyPreset(indirizzo);
  };

  // Impostazioni — notifiche
  document.getElementById('toggle-notifiche').addEventListener('change', async (e) => {
    const attivare = e.target.checked;
    const statusEl = document.getElementById('notifiche-status');
    statusEl.classList.add('hidden');
    if (!attivare) {
      await update(ref(db, `${ROOT}/${currentUser.uid}/impostazioni`), { notificheAttive: false });
      return;
    }
    if (!('Notification' in window)) {
      e.target.checked = false;
      statusEl.textContent = 'Il tuo browser non supporta le notifiche.';
      statusEl.classList.remove('hidden', 'notice-error'); statusEl.classList.add('notice-error');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      e.target.checked = false;
      statusEl.textContent = 'Permesso negato. Puoi attivarlo dalle impostazioni del browser.';
      statusEl.classList.remove('hidden'); statusEl.classList.add('notice-error');
      return;
    }
    await update(ref(db, `${ROOT}/${currentUser.uid}/impostazioni`), { notificheAttive: true });
  });

  // Impostazioni — cambia password
  document.getElementById('password-form').onsubmit = async (e) => {
    e.preventDefault();
    hideError('pw-error');
    document.getElementById('pw-success').classList.add('hidden');
    const attuale = document.getElementById('pw-attuale').value;
    const nuova = document.getElementById('pw-nuova').value;
    const nuova2 = document.getElementById('pw-nuova2').value;
    if (!attuale || !nuova) { showError('pw-error', 'Compila tutti i campi.'); return; }
    if (nuova.length < 6) { showError('pw-error', 'La nuova password deve avere almeno 6 caratteri.'); return; }
    if (nuova !== nuova2) { showError('pw-error', 'Le password non coincidono.'); return; }
    try {
      const cred = EmailAuthProvider.credential(currentUser.email, attuale);
      await reauthenticateWithCredential(currentUser, cred);
      await updatePassword(currentUser, nuova);
      document.getElementById('password-form').reset();
      const successEl = document.getElementById('pw-success');
      successEl.textContent = 'Password aggiornata con successo.';
      successEl.classList.remove('hidden');
    } catch (e) { showError('pw-error', authErrorIt(e.code)); }
  };

  // Impostazioni — elimina account
  document.getElementById('btn-mostra-elimina').onclick = () => {
    document.getElementById('elimina-panel').classList.remove('hidden');
  };
  document.getElementById('btn-annulla-elimina').onclick = () => {
    document.getElementById('elimina-panel').classList.add('hidden');
    document.getElementById('elimina-password').value = '';
    hideError('elimina-error');
  };
  document.getElementById('btn-conferma-elimina').onclick = async () => {
    hideError('elimina-error');
    const password = document.getElementById('elimina-password').value;
    if (!password) { showError('elimina-error', 'Inserisci la password per confermare.'); return; }
    if (!confirm('Questa azione è definitiva e cancellerà tutti i tuoi dati. Continuare?')) return;
    try {
      const cred = EmailAuthProvider.credential(currentUser.email, password);
      await reauthenticateWithCredential(currentUser, cred);
      await remove(ref(db, `${ROOT}/${currentUser.uid}`));
      await deleteUser(currentUser);
    } catch (e) { showError('elimina-error', authErrorIt(e.code)); }
  };
}

// ── AVVIO ─────────────────────────────────────────────────────
initEvents();
