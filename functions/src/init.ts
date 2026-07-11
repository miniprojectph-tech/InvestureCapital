import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Single admin-SDK init shared by all function modules. Importing this before
// any getFirestore() call guarantees the app is initialized first.
initializeApp();

// Default database (us-central) — users, economy, transactions, match history.
export const db = getFirestore();

// Secondary Firestore in asia-southeast1 (Singapore) — only holds the hot,
// per-move Tongits game state so writes/reads happen next to Filipino players
// instead of round-tripping to Iowa. Match history and user economy stay on
// the default database.
export const gameDb = getFirestore("game-live-asia");
