import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import * as fs from "fs";
import * as path from "path";

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!hasEmulator)("Phase 9: Firestore Security Rules (PRD Section 9.4)", () => {
  let testEnv: RulesTestEnvironment;
  const rulesPath = path.resolve(__dirname, "../../../firestore.rules");
  const rules = fs.readFileSync(rulesPath, "utf8");

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "saakshi-security-rules-test",
      firestore: {
        rules,
        host: "127.0.0.1",
        port: 8088,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();

      // Seed data with security rules disabled (simulating server Admin SDK writes)
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        // 1. users
        await db.doc("users/alice").set({ plan: "free", quota: 5 });

        // 2. cases
        await db.doc("cases/case_01").set({
          ownerUid: "alice",
          title: "Alice Defamation Case",
          notes: "Private notes",
        });

        // 3. captures & artifacts
        await db.doc("captures/cap_01").set({
          ownerUid: "alice",
          url: "https://example.com/post/1",
          status: "READY",
        });
        await db.doc("captures/cap_01/artifacts/art_screenshot").set({
          kind: "fullpage_screenshot",
          size: 1024,
        });

        // 4. watches & events
        await db.doc("watches/watch_01").set({
          ownerUid: "alice",
          url: "https://example.com/post/1",
        });
        await db.doc("watches/watch_01/events/ev_01").set({
          type: "NO_CHANGE",
        });

        // 5. custody
        await db.doc("custody/cap_01").set({
          ownerUid: "alice",
        });
        await db.doc("custody/cap_01/events/ev_01").set({
          action: "CREATE",
        });

        // 6. publicProofs
        await db.doc("publicProofs/sha256_valid_hash_abc").set({
          anchored: true,
          root: "0x123",
          blockNumber: 100,
        });

        // 7. shares
        await db.doc("shares/sh_01").set({
          tokenHash: "token_hash_secret",
          ownerUid: "alice",
          captureId: "cap_01",
        });
      });
    }
  });

  // -------------------------------------------------------------
  // 1. users/{uid}
  // -------------------------------------------------------------
  describe("1. users collection", () => {
    it("allows owner to read their own user record", async () => {
      const db = testEnv.authenticatedContext("alice").firestore();
      await assertSucceeds(db.doc("users/alice").get());
    });

    it("denies another authenticated user from reading alice's record", async () => {
      const db = testEnv.authenticatedContext("bob").firestore();
      await assertFails(db.doc("users/alice").get());
    });

    it("denies signed-out user from reading user records", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.doc("users/alice").get());
    });

    it("denies client-side writes to users (even by owner)", async () => {
      const db = testEnv.authenticatedContext("alice").firestore();
      await assertFails(db.doc("users/alice").set({ quota: 999 }));
      await assertFails(db.doc("users/alice").update({ plan: "pro" }));
      await assertFails(db.doc("users/alice").delete());
    });
  });

  // -------------------------------------------------------------
  // 2. cases/{caseId}
  // -------------------------------------------------------------
  describe("2. cases collection", () => {
    it("allows case owner to read their case", async () => {
      const db = testEnv.authenticatedContext("alice").firestore();
      await assertSucceeds(db.doc("cases/case_01").get());
    });

    it("denies another user from reading alice's case", async () => {
      const db = testEnv.authenticatedContext("bob").firestore();
      await assertFails(db.doc("cases/case_01").get());
    });

    it("denies signed-out caller from reading cases", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.doc("cases/case_01").get());
    });

    it("denies client-side writes to cases", async () => {
      const db = testEnv.authenticatedContext("alice").firestore();
      await assertFails(db.doc("cases/case_new").set({ ownerUid: "alice" }));
      await assertFails(db.doc("cases/case_01").update({ title: "Hacked" }));
      await assertFails(db.doc("cases/case_01").delete());
    });
  });

  // -------------------------------------------------------------
  // 3. captures/{captureId} & artifacts/{artifactId}
  // -------------------------------------------------------------
  describe("3. captures collection & artifacts subcollection", () => {
    it("allows capture owner to read capture and artifacts", async () => {
      const db = testEnv.authenticatedContext("alice").firestore();
      await assertSucceeds(db.doc("captures/cap_01").get());
      await assertSucceeds(db.doc("captures/cap_01/artifacts/art_screenshot").get());
    });

    it("denies another user from reading alice's capture or artifacts", async () => {
      const db = testEnv.authenticatedContext("bob").firestore();
      await assertFails(db.doc("captures/cap_01").get());
      await assertFails(db.doc("captures/cap_01/artifacts/art_screenshot").get());
    });

    it("denies signed-out caller from reading captures or artifacts", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.doc("captures/cap_01").get());
      await assertFails(db.doc("captures/cap_01/artifacts/art_screenshot").get());
    });

    it("denies client-side writes to captures and artifacts", async () => {
      const db = testEnv.authenticatedContext("alice").firestore();
      await assertFails(db.doc("captures/cap_01").update({ status: "TAMPERED" }));
      await assertFails(db.doc("captures/cap_01").delete());
      await assertFails(db.doc("captures/cap_01/artifacts/art_new").set({ kind: "bad" }));
    });
  });

  // -------------------------------------------------------------
  // 4. watches/{watchId}
  // -------------------------------------------------------------
  describe("4. watches collection", () => {
    it("allows watch owner to read their watch and events", async () => {
      const db = testEnv.authenticatedContext("alice").firestore();
      await assertSucceeds(db.doc("watches/watch_01").get());
      await assertSucceeds(db.doc("watches/watch_01/events/ev_01").get());
    });

    it("denies another user or signed-out caller from reading watches", async () => {
      const bobDb = testEnv.authenticatedContext("bob").firestore();
      const anonDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(bobDb.doc("watches/watch_01").get());
      await assertFails(anonDb.doc("watches/watch_01").get());
    });

    it("denies client-side writes to watches", async () => {
      const db = testEnv.authenticatedContext("alice").firestore();
      await assertFails(db.doc("watches/watch_01").delete());
      await assertFails(db.doc("watches/watch_01/events/ev_02").set({ type: "TAMPER" }));
    });
  });

  // -------------------------------------------------------------
  // 5. custody/{captureId}
  // -------------------------------------------------------------
  describe("5. custody collection", () => {
    it("allows capture owner to read custody records", async () => {
      const db = testEnv.authenticatedContext("alice").firestore();
      await assertSucceeds(db.doc("custody/cap_01").get());
      await assertSucceeds(db.doc("custody/cap_01/events/ev_01").get());
    });

    it("denies another user or signed-out caller from reading custody records", async () => {
      const bobDb = testEnv.authenticatedContext("bob").firestore();
      const anonDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(bobDb.doc("custody/cap_01").get());
      await assertFails(anonDb.doc("custody/cap_01").get());
    });

    it("denies client-side writes to custody log", async () => {
      const db = testEnv.authenticatedContext("alice").firestore();
      await assertFails(db.doc("custody/cap_01/events/ev_bad").set({ action: "TAMPER" }));
    });
  });

  // -------------------------------------------------------------
  // 6. publicProofs/{sha256}
  // -------------------------------------------------------------
  describe("6. publicProofs collection", () => {
    it("allows signed-out user to read public proofs (public read-only)", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(db.doc("publicProofs/sha256_valid_hash_abc").get());
    });

    it("allows authenticated user to read public proofs", async () => {
      const db = testEnv.authenticatedContext("alice").firestore();
      await assertSucceeds(db.doc("publicProofs/sha256_valid_hash_abc").get());
    });

    it("denies client-side writes to public proofs", async () => {
      const db = testEnv.authenticatedContext("alice").firestore();
      await assertFails(
        db.doc("publicProofs/fake_hash").set({ anchored: true, root: "0xFAKE" })
      );
    });
  });

  // -------------------------------------------------------------
  // 7. shares/{shareId}
  // -------------------------------------------------------------
  describe("7. shares collection (PRD 9.4: NO client access)", () => {
    it("denies owner, other users, and signed-out callers from reading shares collection directly", async () => {
      const aliceDb = testEnv.authenticatedContext("alice").firestore();
      const bobDb = testEnv.authenticatedContext("bob").firestore();
      const anonDb = testEnv.unauthenticatedContext().firestore();

      await assertFails(aliceDb.doc("shares/sh_01").get());
      await assertFails(bobDb.doc("shares/sh_01").get());
      await assertFails(anonDb.doc("shares/sh_01").get());
    });

    it("denies client-side writes to shares collection", async () => {
      const aliceDb = testEnv.authenticatedContext("alice").firestore();
      await assertFails(aliceDb.doc("shares/sh_new").set({ tokenHash: "bad" }));
    });
  });

  // -------------------------------------------------------------
  // 8. Default deny-all catch-all
  // -------------------------------------------------------------
  describe("8. Catch-all rule", () => {
    it("denies access to any unlisted collection", async () => {
      const aliceDb = testEnv.authenticatedContext("alice").firestore();
      const anonDb = testEnv.unauthenticatedContext().firestore();

      await assertFails(aliceDb.doc("internal_configs/system").get());
      await assertFails(anonDb.doc("internal_configs/system").get());
      await assertFails(aliceDb.doc("internal_configs/system").set({ x: 1 }));
    });
  });
});
