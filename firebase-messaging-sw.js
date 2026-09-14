// ============================================================
// SERVICE WORKER — riceve le notifiche push anche ad app chiusa
// Deve avere lo STESSO firebaseConfig usato in script.js.
// Se in futuro cambi progetto Firebase, aggiorna questo file allo
// stesso modo in cui aggiorni script.js.
// ============================================================
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

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
const app = initializeApp(firebaseConfig);
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
