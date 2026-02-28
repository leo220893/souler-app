import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const keyPath = path.join(process.cwd(), "serviceAccountKey.json");

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    fs.readFileSync(keyPath, "utf8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const adminDb = admin.firestore();