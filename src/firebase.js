import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { browserLocalPersistence, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth, FIREBASE_LOGIN_EMAIL } from "./firebase";
import { agentStore, customerStore, phoneStore, quotationStore, templateStore } from "./firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB3wz0Ec6iAiPlHUbrSSTdWk0bjSbYhDMk",
  authDomain: "follow-up-ae9fc.firebaseapp.com",
  projectId: "follow-up-ae9fc",
  storageBucket: "follow-up-ae9fc.firebasestorage.app",
  messagingSenderId: "47122306008",
  appId: "1:47122306008:web:cbb2c1ea49ae59eb9518ad",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const FIREBASE_LOGIN_EMAIL = "ams@quotation-app.local";
export { EmailAuthProvider, reauthenticateWithCredential };