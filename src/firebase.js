import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

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