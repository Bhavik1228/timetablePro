import { getApp, getApps, initializeApp } from "firebase/app";
import type { FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
};

let cachedServices: FirebaseServices | undefined;
let persistencePromise: Promise<void> | undefined;

export function isFirebaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID,
  );
}

export function getFirebaseServices(): FirebaseServices {
  if (cachedServices) return cachedServices;

  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId:
      import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
  };

  const missing = [
    ["VITE_FIREBASE_API_KEY", config.apiKey],
    ["VITE_FIREBASE_AUTH_DOMAIN", config.authDomain],
    ["VITE_FIREBASE_PROJECT_ID", config.projectId],
    ["VITE_FIREBASE_APP_ID", config.appId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Firebase is not configured. Missing: ${missing.join(", ")}. ` +
        "Set these values in src/.env (see .env.example) and restart the dev server.",
    );
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(config);

  cachedServices = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };

  return cachedServices;
}

export function ensureAuthPersistence(): Promise<void> {
  if (!persistencePromise) {
    persistencePromise = setPersistence(
      getFirebaseServices().auth,
      browserLocalPersistence,
    ).catch((error: unknown) => {
      persistencePromise = undefined;
      throw error;
    });
  }

  return persistencePromise;
}
