import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Substitua pelas suas credenciais geradas no passo 3
const firebaseConfig = {
  apiKey: "AIzaSyCjGW3aZm9EVPUze0d-uhcilL45OFhedRE",
  authDomain: "listateste-6ae7f.firebaseapp.com",
  projectId: "listateste-6ae7f",
  storageBucket: "listateste-6ae7f.firebasestorage.app",
  messagingSenderId: "902566685232",
  appId: "1:902566685232:web:fe0c03174d8740ff689bf5"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);