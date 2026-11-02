import { ethers } from "ethers";
import { EVIDENCE_REGISTRY_ABI } from "@/lib/chain/abi";

export type ResultState =
  | "VERIFIED"
  | "NOT_FOUND"
  | "ALTERED"
  | "NOT_YET_ANCHORED"
  | "CHAIN_CHECK_FAILED";

export interface VerificationSteps {
  hashComputed: boolean;
  foundInManifest: boolean;
  merkleProofValid: boolean;
  onChainConfirmed: boolean;
}

export interface VerificationFileResult {
  filename: string;
  sha256: string;
  state: ResultState;
  statusText: string;
  steps: VerificationSteps;
  captureId?: string;
  kind?: string;
  blockNumber?: number;
  blockTimeIst?: string;
  blockTimeUtc?: string;
  txHash?: string;
  contract?: string;
  root?: string;
  chainId?: number;
  isBundle?: boolean;
  securityError?: string;
}

/**
 * Validates that a proof.json points to the official deployment contract and chain ID.
 * Prevents a rogue contract from spoofing a VERIFIED green state.
 */
export function validateProofSecurity(
  proof: { contract?: string; chainId?: number | string },
  expected: { contract?: string; chainId?: number | string }
): { valid: boolean; error?: string } {
  if (expected.contract && expected.contract !== "0x0000000000000000000000000000000000000000") {
    if (!proof.contract || proof.contract.toLowerCase() !== expected.contract.toLowerCase()) {
      return {
        valid: false,
        error: "This proof points to a different contract than the official deployment.",
      };
    }
  }

  if (expected.chainId) {
    if (!proof.chainId || Number(proof.chainId) !== Number(expected.chainId)) {
      return {
        valid: false,
        error: `This proof points to chain ID ${proof.chainId} instead of expected chain ID ${expected.chainId}.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Returns candidate RPC URLs for querying the blockchain from the client.
 */
export function getClientCandidateRpcs(): string[] {
  const primary =
    process.env.NEXT_PUBLIC_RPC_URL ||
    process.env.NEXT_PUBLIC_AMOY_RPC_URL ||
    "https://polygon-amoy-bor-rpc.publicnode.com";

  const candidates = [
    primary,
    process.env.NEXT_PUBLIC_AMOY_RPC_URL,
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://polygon-amoy.drpc.org",
  ].filter((u): u is string => Boolean(u));

  return Array.from(new Set(candidates));
}

/**
 * Executes verify(manifestHash, proof, root) directly on the contract via ethers.js.
 * Automatically tries candidate RPCs on network failure.
 */
export async function executeDirectOnChainVerify(
  manifestHash: string,
  proof: string[],
  root: string,
  contractAddress: string,
  candidateRpcs: string[] = getClientCandidateRpcs()
): Promise<{ ok: boolean; timestamp: number; rpcUsed: string } | { error: string }> {
  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    return { error: "Contract address is not configured" };
  }

  const cleanLeaf = manifestHash.startsWith("0x") ? manifestHash : `0x${manifestHash}`;
  let lastError: unknown = null;

  for (const rpcUrl of candidateRpcs) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const contract = new ethers.Contract(contractAddress, EVIDENCE_REGISTRY_ABI, provider);

      const [ok, timestamp]: [boolean, bigint] = await contract.verify(
        cleanLeaf,
        proof,
        root
      );

      return {
        ok,
        timestamp: Number(timestamp),
        rpcUsed: rpcUrl,
      };
    } catch (err) {
      lastError = err;
      console.warn(`Direct RPC query failed at ${rpcUrl}, checking next RPC:`, err);
    }
  }

  return {
    error: `All candidate RPC nodes failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  };
}
