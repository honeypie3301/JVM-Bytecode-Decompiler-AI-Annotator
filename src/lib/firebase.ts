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
    const payload: Record<string, any> = {
      fileName: data.fileName || "unknown.class",
      className: data.className || "UnknownClass",
      fileSize: typeof data.fileSize === "number" ? data.fileSize : 0,
      flagged: Boolean(data.flagged),
      clientToken: data.clientToken || "10.84.x.x",
      timestamp: data.timestamp || new Date().toLocaleTimeString(),
      createdAt: Date.now()
    };

    if (data.reason) {
      payload.reason = data.reason;
    }

    await addDoc(collection(db, TELEMETRY_COLLECTION), payload);
  } catch (error) {
    console.error("Failed to log global telemetry event to Firebase:", error);
  }
}

/**
 * Log a new visitor session launch / page visit event
 */
export async function logVisitorSession() {
  const randomOctet1 = Math.floor(Math.random() * 200) + 10;
  const randomOctet2 = Math.floor(Math.random() * 255);
  
  await logTelemetryEvent({
    fileName: "VISITOR_SESSION_INIT",
    className: "GlobalWebVisitor",
    fileSize: 0,
    flagged: false,
    reason: "New browser window / incognito session connected to live decompiler",
    clientToken: `10.84.${randomOctet1}.${randomOctet2}`,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  });
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
