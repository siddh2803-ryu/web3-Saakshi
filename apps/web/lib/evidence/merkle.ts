import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { toBytes32 } from "./hash";

export interface MerkleBatchResult {
  root: `0x${string}`;
  size: number;
  leaves: `0x${string}`[];
  treeDump: ReturnType<StandardMerkleTree<[`0x${string}`]>["dump"]>;
  getProofForManifest: (manifestHashHex: string) => `0x${string}`[];
}

/**
 * Builds an OpenZeppelin StandardMerkleTree for a list of manifest SHA-256 hashes.
 * Leaves are encoded as ["bytes32"].
 */
export function buildMerkleBatch(manifestHashes: string[]): MerkleBatchResult {
  if (manifestHashes.length === 0) {
    throw new Error("Cannot create Merkle batch from empty list of manifest hashes");
  }

  // Format all hashes as 0x-prefixed 32-byte hex
  const leaves: `0x${string}`[] = manifestHashes.map((h) => toBytes32(h));
  const treeValues: [`0x${string}`][] = leaves.map((leaf) => [leaf]);

  const tree = StandardMerkleTree.of<[`0x${string}`]>(treeValues, ["bytes32"]);
  const root = tree.root as `0x${string}`;

  return {
    root,
    size: leaves.length,
    leaves,
    treeDump: tree.dump(),
    getProofForManifest: (manifestHashHex: string): `0x${string}`[] => {
      const target = toBytes32(manifestHashHex);
      for (const [i, v] of tree.entries()) {
        if (v[0].toLowerCase() === target.toLowerCase()) {
          return tree.getProof(i) as `0x${string}`[];
        }
      }
      throw new Error(`Manifest hash ${target} not found in Merkle batch`);
    },
  };
}

/**
 * Verifies if a manifest hash is included in a Merkle tree root using OpenZeppelin StandardMerkleTree.
 */
export function verifyManifestProof(
  root: string,
  manifestHash: string,
  proof: string[]
): boolean {
  try {
    const leaf = toBytes32(manifestHash);
    return StandardMerkleTree.verify(
      root,
      ["bytes32"],
      [leaf],
      proof
    );
  } catch {
    return false;
  }
}
