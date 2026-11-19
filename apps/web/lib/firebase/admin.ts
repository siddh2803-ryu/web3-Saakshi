/* eslint-disable */
import * as admin from "firebase-admin";
import * as nodeFs from "fs";
import {
  CustodyEvent,
  CustodyAction,
  buildCustodyEvent,
  computeActorHash,
} from "@/lib/custody/model";
export type { CustodyEvent, CustodyAction };

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

const DEV_STORE_PATH = "/tmp/saakshi_dev_store.json";

function loadDevStoreFromDisk() {
  try {
    if (nodeFs.existsSync(DEV_STORE_PATH)) {
      const data = JSON.parse(nodeFs.readFileSync(DEV_STORE_PATH, "utf8"));
      if (data.captures) {
        for (const [k, v] of Object.entries(data.captures)) inMemoryStore.captures.set(k, v);
      }
      if (data.publicProofs) {
        for (const [k, v] of Object.entries(data.publicProofs)) inMemoryStore.publicProofs.set(k, v);
      }
      if (data.artifacts) {
        for (const [k, v] of Object.entries(data.artifacts)) inMemoryStore.artifacts.set(k, v as any[]);
      }
      if (data.watches) {
        for (const [k, v] of Object.entries(data.watches)) inMemoryStore.watches.set(k, v);
      }
      if (data.watchEvents) {
        for (const [k, v] of Object.entries(data.watchEvents)) inMemoryStore.watchEvents.set(k, v as any[]);
      }
      if (data.cases) {
        for (const [k, v] of Object.entries(data.cases)) inMemoryStore.cases.set(k, v);
      }
      if (data.custody) {
        for (const [k, v] of Object.entries(data.custody)) inMemoryStore.custody.set(k, v as any[]);
      }
      if (data.shares) {
        for (const [k, v] of Object.entries(data.shares)) inMemoryStore.shares.set(k, v);
      }
    }
  } catch {}
}

function persistDevStoreToDisk() {
  try {
    const data = {
      captures: Object.fromEntries(inMemoryStore.captures.entries()),
      publicProofs: Object.fromEntries(inMemoryStore.publicProofs.entries()),
      artifacts: Object.fromEntries(inMemoryStore.artifacts.entries()),
      watches: Object.fromEntries(inMemoryStore.watches.entries()),
      watchEvents: Object.fromEntries(inMemoryStore.watchEvents.entries()),
      cases: Object.fromEntries(inMemoryStore.cases.entries()),
      custody: Object.fromEntries(inMemoryStore.custody.entries()),
      shares: Object.fromEntries(inMemoryStore.shares.entries()),
    };
    nodeFs.writeFileSync(DEV_STORE_PATH, JSON.stringify(data), "utf8");
  } catch {}
}

