import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDojgJyYimzkh5Bj1Ou241aMmTm2RI_S-Y",
  authDomain: "vastraaos.firebaseapp.com",
  projectId: "vastraaos",
  storageBucket: "vastraaos.firebasestorage.app",
  messagingSenderId: "876203084364",
  appId: "1:876203084364:web:62aa43b77d8647ed0e02e9",
  // measurementId: ""
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
const storage = getStorage(app);

export { app, auth, db, storage };
