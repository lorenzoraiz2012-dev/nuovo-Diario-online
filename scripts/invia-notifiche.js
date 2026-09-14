// ============================================================
// INVIA NOTIFICHE — gira una volta al giorno via GitHub Actions
// Non serve il piano Blaze: Firebase Cloud Messaging è gratuito
// anche sul piano Spark, qui giriamo solo lo "scheduler" fuori
// da Firebase, su GitHub Actions (anche quello gratuito).
// ============================================================
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
const databaseURL = process.env.FIREBASE_DATABASE_URL;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL
});

const db = admin.database();
const ROOT = 'studenti';
const LINK_APP = 'https://lorenzoraiz2012-dev.github.io/nuovo-Diario-online/';

function oggiISO() {
  return new Date().toISOString().split('T')[0];
}
function domaniISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

async function main() {
  const snap = await db.ref(ROOT).once('value');
  const studenti = snap.val() || {};
  const oggi = oggiISO();
  const domani = domaniISO();
  let totaleInviate = 0;

  for (const [uid, dati] of Object.entries(studenti)) {
    const impostazioni = dati.impostazioni || {};
    if (!impostazioni.notificheAttive) continue;

    const tokenMap = dati.fcmTokens || {};
    const tokens = Object.values(tokenMap);
    if (!tokens.length) continue;

    const materie = dati.materie || {};
    const diario = dati.diario || {};

    const scadenze = [];
    for (const item of Object.values(diario)) {
      if (item.tipo === 'Evento') continue;
      if (item.tipo === 'Compito' && item.completato) continue;
      if ((item.tipo === 'Verifica' || item.tipo === 'Interrogazione') && item.preparato) continue;
      if (item.data !== oggi && item.data !== domani) continue;
      const nomeMateria = (materie[item.materiaId] && materie[item.materiaId].nome) || 'una materia';
      const quando = item.data === oggi ? 'oggi' : 'domani';
      scadenze.push(`${item.tipo} di ${nomeMateria} (${quando})`);
    }

    if (!scadenze.length) continue;

    const titolo = scadenze.length === 1 ? 'Hai una scadenza in arrivo' : `Hai ${scadenze.length} scadenze in arrivo`;
    const corpo = scadenze.slice(0, 3).join(' · ') + (scadenze.length > 3 ? '…' : '');

    try {
      const risposta = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: titolo, body: corpo },
        webpush: { fcmOptions: { link: LINK_APP } }
      });
      totaleInviate += risposta.successCount;

      const chiaviDaRimuovere = [];
      const voci = Object.entries(tokenMap);
      risposta.responses.forEach((r, i) => {
        if (!r.success && r.error && r.error.code === 'messaging/registration-token-not-registered') {
          const tokenNonValido = tokens[i];
          const voce = voci.find(([, v]) => v === tokenNonValido);
          if (voce) chiaviDaRimuovere.push(voce[0]);
        }
      });
      for (const chiave of chiaviDaRimuovere) {
        await db.ref(`${ROOT}/${uid}/fcmTokens/${chiave}`).remove();
      }
    } catch (e) {
      console.error(`Errore invio per utente ${uid}:`, e.message);
    }
  }

  console.log(`Notifiche inviate con successo: ${totaleInviate}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
