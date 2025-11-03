/*
client/src/firebase.js
---
MODIFIED:
- Wrapped `getAnalytics` in `isSupported()` check to
  prevent errors and warnings in test environments (JSDOM).
*/

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics'; // <-- Import isSupported
import { getFunctions, httpsCallable } from 'firebase/functions'; // Added getFunctions and httpsCallable

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID, // Added this
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app); // Added this

// --- NEW: Conditionally initialize Analytics ---
let analytics;
// This promise-based check prevents crashes in test environments
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});
export { analytics };
// --- END NEW ---


// --- Create helper exports for our new Cloud Functions ---
export const generateContractV2 = httpsCallable(functions, 'generateContractV2');

