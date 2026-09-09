import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

export const firebaseConfig = {
  apiKey: "AIzaSyAXrIRQmhgRkHOpZawe58KNNEM7detObCs",
  authDomain: "house-crm-pos-venda.firebaseapp.com",
  projectId: "house-crm-pos-venda",
  storageBucket: "house-crm-pos-venda.firebasestorage.app",
  messagingSenderId: "776821627496",
  appId: "1:776821627496:web:8ee8d44702620560c5b9dd",
};

// Initialize Firebase client-side singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
