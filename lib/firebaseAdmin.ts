// lib/firebaseAdmin.ts
import admin from "firebase-admin";

function getPrivateKey() {
  const pk = process.env.FIREBASE_PRIVATE_KEY;
  if (!pk) return undefined;

  // Soporta que venga con \n escapados
  return pk.replace(/\\n/g, "\n");
}

function ensureEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// Evita inicializar más de una vez (hot reload + serverless)
const app =
  admin.apps.length > 0
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert({
          projectId: ensureEnv("FIREBASE_PROJECT_ID"),
          clientEmail: ensureEnv("FIREBASE_CLIENT_EMAIL"),
          privateKey: getPrivateKey() || ensureEnv("FIREBASE_PRIVATE_KEY"),
        }),
      });

export const adminApp = app;
export const adminDb = admin.firestore();