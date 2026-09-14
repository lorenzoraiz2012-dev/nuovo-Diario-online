// ============================================================
// SERVICE WORKER — riceve le notifiche push anche ad app chiusa
// Deve avere lo STESSO firebaseConfig usato in script.js.
// Se in futuro cambi progetto Firebase, aggiorna questo file allo
// stesso modo in cui aggiorni script.js.
// ============================================================
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBLPEAIdG8yHTkhlxCg84kgXTbORK7GG2w',
  authDomain: 'diario-scolastico-cfd88.firebaseapp.com',
  projectId: 'diario-scolastico-cfd88',
  storageBucket: 'diario-scolastico-cfd88.firebasestorage.app',
  messagingSenderId: '826560545383',
  appId: '1:826560545383:web:aa9471e480f1d7aa9bcac2'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const titolo = (payload.notification && payload.notification.title) || 'Nuovo Diario Online';
  const corpo = (payload.notification && payload.notification.body) || '';
  self.registration.showNotification(titolo, {
    body: corpo,
    icon: 'icon-192.png',
    badge: 'icon-192.png'
  });
});
