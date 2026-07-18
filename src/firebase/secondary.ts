
'use client';

import { initializeApp, getApps } from "firebase/app";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";

const secondaryFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_SECONDARY_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_SECONDARY_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_SECONDARY_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_SECONDARY_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_SECONDARY_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_SECONDARY_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_SECONDARY_FIREBASE_MEASUREMENT_ID
};

function getSecondaryFirestore() {
  const appName = "secondary-orders-app";
  const apps = getApps();
  let app = apps.find(a => a.name === appName);
  
  if (!app) {
    app = initializeApp(secondaryFirebaseConfig, appName);
  }
  
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (e) {
    return getFirestore(app);
  }
}

export const secondaryDb = getSecondaryFirestore();
