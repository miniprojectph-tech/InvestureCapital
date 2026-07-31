import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Single admin-SDK init shared by all function modules. Importing this before
// any getFirestore() call guarantees the app is initialized first.
// databaseURL wires the Realtime Database (Color Game live state) — set the
// COLOR_RTDB_URL env var (functions/.env) to your RTDB instance URL.
initializeApp({ databaseURL: process.env.COLOR_RTDB_URL });

// Default database (us-central) — users, economy, transactions, match history.
export const db = getFirestore();

// Secondary Firestore in asia-southeast1 (Singapore) — only holds the hot,
// per-move Tongits game state so writes/reads happen next to Filipino players
// instead of round-tripping to Iowa. Match history and user economy stay on
// the default database.
export const gameDb = getFirestore("game-live-asia");
