/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit
} from "firebase/firestore";
import localFirebaseConfig from "../../firebase-applet-config.json";

// Support both environment variables (for production deployments like Vercel/GitHub Actions)
// and local applet config file
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || localFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || localFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || localFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || localFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || localFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || localFirebaseConfig.appId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || localFirebaseConfig.firestoreDatabaseId,
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore with specific database ID from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
export const auth = getAuth(app);

export interface FirestoreTelemetryLog {
  id?: string;
  fileName: string;
  className: string;
  fileSize: number;
  flagged: boolean;
  reason?: string;
  clientToken: string;
  timestamp: string;
  createdAt: number;
}

const TELEMETRY_COLLECTION = "telemetry_logs";

/**
 * Send a new telemetry event to global Firebase database
 */
export async function logTelemetryEvent(data: Omit<FirestoreTelemetryLog, "createdAt">) {
  try {
    await addDoc(collection(db, TELEMETRY_COLLECTION), {
      ...data,
      createdAt: Date.now()
    });
  } catch (error) {
    console.error("Failed to log global telemetry event to Firebase:", error);
  }
}

/**
 * Subscribe to real-time global telemetry logs
 */
export function subscribeToTelemetry(
  callback: (logs: FirestoreTelemetryLog[]) => void,
  maxItems = 50
) {
  const q = query(
    collection(db, TELEMETRY_COLLECTION),
    orderBy("createdAt", "desc"),
    limit(maxItems)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const logs: FirestoreTelemetryLog[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<FirestoreTelemetryLog, "id">)
      }));
      callback(logs);
    },
    (error) => {
      console.error("Firebase Telemetry Feed subscription error:", error);
    }
  );
}
