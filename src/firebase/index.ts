
'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  Firestore
} from 'firebase/firestore'

/**
 * Initializes the Firebase SDKs.
 * Strictly uses the provided firebaseConfig to ensure all devices point to the same project.
 */
export function initializeFirebase() {
  const apps = getApps();
  // Check for the default app instance
  let app = apps.find(app => app.name === '[DEFAULT]');

  if (!app) {
    try {
      // Always initialize with the explicit config to prevent environment mismatches
      app = initializeApp(firebaseConfig);
    } catch (e) {
      console.error('Firebase initialization failed:', e);
      // Final fallback to no-arg initialization if config is missing (unlikely in this env)
      app = initializeApp();
    }
  }

  return getSdks(app);
}

/**
 * Sets up and returns the specialized SDK instances.
 * Configures persistent local cache for offline support and multi-tab sync.
 */
export function getSdks(firebaseApp: FirebaseApp) {
  let firestore: Firestore;
  
  try {
    // Attempt to initialize with persistence and multi-tab support
    firestore = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ 
        tabManager: persistentMultipleTabManager() 
      })
    });
  } catch (e: any) {
    // If firestore was already initialized, just get the existing instance
    firestore = getFirestore(firebaseApp);
  }

  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