// Initial load
loadDevStoreFromDisk();

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
  if (!inMemoryStore.captures.has(id)) {
    loadDevStoreFromDisk();
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
  persistDevStoreToDisk();
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
  persistDevStoreToDisk();
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
  if (!inMemoryStore.artifacts.has(captureId)) {
    loadDevStoreFromDisk();
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
  persistDevStoreToDisk();
}

export async function getPublicProof(sha256Hex: string): Promise<any | null> {
  const clean = sha256Hex.toLowerCase();
  const fs = getAdminFirestore();
  if (fs) {
    const doc = await fs.collection("publicProofs").doc(clean).get();
    return doc.exists ? doc.data() : null;
  }
  if (!inMemoryStore.publicProofs.has(clean)) {
    loadDevStoreFromDisk();
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
  persistDevStoreToDisk();
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

export async function getWatchByMonitorId(monitorId: string): Promise<any | null> {
  const fs = getAdminFirestore();
  if (fs) {
    const snap = await fs
      .collection("watches")
      .where("monitorId", "==", monitorId)
      .limit(1)
      .get();
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  }
  loadDevStoreFromDisk();
  for (const [id, w] of inMemoryStore.watches.entries()) {
    if (w.monitorId === monitorId) return { id, ...w };
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
  persistDevStoreToDisk();
}

export async function countUserActiveWatches(uid: string): Promise<number> {
  const fs = getAdminFirestore();
  if (fs) {
    const snap = await fs
      .collection("watches")
      .where("ownerUid", "==", uid)
      .where("state", "==", "active")
      .get();
    return snap.size;
  }
  loadDevStoreFromDisk();
  let count = 0;
  for (const w of inMemoryStore.watches.values()) {
    if (w.ownerUid === uid && w.state === "active") {
      count++;
    }
  }
  return count;
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

export async function listCustodyEvents(
  captureId: string,
  direction: "asc" | "desc" = "asc"
): Promise<CustodyEvent[]> {
  const fs = getAdminFirestore();
  if (fs) {
    const snap = await fs
      .collection("custody")
      .where("captureId", "==", captureId)
      .orderBy("at", direction)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustodyEvent));
  }
  const list = (inMemoryStore.custody.get(captureId) || []).slice() as CustodyEvent[];
  list.sort((a, b) => {
    const tA = new Date(a.at).getTime();
    const tB = new Date(b.at).getTime();
    return direction === "asc" ? tA - tB : tB - tA;
  });
  return list;
}

export async function logCustodyEvent(event: any): Promise<void> {
  const fs = getAdminFirestore();
  if (fs) {
    await fs.collection("custody").doc(event.id).set(event);
    return;
  }
  const list = inMemoryStore.custody.get(event.captureId) || [];
  list.push(event);
  inMemoryStore.custody.set(event.captureId, list);
  persistDevStoreToDisk();
}

export async function recordCustodyEvent(params: {
  captureId: string;
  action: CustodyAction;
  actorId: string;
  isShare?: boolean;
  at?: string;
  txHash?: string | null;
  details?: Record<string, unknown>;
}): Promise<CustodyEvent> {
  // 1. Fetch current chronological chain to determine prevEventHash
  const existingEvents = await listCustodyEvents(params.captureId, "asc");
  const lastEvent = existingEvents.length > 0 ? existingEvents[existingEvents.length - 1] : null;
  const prevEventHash = lastEvent ? lastEvent.eventHash : null;

  // 2. Build the hash-chained event
  const event = buildCustodyEvent({
    captureId: params.captureId,
    action: params.action,
    actorId: params.actorId,
    isShare: params.isShare,
    prevEventHash,
    at: params.at,
    txHash: params.txHash,
    details: params.details,
  });

  // 3. Save to Firestore or inMemoryStore with disk persistence
  const fs = getAdminFirestore();
  if (fs) {
    await fs.collection("custody").doc(event.id).set(event);
  } else {
    const list = inMemoryStore.custody.get(params.captureId) || [];
    list.push(event);
    inMemoryStore.custody.set(params.captureId, list);
    persistDevStoreToDisk();
  }

  return event;
}

export async function recordViewCustodyEvent(
  captureId: string,
  actorId: string
): Promise<{ recorded: boolean; throttled: boolean; event?: CustodyEvent }> {
  const actorHash = computeActorHash(actorId);
  const events = await listCustodyEvents(captureId, "asc");
  const viewEvents = events.filter((e) => e.action === "VIEW" && e.actorHash === actorHash);
  if (viewEvents.length > 0) {
    const lastView = viewEvents[viewEvents.length - 1];
    const diffMs = Date.now() - new Date(lastView.at).getTime();
    if (diffMs < 3600 * 1000) {
      return { recorded: false, throttled: true, event: lastView };
    }
  }

  const event = await recordCustodyEvent({
    captureId,
    action: "VIEW",
    actorId,
  });
  return { recorded: true, throttled: false, event };
}

export async function updateCustodyEventTxHash(
  captureId: string,
  eventId: string,
  txHash: string
): Promise<void> {
  const fs = getAdminFirestore();
  if (fs) {
    await fs.collection("custody").doc(eventId).update({ txHash });
    return;
  }
  const list = inMemoryStore.custody.get(captureId) || [];
  const target = list.find((e: any) => e.id === eventId);
  if (target) {
    target.txHash = txHash;
    persistDevStoreToDisk();
  }
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

// -------------------------------------------------------------
// Cases Data Model & Operations (FR-12.1, FR-12.2)
// -------------------------------------------------------------

export interface CaseRecord {
  id: string;
  ownerUid: string;
  title: string;
  notes: string;
  captureIds: string[];
  createdAt: string;
  updatedAt: string;
}

export async function getCaseRecord(caseId: string): Promise<CaseRecord | null> {
  const fs = getAdminFirestore();
  if (fs) {
    const doc = await fs.collection("cases").doc(caseId).get();
    return doc.exists ? (doc.data() as CaseRecord) : null;
  }
  if (!inMemoryStore.cases.has(caseId)) {
    loadDevStoreFromDisk();
  }
  return inMemoryStore.cases.get(caseId) || null;
}

export async function saveCaseRecord(caseId: string, data: Partial<CaseRecord>): Promise<CaseRecord> {
  const now = new Date().toISOString();
  const fs = getAdminFirestore();
  if (fs) {
    const docRef = fs.collection("cases").doc(caseId);
    const existingSnap = await docRef.get();
    const existing = existingSnap.exists ? existingSnap.data() : {};
    const updated: CaseRecord = {
      id: caseId,
      ownerUid: data.ownerUid || existing?.ownerUid || "demo-user",
      title: data.title !== undefined ? data.title : existing?.title || "Untitled Case",
      notes: data.notes !== undefined ? data.notes : existing?.notes || "",
      captureIds: Array.isArray(data.captureIds) ? data.captureIds : existing?.captureIds || [],
      createdAt: existing?.createdAt || data.createdAt || now,
      updatedAt: now,
    };
    await docRef.set(updated, { merge: true });
    return updated;
  }

  loadDevStoreFromDisk();
  const existing = inMemoryStore.cases.get(caseId) || {};
  const updated: CaseRecord = {
    id: caseId,
    ownerUid: data.ownerUid || existing.ownerUid || "demo-user",
    title: data.title !== undefined ? data.title : existing.title || "Untitled Case",
    notes: data.notes !== undefined ? data.notes : existing.notes || "",
    captureIds: Array.isArray(data.captureIds) ? data.captureIds : existing.captureIds || [],
    createdAt: existing.createdAt || data.createdAt || now,
    updatedAt: now,
  };
  inMemoryStore.cases.set(caseId, updated);
  persistDevStoreToDisk();
  return updated;
}

export async function deleteCaseRecord(caseId: string): Promise<boolean> {
  const c = await getCaseRecord(caseId);
  if (!c) return false;

  // Unassign all captures in this case (captures are kept, become unassigned)
  const capIds = [...(c.captureIds || [])];
  for (const cid of capIds) {
    const cap = await getCaptureRecord(cid);
    if (cap && cap.caseId === caseId) {
      await saveCaptureRecord(cid, { caseId: null });
    }
  }

  const fs = getAdminFirestore();
  if (fs) {
    await fs.collection("cases").doc(caseId).delete();
    return true;
  }

  loadDevStoreFromDisk();
  const deleted = inMemoryStore.cases.delete(caseId);
  persistDevStoreToDisk();
  return deleted;
}

export async function listUserCases(uid: string): Promise<CaseRecord[]> {
  const fs = getAdminFirestore();
  if (fs) {
    const snap = await fs
      .collection("cases")
      .where("ownerUid", "==", uid)
      .orderBy("createdAt", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CaseRecord));
  }
  loadDevStoreFromDisk();
  const list: CaseRecord[] = [];
  for (const c of inMemoryStore.cases.values()) {
    if (c.ownerUid === uid) {
      list.push(c);
    }
  }
  return list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function assignCaptureToCase(captureId: string, targetCaseId: string | null): Promise<void> {
  const cap = await getCaptureRecord(captureId);
  if (!cap) throw new Error(`Capture ${captureId} not found`);

  const prevCaseId = cap.caseId;

  // If removing from previous case
  if (prevCaseId && prevCaseId !== targetCaseId) {
    const prevCase = await getCaseRecord(prevCaseId);
    if (prevCase) {
      const filtered = (prevCase.captureIds || []).filter((id) => id !== captureId);
      await saveCaseRecord(prevCaseId, { captureIds: filtered });
    }
  }

  // If adding to target case
  if (targetCaseId) {
    const targetCase = await getCaseRecord(targetCaseId);
    if (!targetCase) throw new Error(`Target case ${targetCaseId} not found`);
    const existingIds = new Set(targetCase.captureIds || []);
    existingIds.add(captureId);
    await saveCaseRecord(targetCaseId, { captureIds: Array.from(existingIds) });
  }

  // Update capture
  await saveCaptureRecord(captureId, { caseId: targetCaseId });
}
