import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Single admin-SDK init shared by all function modules. Importing this before
// any getFirestore() call guarantees the app is initialized first.
initializeApp();
export const db = getFirestore();
