import { expect } from "chai";
import { ethers } from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { EvidenceRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("EvidenceRegistry", function () {
  let registry: EvidenceRegistry;
  let admin: HardhatEthersSigner;
  let nonAdmin: HardhatEthersSigner;

  beforeEach(async function () {
    [admin, nonAdmin] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("EvidenceRegistry");
    registry = (await Factory.deploy(admin.address)) as unknown as EvidenceRegistry;
    await registry.waitForDeployment();
  });

  describe("Anchoring", function () {
    it("anchors a root and emits Anchored event with block timestamp", async function () {
      const dummyRoot = ethers.keccak256(ethers.toUtf8Bytes("manifest-1"));
      const size = 1;
      const cid = "bafytestcid123";

      const tx = await registry.connect(admin).anchorRoot(dummyRoot, size, cid);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx)
        .to.emit(registry, "Anchored")
        .withArgs(dummyRoot, size, cid, block!.timestamp);

      const batch = await registry.batches(dummyRoot);
      expect(batch.anchoredAt).to.equal(block!.timestamp);
      expect(batch.size).to.equal(size);
      expect(batch.cid).to.equal(cid);
    });

    it("reverts on empty root", async function () {
      await expect(
        registry.connect(admin).anchorRoot(ethers.ZeroHash, 1, "cid")
      ).to.be.revertedWith("empty root");
    });

    it("reverts on duplicate root", async function () {
      const root = ethers.keccak256(ethers.toUtf8Bytes("root-duplicate"));
      await registry.connect(admin).anchorRoot(root, 1, "cid");
      await expect(
        registry.connect(admin).anchorRoot(root, 1, "cid")
      ).to.be.revertedWith("already anchored");
    });

    it("reverts when a non-ANCHOR_ROLE account attempts to anchor", async function () {
      const root = ethers.keccak256(ethers.toUtf8Bytes("unauthorized-root"));
      await expect(
        registry.connect(nonAdmin).anchorRoot(root, 1, "cid")
      ).to.be.reverted;
    });
  });

  describe("Merkle Verification", function () {
    const testBatchSizes = [1, 2, 7];

    for (const size of testBatchSizes) {
      it(`verifies inclusion correctly for a batch of ${size} items`, async function () {
        const hashes: [string][] = [];
        for (let i = 0; i < size; i++) {
          hashes.push([ethers.keccak256(ethers.toUtf8Bytes(`evidence-item-${i}`))]);
        }

        const tree = StandardMerkleTree.of(hashes, ["bytes32"]);
        const root = tree.root;

        await registry.connect(admin).anchorRoot(root, size, `bafybatch${size}`);

        for (const [i, v] of tree.entries()) {
          const proof = tree.getProof(i);
          const manifestHash = v[0];

          const [ok, timestamp] = await registry.verify(manifestHash, proof, root);
          expect(ok).to.be.true;
          expect(timestamp).to.be.greaterThan(0);
        }

        // Tamper test: modifying 1 character in the manifest hash must fail verification
        const tamperedHash = ethers.keccak256(ethers.toUtf8Bytes("tampered-hash-byte"));
        const proof = tree.getProof(0);
        const [tamperedOk] = await registry.verify(tamperedHash, proof, root);
        expect(tamperedOk).to.be.false;

        // Unknown root test
        const unknownRoot = ethers.keccak256(ethers.toUtf8Bytes("non-existent-root"));
        const [unknownRootOk, zeroTime] = await registry.verify(hashes[0][0], proof, unknownRoot);
        expect(unknownRootOk).to.be.false;
        expect(zeroTime).to.equal(0);
      });
    }
  });

  describe("Custody Logging", function () {
    it("emits Custody event when called by ANCHOR_ROLE", async function () {
      const evidenceId = ethers.keccak256(ethers.toUtf8Bytes("evidence-doc-1"));
      const actionHash = ethers.keccak256(ethers.toUtf8Bytes("export-action"));
      const actionCode = 1; // EXPORT

      const tx = await registry.connect(admin).logCustody(evidenceId, actionHash, actionCode);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx)
        .to.emit(registry, "Custody")
        .withArgs(evidenceId, actionHash, actionCode, block!.timestamp);
    });

    it("reverts custody logging from non-authorized account", async function () {
      const evidenceId = ethers.keccak256(ethers.toUtf8Bytes("evidence-doc-2"));
      const actionHash = ethers.keccak256(ethers.toUtf8Bytes("share-action"));
      await expect(
        registry.connect(nonAdmin).logCustody(evidenceId, actionHash, 2)
      ).to.be.reverted;
    });
  });
});
