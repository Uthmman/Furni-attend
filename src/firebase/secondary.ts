'use client';

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Secondary Firebase Project Configuration (course-registration-cce07)
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
 * Uses a unique app name to avoid conflict with the primary app.
 */
function getSecondaryFirestore() {
  const appName = "secondary-orders-app";
  let app;
  
  if (!getApps().find(a => a.name === appName)) {
    app = initializeApp(secondaryFirebaseConfig, appName);
  } else {
    app = getApp(appName);
  }
  
  return getFirestore(app);
}

export const secondaryDb = getSecondaryFirestore();
