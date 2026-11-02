import { ethers } from "ethers";
import { EVIDENCE_REGISTRY_ABI } from "./abi";

export interface AnchorResult {
  txHash: string;
  blockNumber: number;
  anchoredAt: string;
  root: `0x${string}`;
  chainId: number;
  contract: string;
}

export interface VerifyOnChainResult {
  ok: boolean;
  anchoredAt: number;
}

export function getRpcUrl(): string {
  return (
    process.env.RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    process.env.AMOY_RPC_URL ||
    process.env.NEXT_PUBLIC_AMOY_RPC_URL ||
    "https://polygon-amoy-bor-rpc.publicnode.com"
  );
}

export function getChainId(): number {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID;
  return raw ? Number(raw) : 80002;
}

export function getCandidateRpcUrls(): string[] {
  const primary = getRpcUrl();
  const list = [
    primary,
    process.env.NEXT_PUBLIC_AMOY_RPC_URL,
    process.env.AMOY_RPC_URL,
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://polygon-amoy.drpc.org",
  ].filter((u): u is string => Boolean(u));
  return Array.from(new Set(list));
}

/**
 * Returns an ethers Contract instance connected to the deployed EvidenceRegistry.
 */
export function getRegistryContract(
  contractAddress: string = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || "",
  signerOrProvider?: ethers.Signer | ethers.Provider
): ethers.Contract {
  if (!contractAddress) {
    throw new Error("EvidenceRegistry contract address is not configured");
  }
  const provider = signerOrProvider || new ethers.JsonRpcProvider(getRpcUrl());
  return new ethers.Contract(contractAddress, EVIDENCE_REGISTRY_ABI, provider);
}

/**
 * Anchors a Merkle root to the blockchain using the server's anchor private key.
 */
export async function anchorRootOnChain(
  root: `0x${string}`,
  batchSize: number,
  batchCid: string
): Promise<AnchorResult> {
  const privateKey = process.env.ANCHOR_PRIVATE_KEY;
  const contractAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  const rpcUrl = getRpcUrl();
  const chainId = getChainId();

  if (!privateKey || !contractAddress) {
    // Simulated anchor response for local/testing without wallet keys
    const mockTxHash = `0xmock_tx_${Date.now().toString(16).padStart(56, "0")}`;
    return {
      txHash: mockTxHash,
      blockNumber: 1234567,
      anchoredAt: new Date().toISOString(),
      root,
      chainId,
      contract: contractAddress || "0x0000000000000000000000000000000000000000",
    };
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, EVIDENCE_REGISTRY_ABI, wallet);

  const tx = await contract.anchorRoot(root, batchSize, batchCid);
  const receipt = await tx.wait();
  const block = await provider.getBlock(receipt.blockNumber);
  const timestamp = block ? new Date(block.timestamp * 1000).toISOString() : new Date().toISOString();

  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    anchoredAt: timestamp,
    root,
    chainId,
    contract: contractAddress,
  };
}

/**
 * Verifies manifest inclusion directly on the smart contract via eth_call (read-only).
 */
export async function verifyOnChain(
  manifestHash: string,
  proof: string[],
  root: string,
  rpcUrl: string = getRpcUrl(),
  contractAddress: string = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || ""
): Promise<VerifyOnChainResult> {
  if (!contractAddress) {
    return { ok: false, anchoredAt: 0 };
  }

  const candidateUrls = [rpcUrl, ...getCandidateRpcUrls().filter((u) => u !== rpcUrl)];
  let lastErr: unknown = null;

  for (const url of candidateUrls) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      const contract = new ethers.Contract(contractAddress, EVIDENCE_REGISTRY_ABI, provider);

      const [ok, timestamp]: [boolean, bigint] = await contract.verify(
        manifestHash,
        proof,
        root
      );

      return {
        ok,
        anchoredAt: Number(timestamp),
      };
    } catch (err) {
      lastErr = err;
      console.warn(`verifyOnChain failed with RPC ${url}, trying fallback if available:`, err);
    }
  }

  console.error("verifyOnChain failed across all candidate RPCs:", lastErr);
  return { ok: false, anchoredAt: 0 };
}

/**
 * Logs custody event on-chain using ANCHOR_ROLE signer.
 */
export async function logCustodyOnChain(
  evidenceId: `0x${string}`,
  actionHash: `0x${string}`,
  action: 1 | 2 | 3
): Promise<string | null> {
  const privateKey = process.env.ANCHOR_PRIVATE_KEY;
  const contractAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  const rpcUrl = getRpcUrl();

  if (!privateKey || !contractAddress) {
    return null;
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, EVIDENCE_REGISTRY_ABI, wallet);

    const tx = await contract.logCustody(evidenceId, actionHash, action);
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (err) {
    console.error("logCustodyOnChain error:", err);
    return null;
  }
}
