import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFunctions, type Functions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;
let functions: Functions | undefined;

function getFirebase() {
  if (!firebaseConfig.apiKey) {
    // Allow the prototype to run without Firebase keys for design/preview.
    return { app: undefined, auth: undefined, db: undefined, storage: undefined, functions: undefined };
  }
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig);
    // App Check (optional). Only initializes when a reCAPTCHA v3 site key is
    // provided — needed if App Check is *enforced* on Cloud Storage/Firestore.
    // Inert (no-op) when the env var is unset, so behaviour is unchanged today.
    const appCheckKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_KEY;
    if (typeof window !== "undefined" && appCheckKey) {
      try {
        if (process.env.NODE_ENV !== "production") {
          // Lets localhost obtain a debug token (register it in the App Check console).
          (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
            process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG || true;
        }
        initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(appCheckKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch {
        // App Check is optional — never block the app if it fails to init.
      }
    }
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app);
  }
  return { app, auth, db, storage, functions };
}

export { getFirebase };
