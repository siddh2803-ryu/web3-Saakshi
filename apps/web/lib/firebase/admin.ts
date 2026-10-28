/* eslint-disable */
import * as admin from "firebase-admin";

// Global in-memory storage fallback for local development and test environments
const inMemoryStore = (global as any).__saakshiStore || {
  users: new Map<string, any>(),
  captures: new Map<string, any>(),
  artifacts: new Map<string, any[]>(),
  watches: new Map<string, any>(),
  watchEvents: new Map<string, any[]>(),
  publicProofs: new Map<string, any>(),
  custody: new Map<string, any[]>(),
  shares: new Map<string, any>(),
  cases: new Map<string, any>(),
  locks: new Set<string>(),
};
if (typeof global !== "undefined") {
  (global as any).__saakshiStore = inMemoryStore;
}

let firestoreInstance: admin.firestore.Firestore | null = null;

export function getAdminFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) return firestoreInstance;

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) {
    return null; // Fall back to high-performance in-memory store
  }

  try {
    if (admin.apps.length === 0) {
      const serviceAccount = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (err) {
    console.warn("Failed to initialize Firebase Admin SDK, falling back to memory store:", err);
    return null;
  }
}

// -------------------------------------------------------------
// Unified Data Access Helpers (Firestore or In-Memory fallback)
// -------------------------------------------------------------

export async function getCaptureRecord(id: string): Promise<any | null> {
  const fs = getAdminFirestore();
  if (fs) {
    const doc = await fs.collection("captures").doc(id).get();
    return doc.exists ? doc.data() : null;
  }
  return inMemoryStore.captures.get(id) || null;
}

export async function saveCaptureRecord(id: string, data: any): Promise<void> {
  const fs = getAdminFirestore();
  if (fs) {
    await fs.collection("captures").doc(id).set(data, { merge: true });
    return;
  }
  const existing = inMemoryStore.captures.get(id) || {};
  inMemoryStore.captures.set(id, { ...existing, ...data, updatedAt: new Date().toISOString() });
}

export async function listUserCaptures(uid: string): Promise<any[]> {
  const fs = getAdminFirestore();
  if (fs) {
    const snap = await fs
      .collection("captures")
      .where("ownerUid", "==", uid)
      .orderBy("createdAt", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const list: any[] = [];
  for (const [id, cap] of inMemoryStore.captures.entries()) {
    if (cap.ownerUid === uid) {
      list.push({ id, ...cap });
    }
  }
  return list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function checkUserDailyQuota(uid: string): Promise<{
  allowed: boolean;
  total: number;
  used: number;
  remaining: number;
}> {
  const total = parseInt(process.env.DAILY_FREE_CAPTURES || "5", 10) || 5;
  const userCaptures = await listUserCaptures(uid);

  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  const todayCaptures = userCaptures.filter((c) => {
    const createdAt = c.createdAt || c.updatedAt;
    return createdAt && createdAt >= startOfDay;
  });

  const used = todayCaptures.length;
  const remaining = Math.max(0, total - used);
  return {
    allowed: remaining > 0,
    total,
    used,
    remaining,
  };
}

export async function saveArtifactRecord(captureId: string, artifact: any): Promise<void> {
  const fs = getAdminFirestore();
  if (fs) {
    await fs
      .collection("captures")
      .doc(captureId)
      .collection("artifacts")
      .doc(artifact.id)
      .set(artifact);
    return;
  }
  const arts = inMemoryStore.artifacts.get(captureId) || [];
  const idx = arts.findIndex((a: any) => a.id === artifact.id);
  if (idx >= 0) {
    arts[idx] = artifact;
  } else {
    arts.push(artifact);
  }
  inMemoryStore.artifacts.set(captureId, arts);
}

export async function listArtifactRecords(captureId: string): Promise<any[]> {
  const fs = getAdminFirestore();
  if (fs) {
    const snap = await fs
      .collection("captures")
      .doc(captureId)
      .collection("artifacts")
      .orderBy("stepIndex", "asc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return inMemoryStore.artifacts.get(captureId) || [];
}

export async function savePublicProof(sha256Hex: string, proofData: any): Promise<void> {
  const clean = sha256Hex.toLowerCase();
  const fs = getAdminFirestore();
  if (fs) {
    await fs.collection("publicProofs").doc(clean).set(proofData);
    return;
  }
  inMemoryStore.publicProofs.set(clean, proofData);
}

export async function getPublicProof(sha256Hex: string): Promise<any | null> {
  const clean = sha256Hex.toLowerCase();
  const fs = getAdminFirestore();
  if (fs) {
    const doc = await fs.collection("publicProofs").doc(clean).get();
    return doc.exists ? doc.data() : null;
  }
  return inMemoryStore.publicProofs.get(clean) || null;
}

export async function saveWatchRecord(watchId: string, data: any): Promise<void> {
  const fs = getAdminFirestore();
  if (fs) {
    await fs.collection("watches").doc(watchId).set(data, { merge: true });
    return;
  }
  const existing = inMemoryStore.watches.get(watchId) || {};
  inMemoryStore.watches.set(watchId, { ...existing, ...data });
}

export async function getWatchRecord(watchId: string): Promise<any | null> {
  const fs = getAdminFirestore();
  if (fs) {
    const doc = await fs.collection("watches").doc(watchId).get();
    return doc.exists ? doc.data() : null;
  }
  return inMemoryStore.watches.get(watchId) || null;
}

export async function getWatchByCaptureId(captureId: string): Promise<any | null> {
  const fs = getAdminFirestore();
  if (fs) {
    const snap = await fs
      .collection("watches")
      .where("captureId", "==", captureId)
      .limit(1)
      .get();
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  }
  for (const [id, w] of inMemoryStore.watches.entries()) {
    if (w.captureId === captureId) return { id, ...w };
  }
  return null;
}

export async function saveWatchEvent(watchId: string, event: any): Promise<void> {
  const fs = getAdminFirestore();
  if (fs) {
    await fs
      .collection("watches")
      .doc(watchId)
      .collection("events")
      .doc(event.id)
      .set(event);
    return;
  }
  const events = inMemoryStore.watchEvents.get(watchId) || [];
  events.unshift(event);
  inMemoryStore.watchEvents.set(watchId, events);
}

export async function listWatchEvents(watchId: string): Promise<any[]> {
  const fs = getAdminFirestore();
  if (fs) {
    const snap = await fs
      .collection("watches")
      .doc(watchId)
      .collection("events")
      .orderBy("detectedAt", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return inMemoryStore.watchEvents.get(watchId) || [];
}

export async function logCustodyEvent(event: any): Promise<void> {
  const fs = getAdminFirestore();
  if (fs) {
    await fs.collection("custody").doc(event.id).set(event);
    return;
  }
  const list = inMemoryStore.custody.get(event.captureId) || [];
  list.unshift(event);
  inMemoryStore.custody.set(event.captureId, list);
}

export async function listCustodyEvents(captureId: string): Promise<any[]> {
  const fs = getAdminFirestore();
  if (fs) {
    const snap = await fs
      .collection("custody")
      .where("captureId", "==", captureId)
      .orderBy("at", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return inMemoryStore.custody.get(captureId) || [];
}

// -------------------------------------------------------------
// Transaction Lock for Idempotent Finalization (FR-3.3)
// -------------------------------------------------------------

export async function acquireFinalizeLock(captureId: string): Promise<boolean> {
  const fs = getAdminFirestore();
  if (fs) {
    const ref = fs.collection("captures").doc(captureId);
    try {
      return await fs.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return false;
        const data = doc.data();
        if (data?.finalizing || data?.status === "READY" || data?.status === "ANCHORED") {
          return false;
        }
        t.update(ref, { finalizing: true, finalizeStartedAt: new Date().toISOString() });
        return true;
      });
    } catch {
      return false;
    }
  }

  // In-memory atomic lock check
  if (inMemoryStore.locks.has(captureId)) {
    return false;
  }
  const cap = inMemoryStore.captures.get(captureId);
  if (cap?.status === "READY" || cap?.status === "ANCHORED" || cap?.finalizing) {
    return false;
  }
  inMemoryStore.locks.add(captureId);
  return true;
}

export async function releaseFinalizeLock(captureId: string): Promise<void> {
  const fs = getAdminFirestore();
  if (fs) {
    await fs.collection("captures").doc(captureId).update({ finalizing: false }).catch(() => {});
    return;
  }
  inMemoryStore.locks.delete(captureId);
}
