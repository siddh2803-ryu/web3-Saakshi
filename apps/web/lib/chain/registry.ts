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

// -------------------------------------------------------------
// Transaction Queue & Nonce Mutex (PRD Phase 8 Part 2)
// -------------------------------------------------------------
let queuePromise: Promise<unknown> = Promise.resolve();

/**
 * Enqueues a chain transaction sequentially to ensure monotonic nonce ordering
 * and avoid transaction collision under concurrent execution.
 */
export function enqueueChainTx<T>(fn: () => Promise<T>): Promise<T> {
  const next = queuePromise.then(fn, fn);
  queuePromise = next.then(() => {}, () => {});
  return next;
}

/**
 * Computes fee overrides ensuring network fee floor compliance.
 * On Polygon Amoy, enforces min 30 gwei priority fee.
 * On Hardhat local (chainId 31337), uses standard node gas pricing.
 */
export async function getTxOverrides(
  provider: ethers.JsonRpcProvider,
  walletAddress: string,
  chainId: number
): Promise<{
  nonce: number;
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: bigint;
  gasPrice?: bigint;
}> {
  // Always query pending transaction count for nonce safety
  const nonce = await provider.getTransactionCount(walletAddress, "pending");
  const feeData = await provider.getFeeData();

  if (chainId === 31337) {
    // Local Hardhat Node
    return {
      nonce,
      gasPrice: feeData.gasPrice || ethers.parseUnits("1", "gwei"),
    };
  }

  // Polygon Amoy (chainId 80002) fee floor: 30 gwei minimum priority fee
  const minPriorityFee = ethers.parseUnits("30", "gwei");
  const maxPriorityFeePerGas =
    feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > minPriorityFee
      ? feeData.maxPriorityFeePerGas
      : minPriorityFee;

  const baseFee = feeData.maxFeePerGas || ethers.parseUnits("35", "gwei");
  const maxFeePerGas = baseFee + minPriorityFee;

  return {
    nonce,
    maxPriorityFeePerGas,
    maxFeePerGas,
  };
}

/**
 * Verifies that the anchor signer holds sufficient native POL/ETH to execute transactions.
 */
export async function assertSufficientBalance(
  provider: ethers.JsonRpcProvider,
  walletAddress: string,
  minRequiredWei: bigint = ethers.parseEther("0.0005")
): Promise<void> {
  const balance = await provider.getBalance(walletAddress);
  if (balance < minRequiredWei) {
    throw new Error(
      `Insufficient anchor wallet balance: ${ethers.formatEther(balance)} POL (requires at least ${ethers.formatEther(minRequiredWei)} POL)`
    );
  }
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

  if (process.env.CHAIN_MODE === "mock") {
    return {
      txHash: `0xmock_${Date.now()}_${root.slice(2, 10)}`,
      blockNumber: 1337,
      anchoredAt: new Date().toISOString(),
      root,
      chainId: 80002,
      contract: contractAddress || "0x0000000000000000000000000000000000000000",
    };
  }

  if (!privateKey || !contractAddress) {
    throw new Error("ANCHOR_PRIVATE_KEY or NEXT_PUBLIC_REGISTRY_ADDRESS is not configured for on-chain anchoring.");
  }

  return enqueueChainTx(async () => {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, EVIDENCE_REGISTRY_ABI, wallet);

    await assertSufficientBalance(provider, wallet.address);
    const overrides = await getTxOverrides(provider, wallet.address, chainId);

    const tx = await contract.anchorRoot(root, batchSize, batchCid, overrides);
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
  });
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
 * Logs custody event on-chain using ANCHOR_ROLE signer through the anchor queue.
 * Action codes: 1 EXPORT, 2 SHARE.
 * Applies sequential queueing, monotonic nonce handling, network fee floor, and balance check.
 */
export async function logCustodyOnChain(
  evidenceId: `0x${string}`,
  actionHash: `0x${string}`,
  action: 1 | 2
): Promise<string | null> {
  const privateKey = process.env.ANCHOR_PRIVATE_KEY;
  const contractAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  const rpcUrl = getRpcUrl();
  const chainId = getChainId();

  if (!privateKey || !contractAddress) {
    return null;
  }

  return enqueueChainTx(async () => {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(contractAddress, EVIDENCE_REGISTRY_ABI, wallet);

      // 1. Balance verification
      await assertSufficientBalance(provider, wallet.address);

      // 2. Monotonic nonce & fee floor overrides
      const overrides = await getTxOverrides(provider, wallet.address, chainId);

      // 3. Dispatch transaction
      const tx = await contract.logCustody(evidenceId, actionHash, action, overrides);
      const receipt = await tx.wait();
      return receipt.hash as string;
    } catch (err) {
      console.error("logCustodyOnChain queue error:", err);
      throw err;
    }
  }).catch((err) => {
    console.warn("On-chain custody execution failed, leaving off-chain record pending:", err);
    return null;
  });
}
