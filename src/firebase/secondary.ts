'use client';

import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Secondary Firebase Project Configuration (course-registration-cce07)
// Updated with user-provided credentials
const secondaryFirebaseConfig = {
  apiKey: "AIzaSyCOTBiGBKbvXQYK1YE4tBVupjiPACDpN0Y",
  authDomain: "course-registration-cce07.firebaseapp.com",
  projectId: "course-registration-cce07",
  storageBucket: "course-registration-cce07.firebasestorage.app",
  messagingSenderId: "117088413094",
  appId: "1:117088413094:web:7016dd7e9de57071f65b67",
  measurementId: "G-VRXBGQ3WN5"
};

/**
 * Initializes and returns the secondary Firestore instance.
 * Uses a unique app name to avoid conflict with the primary [DEFAULT] app.
 */
function getSecondaryFirestore() {
  const appName = "secondary-orders-app";
  const apps = getApps();
  let app = apps.find(a => a.name === appName);
  
  if (!app) {
    app = initializeApp(secondaryFirebaseConfig, appName);
  }
  
  return getFirestore(app);
}

export const secondaryDb = getSecondaryFirestore();
