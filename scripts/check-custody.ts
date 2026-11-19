import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.chain-local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { ethers } from "ethers";
import {
  listCustodyEvents,
  getCaptureRecord,
} from "../apps/web/lib/firebase/admin";
import {
  verifyCustodyChain,
  computeEventHash,
} from "../apps/web/lib/custody/model";

async function main() {
  const captureId = process.argv[2]?.trim();

  if (!captureId) {
    console.error("Usage: npm run check:custody -- <captureId>");
    process.exit(1);
  }

  console.log(`\n=======================================================`);
  console.log(`  Saakshi Forensic Custody Chain Integrity Checker`);
  console.log(`=======================================================`);
  console.log(`Target Capture: ${captureId}\n`);

  const capture = await getCaptureRecord(captureId);
  if (!capture) {
    console.warn(`[WARN] Capture record "${captureId}" not found in database/dev store.`);
  }

  const events = await listCustodyEvents(captureId);
  if (events.length === 0) {
    console.log(`[WARN] No custody events found for capture "${captureId}".`);
    process.exit(0);
  }

  console.log(`Found ${events.length} custody event(s). Verifying RFC 8785 hash chain...\n`);

  // 1. Verify Hash Chain Integrity
  const chainResult = verifyCustodyChain(events);
  let allPassed = true;

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    const prevEvt = i > 0 ? events[i - 1] : null;

    const expectedPrev = prevEvt ? prevEvt.eventHash : null;
    const computedHash = computeEventHash({
      captureId: evt.captureId,
      action: evt.action,
      actorHash: evt.actorHash,
      at: evt.at,
      prevEventHash: evt.prevEventHash,
    });

    const isHashValid = computedHash === evt.eventHash;
    const isPrevValid = evt.prevEventHash === expectedPrev;

    if (isHashValid && isPrevValid) {
      console.log(
        `[PASS] Event #${i + 1} [${evt.action}] ${evt.id}\n` +
        `       Actor: ${evt.actorHash.slice(0, 16)}... | At: ${evt.at}\n` +
        `       PrevHash: ${evt.prevEventHash ? evt.prevEventHash.slice(0, 16) + "..." : "null (genesis)"}\n` +
        `       EventHash: ${evt.eventHash}\n`
      );
    } else {
      allPassed = false;
      console.error(
        `[FAIL] Event #${i + 1} [${evt.action}] ${evt.id} - Hash Chain Corrupted!\n` +
        `       Stored Hash:   ${evt.eventHash}\n` +
        `       Computed Hash: ${computedHash}\n` +
        `       Stored Prev:   ${evt.prevEventHash}\n` +
        `       Expected Prev: ${expectedPrev}\n`
      );
    }
  }

  if (chainResult.valid) {
    console.log(`[PASS] Overall Hash Chain: INTACT (${events.length} events verified)`);
  } else {
    allPassed = false;
    console.error(`[FAIL] Overall Hash Chain: BROKEN at index ${chainResult.brokenAtIndex}: ${chainResult.reason}`);
  }

  // 2. On-Chain Custody Event Verification
  console.log(`\n--- On-Chain Custody Log Verification ---`);

  const rpcUrl =
    process.env.NEXT_PUBLIC_RPC_URL ||
    process.env.RPC_URL ||
    "http://127.0.0.1:8545";
  const registryAddress =
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ||
    process.env.REGISTRY_ADDRESS;

  let provider: ethers.JsonRpcProvider | null = null;
  let isChainReachable = false;

  try {
    provider = new ethers.JsonRpcProvider(rpcUrl);
    await provider.getBlockNumber();
    isChainReachable = true;
  } catch {
    isChainReachable = false;
  }

  if (!isChainReachable || !registryAddress) {
    console.log(
      `[INFO] Chain RPC (${rpcUrl}) not active or REGISTRY_ADDRESS not set. Skipping live on-chain queries.`
    );
  } else {
    console.log(`Connected to Chain RPC: ${rpcUrl}`);
    console.log(`EvidenceRegistry: ${registryAddress}\n`);

    const abi = [
      "event Custody(bytes32 indexed evidenceId, bytes32 actionHash, uint8 action, uint64 at)",
    ];
    const contract = new ethers.Contract(registryAddress, abi, provider);

    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      if (evt.action === "EXPORT" || evt.action === "SHARE") {
        if (!evt.txHash) {
          console.log(`[PENDING] Event #${i + 1} [${evt.action}]: On-chain record pending (no txHash)`);
          continue;
        }

        try {
          const receipt = await provider!.getTransactionReceipt(evt.txHash);
          if (!receipt) {
            allPassed = false;
            console.error(`[FAIL] Event #${i + 1} [${evt.action}]: Tx receipt not found for ${evt.txHash}`);
            continue;
          }

          if (receipt.status !== 1) {
            allPassed = false;
            console.error(`[FAIL] Event #${i + 1} [${evt.action}]: Transaction reverted (${evt.txHash})`);
            continue;
          }

          let custodyLogFound = false;
          for (const log of receipt.logs) {
            try {
              const parsed = contract.interface.parseLog({
                topics: log.topics as string[],
                data: log.data,
              });

              if (parsed && parsed.name === "Custody") {
                custodyLogFound = true;
                const actionCode = Number(parsed.args.action);
                const expectedCode = evt.action === "EXPORT" ? 1 : 2;

                if (actionCode === expectedCode) {
                  console.log(
                    `[PASS] Event #${i + 1} [${evt.action}]: On-chain Custody verified in block #${receipt.blockNumber}\n` +
                    `       Tx: ${evt.txHash}\n` +
                    `       Action Code: ${actionCode} | Timestamp: ${new Date(Number(parsed.args.at) * 1000).toISOString()}`
                  );
                } else {
                  allPassed = false;
                  console.error(
                    `[FAIL] Event #${i + 1} [${evt.action}]: Action code mismatch (expected ${expectedCode}, got ${actionCode})`
                  );
                }
              }
            } catch {
              // Not a Custody event in this log
            }
          }

          if (!custodyLogFound) {
            allPassed = false;
            console.error(`[FAIL] Event #${i + 1} [${evt.action}]: No Custody event found in tx ${evt.txHash}`);
          }
        } catch (err: unknown) {
          allPassed = false;
          console.error(`[FAIL] Event #${i + 1} [${evt.action}]: Verification error on tx ${evt.txHash}:`, err);
        }
      } else {
        console.log(`[PASS] Event #${i + 1} [${evt.action}]: Off-chain event (chain logging not required)`);
      }
    }
  }

  console.log(`\n=======================================================`);
  if (allPassed) {
    console.log(`  RESULT: ALL CUSTODY CHECKS PASSED [PASS]`);
    console.log(`=======================================================\n`);
    process.exit(0);
  } else {
    console.error(`  RESULT: CUSTODY CHECKS FAILED [FAIL]`);
    console.log(`=======================================================\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error running check-custody:", err);
  process.exit(1);
});
