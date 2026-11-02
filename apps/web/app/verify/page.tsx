"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import JSZip from "jszip";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import {
  ShieldCheck,
  ShieldAlert,
  UploadCloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  Lock,
  ArrowRight,
  RotateCw,
  FolderArchive,
  FileCheck,
} from "lucide-react";
import { formatIST, truncateHash } from "@/lib/utils";
import { sha256Hex, computeCanonicalManifestHash } from "@/lib/evidence/webcrypto";
import {
  ResultState,
  VerificationFileResult,
  validateProofSecurity,
  getClientCandidateRpcs,
  executeDirectOnChainVerify,
} from "@/lib/evidence/verification";

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

function formatUtc(timestampMsOrIso?: number | string): string {
  if (!timestampMsOrIso) return "Pending";
  try {
    const d = typeof timestampMsOrIso === "number" ? new Date(timestampMsOrIso) : new Date(timestampMsOrIso);
    return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  } catch {
    return "Pending";
  }
}

export default function PublicVerifyPage() {
  const [verifying, setVerifying] = useState(false);
  const [results, setResults] = useState<VerificationFileResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const expectedContract = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  const expectedChainId = process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID;
  const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL;

  // -------------------------------------------------------------
  // Verification Pipeline for a Single Loose File
  // -------------------------------------------------------------
  const verifySingleFile = async (file: File): Promise<VerificationFileResult> => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        filename: file.name,
        sha256: "exceeded_limit",
        state: "NOT_FOUND",
        statusText: "File exceeds 200 MB limit. Files are never uploaded: only the 64-character hash is verified.",
        steps: {
          hashComputed: false,
          foundInManifest: false,
          merkleProofValid: false,
          onChainConfirmed: false,
        },
      };
    }

    // Step 1: WebCrypto SHA-256 local hash
    const arrayBuf = await file.arrayBuffer();
    const sha256 = await sha256Hex(arrayBuf);

    // Step 2: Query Saakshi public proof index
    let proofData: any = null;
    try {
      const res = await fetch(`/api/verify/${sha256}`);
      if (res.status === 429) {
        return {
          filename: file.name,
          sha256,
          state: "CHAIN_CHECK_FAILED",
          statusText: "Rate limit reached on verification index. Please wait a minute and retry.",
          steps: {
            hashComputed: true,
            foundInManifest: false,
            merkleProofValid: false,
            onChainConfirmed: false,
          },
        };
      }
      const data = await res.json();
      if (data.found && data.proof) {
        proofData = data.proof;
      }
    } catch {
      // Index unreachable
    }

    if (!proofData) {
      return {
        filename: file.name,
        sha256,
        state: "NOT_FOUND",
        statusText: "Not found in Saakshi's records. This file was not captured by Saakshi, or it has been changed.",
        steps: {
          hashComputed: true,
          foundInManifest: false,
          merkleProofValid: false,
          onChainConfirmed: false,
        },
      };
    }

    // Step 3: Security check on proof contract & chain
    const contractAddress = proofData.contract || expectedContract;
    const securityCheck = validateProofSecurity(proofData, {
      contract: expectedContract,
      chainId: expectedChainId,
    });

    if (!securityCheck.valid) {
      return {
        filename: file.name,
        sha256,
        state: "ALTERED",
        statusText: securityCheck.error || "This proof points to a different contract.",
        securityError: securityCheck.error,
        steps: {
          hashComputed: true,
          foundInManifest: true,
          merkleProofValid: false,
          onChainConfirmed: false,
        },
        captureId: proofData.captureId,
        kind: proofData.kind,
        contract: contractAddress,
        root: proofData.root,
      };
    }

    if (!proofData.txHash || !proofData.root) {
      return {
        filename: file.name,
        sha256,
        state: "NOT_YET_ANCHORED",
        statusText: "The capture exists but has not been anchored to the blockchain yet.",
        steps: {
          hashComputed: true,
          foundInManifest: true,
          merkleProofValid: false,
          onChainConfirmed: false,
        },
        captureId: proofData.captureId,
        kind: proofData.kind,
      };
    }

    // Step 4: Merkle proof verification in JavaScript
    let merkleOk = false;
    try {
      const leafHash = proofData.manifestSha256.startsWith("0x")
        ? proofData.manifestSha256
        : `0x${proofData.manifestSha256}`;

      merkleOk = StandardMerkleTree.verify(
        proofData.root,
        ["bytes32"],
        [leafHash],
        proofData.proof || []
      );
    } catch (mErr) {
      console.warn("Merkle verification error:", mErr);
      merkleOk = false;
    }

    // Step 5: Direct blockchain RPC check from client browser
    const candidateRpcs = getClientCandidateRpcs();
    const onChainResult = await executeDirectOnChainVerify(
      proofData.manifestSha256,
      proofData.proof || [],
      proofData.root,
      contractAddress,
      candidateRpcs
    );

    if ("error" in onChainResult) {
      return {
        filename: file.name,
        sha256,
        state: "CHAIN_CHECK_FAILED",
        statusText: `The blockchain RPC was unreachable or returned an error (${onChainResult.error}).`,
        steps: {
          hashComputed: true,
          foundInManifest: true,
          merkleProofValid: merkleOk,
          onChainConfirmed: false,
        },
        captureId: proofData.captureId,
        kind: proofData.kind,
        contract: contractAddress,
        root: proofData.root,
        txHash: proofData.txHash,
        blockNumber: proofData.blockNumber,
        chainId: proofData.chainId,
      };
    }

    if (!onChainResult.ok) {
      return {
        filename: file.name,
        sha256,
        state: "ALTERED",
        statusText: "On-chain verification failed: Merkle proof was rejected by the smart contract.",
        steps: {
          hashComputed: true,
          foundInManifest: true,
          merkleProofValid: false,
          onChainConfirmed: false,
        },
        captureId: proofData.captureId,
        kind: proofData.kind,
        contract: contractAddress,
        root: proofData.root,
        txHash: proofData.txHash,
      };
    }

    // Successfully verified on-chain
    const blockTimeMs = onChainResult.timestamp * 1000;
    return {
      filename: file.name,
      sha256,
      state: "VERIFIED",
      statusText: `Verified: this exact file existed unaltered on the blockchain.`,
      steps: {
        hashComputed: true,
        foundInManifest: true,
        merkleProofValid: true,
        onChainConfirmed: true,
      },
      captureId: proofData.captureId,
      kind: proofData.kind,
      blockNumber: proofData.blockNumber,
      blockTimeIst: formatIST(blockTimeMs),
      blockTimeUtc: formatUtc(blockTimeMs),
      txHash: proofData.txHash,
      contract: contractAddress,
      root: proofData.root,
      chainId: proofData.chainId,
    };
  };

  // -------------------------------------------------------------
  // Trustless Bundle Verification (Browser ZIP Only, Zero Saakshi API Calls)
  // -------------------------------------------------------------
  const verifyBundleFile = async (file: File): Promise<VerificationFileResult[]> => {
    const bundleResults: VerificationFileResult[] = [];
    const arrayBuf = await file.arrayBuffer();

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(arrayBuf);
    } catch (zipErr) {
      return [
        {
          filename: file.name,
          sha256: "invalid_zip",
          state: "NOT_FOUND",
          statusText: `Could not parse ZIP evidence bundle: ${zipErr instanceof Error ? zipErr.message : String(zipErr)}`,
          steps: {
            hashComputed: false,
            foundInManifest: false,
            merkleProofValid: false,
            onChainConfirmed: false,
          },
          isBundle: true,
        },
      ];
    }

    // 1. Read manifest.json
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) {
      return [
        {
          filename: file.name,
          sha256: "missing_manifest",
          state: "NOT_FOUND",
          statusText: "Invalid bundle: manifest.json is missing.",
          steps: {
            hashComputed: true,
            foundInManifest: false,
            merkleProofValid: false,
            onChainConfirmed: false,
          },
          isBundle: true,
        },
      ];
    }

    let manifest: any;
    try {
      const manifestStr = await manifestFile.async("string");
      manifest = JSON.parse(manifestStr);
    } catch {
      return [
        {
          filename: file.name,
          sha256: "corrupted_manifest",
          state: "ALTERED",
          statusText: "This bundle has been changed since it was captured (malformed manifest.json).",
          steps: {
            hashComputed: true,
            foundInManifest: false,
            merkleProofValid: false,
            onChainConfirmed: false,
          },
          isBundle: true,
        },
      ];
    }

    // 2. Recompute canonical manifestSha256 via RFC 8785 JCS
    const { manifestSha256 } = await computeCanonicalManifestHash(manifest);

    // 3. Read proof.json
    const proofFile = zip.file("proof.json");
    if (!proofFile) {
      return [
        {
          filename: "manifest.json",
          sha256: manifestSha256,
          state: "NOT_YET_ANCHORED",
          statusText: "The capture exists in bundle but has not been anchored to the blockchain yet (missing proof.json).",
          steps: {
            hashComputed: true,
            foundInManifest: true,
            merkleProofValid: false,
            onChainConfirmed: false,
          },
          captureId: manifest.captureId,
          isBundle: true,
        },
      ];
    }

    let proofJson: any;
    try {
      const proofStr = await proofFile.async("string");
      proofJson = JSON.parse(proofStr);
    } catch {
      return [
        {
          filename: "proof.json",
          sha256: "corrupted_proof",
          state: "ALTERED",
          statusText: "This file has been changed since it was captured (malformed proof.json).",
          steps: {
            hashComputed: true,
            foundInManifest: true,
            merkleProofValid: false,
            onChainConfirmed: false,
          },
          captureId: manifest.captureId,
          isBundle: true,
        },
      ];
    }

    // Security check: verify proof contract and chain match expected deployment
    const contractAddress = proofJson.contract || expectedContract;
    const securityCheck = validateProofSecurity(proofJson, {
      contract: expectedContract,
      chainId: expectedChainId,
    });

    if (!securityCheck.valid) {
      return [
        {
          filename: `${file.name} (proof.json)`,
          sha256: manifestSha256,
          state: "ALTERED",
          statusText: securityCheck.error || "This proof points to a different contract.",
          securityError: securityCheck.error,
          steps: {
            hashComputed: true,
            foundInManifest: true,
            merkleProofValid: false,
            onChainConfirmed: false,
          },
          captureId: manifest.captureId,
          contract: contractAddress,
          root: proofJson.root,
          isBundle: true,
        },
      ];
    }

    // Verify manifestSha256 against proof.json
    if (proofJson.manifestSha256.toLowerCase() !== manifestSha256.toLowerCase()) {
      return [
        {
          filename: "manifest.json",
          sha256: manifestSha256,
          state: "ALTERED",
          statusText: "This file has been changed since it was captured (manifest hash does not match anchored proof).",
          steps: {
            hashComputed: true,
            foundInManifest: false,
            merkleProofValid: false,
            onChainConfirmed: false,
          },
          captureId: manifest.captureId,
          isBundle: true,
        },
      ];
    }

    // Verify Merkle inclusion proof in JavaScript
    let merkleValid = false;
    try {
      const leafHash = `0x${manifestSha256}`;
      merkleValid = StandardMerkleTree.verify(
        proofJson.root,
        ["bytes32"],
        [leafHash],
        proofJson.proof || []
      );
    } catch {
      merkleValid = false;
    }

    // Direct On-Chain Query via public RPC node
    const candidateRpcs = getClientCandidateRpcs();
    const onChainResult = await executeDirectOnChainVerify(
      manifestSha256,
      proofJson.proof || [],
      proofJson.root,
      contractAddress,
      candidateRpcs
    );

    const onChainConfirmed = !("error" in onChainResult) && onChainResult.ok;
    const blockTimeMs = !("error" in onChainResult) ? onChainResult.timestamp * 1000 : 0;

    // 4. Verify each individual artifact in the bundle
    const manifestArtifacts: any[] = manifest.artifacts || [];
    for (const art of manifestArtifacts) {
      // Find entry in ZIP
      const entry =
        zip.file(`artifacts/${art.filename}`) ||
        zip.file(`artifacts/${art.id}_${art.kind}`) ||
        zip.file(`artifacts/${art.id}`) ||
        zip.file(art.filename);

      if (!entry) {
        bundleResults.push({
          filename: art.filename || art.id,
          sha256: art.sha256,
          state: "ALTERED",
          statusText: "This file has been changed since it was captured (missing from artifacts directory).",
          steps: {
            hashComputed: false,
            foundInManifest: true,
            merkleProofValid: merkleValid,
            onChainConfirmed,
          },
          captureId: manifest.captureId,
          kind: art.kind,
          isBundle: true,
        });
        continue;
      }

      const fileU8 = await entry.async("uint8array");
      const computedHash = await sha256Hex(fileU8);

      if (computedHash.toLowerCase() !== art.sha256.toLowerCase()) {
        bundleResults.push({
          filename: art.filename || art.id,
          sha256: computedHash,
          state: "ALTERED",
          statusText: "This file has been changed since it was captured.",
          steps: {
            hashComputed: true,
            foundInManifest: true,
            merkleProofValid: merkleValid,
            onChainConfirmed,
          },
          captureId: manifest.captureId,
          kind: art.kind,
          isBundle: true,
        });
        continue;
      }

      // Hash matches manifest! Check on-chain result
      if ("error" in onChainResult) {
        bundleResults.push({
          filename: art.filename || art.id,
          sha256: computedHash,
          state: "CHAIN_CHECK_FAILED",
          statusText: `The blockchain RPC was unreachable or returned an error (${onChainResult.error}).`,
          steps: {
            hashComputed: true,
            foundInManifest: true,
            merkleProofValid: merkleValid,
            onChainConfirmed: false,
          },
          captureId: manifest.captureId,
          kind: art.kind,
          contract: contractAddress,
          root: proofJson.root,
          txHash: proofJson.txHash,
          blockNumber: proofJson.blockNumber,
          chainId: proofJson.chainId,
          isBundle: true,
        });
      } else if (!onChainResult.ok) {
        bundleResults.push({
          filename: art.filename || art.id,
          sha256: computedHash,
          state: "ALTERED",
          statusText: "On-chain verification failed: Smart contract rejected the Merkle proof.",
          steps: {
            hashComputed: true,
            foundInManifest: true,
            merkleProofValid: false,
            onChainConfirmed: false,
          },
          captureId: manifest.captureId,
          kind: art.kind,
          isBundle: true,
        });
      } else {
        bundleResults.push({
          filename: art.filename || art.id,
          sha256: computedHash,
          state: "VERIFIED",
          statusText: "Verified: this exact file existed unaltered on the blockchain.",
          steps: {
            hashComputed: true,
            foundInManifest: true,
            merkleProofValid: true,
            onChainConfirmed: true,
          },
          captureId: manifest.captureId,
          kind: art.kind,
          blockNumber: proofJson.blockNumber,
          blockTimeIst: formatIST(blockTimeMs),
          blockTimeUtc: formatUtc(blockTimeMs),
          txHash: proofJson.txHash,
          contract: contractAddress,
          root: proofJson.root,
          chainId: proofJson.chainId,
          isBundle: true,
        });
      }
    }

    return bundleResults;
  };

  // -------------------------------------------------------------
  // Master File Dispatcher
  // -------------------------------------------------------------
  const verifyFiles = async (files: FileList | File[]) => {
    setVerifying(true);
    setStatusMessage("Processing files locally with WebCrypto...");
    const accumulated: VerificationFileResult[] = [];

    for (const file of Array.from(files)) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        const zipResults = await verifyBundleFile(file);
        accumulated.push(...zipResults);
      } else {
        const singleResult = await verifySingleFile(file);
        accumulated.push(singleResult);
      }
    }

    setResults(accumulated);
    setVerifying(false);
    setStatusMessage(`Verification complete for ${accumulated.length} item(s).`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      verifyFiles(e.dataTransfer.files);
    }
  };

  // Retry blockchain check on any items that suffered network/RPC failure
  const retryFailedChecks = async () => {
    setVerifying(true);
    setStatusMessage("Retrying blockchain RPC connection...");
    const updated = await Promise.all(
      results.map(async (res) => {
        if (res.state !== "CHAIN_CHECK_FAILED" || !res.contract || !res.root) {
          return res;
        }

        const candidateRpcs = getClientCandidateRpcs();
        const onChain = await executeDirectOnChainVerify(
          res.sha256,
          [],
          res.root,
          res.contract,
          candidateRpcs
        );

        if (!("error" in onChain) && onChain.ok) {
          const blockTimeMs = onChain.timestamp * 1000;
          return {
            ...res,
            state: "VERIFIED" as ResultState,
            statusText: "Verified: this exact file existed unaltered on the blockchain.",
            steps: {
              ...res.steps,
              onChainConfirmed: true,
            },
            blockTimeIst: formatIST(blockTimeMs),
            blockTimeUtc: formatUtc(blockTimeMs),
          };
        }
        return res;
      })
    );
    setResults(updated);
    setVerifying(false);
  };

  const hasRpcFailure = results.some((r) => r.state === "CHAIN_CHECK_FAILED");

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-10">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold mb-4">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
          <span>Trustless Client-Side Verification</span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Verify Web Evidence</h1>
        <p className="text-sm text-slate-600 max-w-2xl mx-auto mt-2 leading-relaxed">
          Files never leave your computer. SHA-256 digests are computed inside your browser using W3C WebCrypto.
        </p>
        <p className="text-xs text-slate-500 font-medium mt-1">
          Saakshi&apos;s index finds the proof; your browser checks it on the blockchain.
        </p>
      </div>

      {/* Accessible Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all bg-white shadow-sm ${
          dragOver ? "border-emerald-600 bg-emerald-50/20" : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <UploadCloud className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">
          Drop any artifact or evidence bundle here
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          JPG/PNG screenshots, PDF, JSON, text and ZIP evidence bundles (up to 200 MB per file).
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          id="verify-file-input"
          aria-label="Choose files to verify locally"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              verifyFiles(e.target.files);
            }
          }}
        />

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors focus:ring-2 focus:ring-slate-900 focus:outline-none"
          >
            Choose Files Locally
          </button>
        </div>
      </div>

      {/* Accessible Live Region */}
      <div className="sr-only" aria-live="polite" role="status">
        {statusMessage}
      </div>

      {/* Verifying Loader */}
      {verifying && (
        <div className="p-6 bg-white rounded-xl border border-slate-200 text-center space-y-3 shadow-sm">
          <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-mono text-slate-600">
            Evaluating WebCrypto SHA-256 digest and executing direct blockchain RPC verification...
          </p>
        </div>
      )}

      {/* Retry Action Banner on RPC Failure */}
      {hasRpcFailure && !verifying && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <p className="text-xs text-amber-900 font-medium">
              One or more blockchain RPC checks failed to connect. Try connecting via a fallback node.
            </p>
          </div>
          <button
            type="button"
            onClick={retryFailedChecks}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Retry Blockchain Check</span>
          </button>
        </div>
      )}

      {/* Results List */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Verification Outcomes ({results.length})
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Pure client-side verification
            </span>
          </div>

          {results.map((res, idx) => {
            const isVerified = res.state === "VERIFIED";
            const isAltered = res.state === "ALTERED";
            const isNotFound = res.state === "NOT_FOUND";
            const isPendingAnchor = res.state === "NOT_YET_ANCHORED";
            const isChainFailed = res.state === "CHAIN_CHECK_FAILED";

            return (
              <div
                key={idx}
                className={`p-6 rounded-xl border transition-all ${
                  isVerified
                    ? "bg-emerald-50/50 border-emerald-300 shadow-sm"
                    : isAltered
                    ? "bg-rose-50/50 border-rose-300 shadow-sm"
                    : isNotFound
                    ? "bg-slate-50 border-slate-300 shadow-sm"
                    : "bg-amber-50/50 border-amber-300 shadow-sm"
                }`}
              >
                <div className="flex items-start space-x-4">
                  <div className="mt-0.5 shrink-0">
                    {isVerified && <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
                    {isAltered && <XCircle className="w-6 h-6 text-rose-600" />}
                    {isNotFound && <HelpCircle className="w-6 h-6 text-slate-500" />}
                    {(isPendingAnchor || isChainFailed) && (
                      <AlertTriangle className="w-6 h-6 text-amber-600" />
                    )}
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        {res.isBundle && <FolderArchive className="w-4 h-4 text-slate-500" />}
                        <h4 className="text-sm font-bold text-slate-900">{res.filename}</h4>
                        {res.kind && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {res.kind}
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-md ${
                          isVerified
                            ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                            : isAltered
                            ? "bg-rose-100 text-rose-900 border border-rose-300"
                            : isNotFound
                            ? "bg-slate-200 text-slate-800 border border-slate-300"
                            : "bg-amber-100 text-amber-900 border border-amber-300"
                        }`}
                      >
                        {res.state}
                      </span>
                    </div>

                    <p className="text-xs text-slate-800 leading-relaxed font-medium">
                      {res.statusText}
                    </p>

                    {/* Step-by-Step Checks Progress */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono">
                      <div
                        className={`p-2 rounded border flex items-center space-x-1.5 ${
                          res.steps.hashComputed
                            ? "bg-emerald-50/70 border-emerald-200 text-emerald-800"
                            : "bg-slate-50 border-slate-200 text-slate-400"
                        }`}
                      >
                        <span className="font-bold">1.</span>
                        <span>Hash Computed</span>
                      </div>
                      <div
                        className={`p-2 rounded border flex items-center space-x-1.5 ${
                          res.steps.foundInManifest
                            ? "bg-emerald-50/70 border-emerald-200 text-emerald-800"
                            : "bg-slate-50 border-slate-200 text-slate-400"
                        }`}
                      >
                        <span className="font-bold">2.</span>
                        <span>In Manifest</span>
                      </div>
                      <div
                        className={`p-2 rounded border flex items-center space-x-1.5 ${
                          res.steps.merkleProofValid
                            ? "bg-emerald-50/70 border-emerald-200 text-emerald-800"
                            : "bg-slate-50 border-slate-200 text-slate-400"
                        }`}
                      >
                        <span className="font-bold">3.</span>
                        <span>Merkle Proof</span>
                      </div>
                      <div
                        className={`p-2 rounded border flex items-center space-x-1.5 ${
                          res.steps.onChainConfirmed
                            ? "bg-emerald-50/70 border-emerald-200 text-emerald-800"
                            : "bg-slate-50 border-slate-200 text-slate-400"
                        }`}
                      >
                        <span className="font-bold">4.</span>
                        <span>On-Chain Root</span>
                      </div>
                    </div>

                    {/* Hash & On-chain Details Box */}
                    <div className="p-3 bg-white rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700 break-all space-y-1.5">
                      <div>
                        <span className="text-slate-400">Local SHA-256: </span>
                        <span className="select-all">{res.sha256}</span>
                      </div>

                      {res.blockNumber && (
                        <div className="text-slate-600">
                          <span className="text-slate-400">Block Number: </span>
                          <span className="font-bold">#{res.blockNumber}</span>
                          {res.blockTimeIst && (
                            <span>
                              {" "}
                              &bull; {res.blockTimeIst}{" "}
                              <span className="text-slate-400">({res.blockTimeUtc})</span>
                            </span>
                          )}
                        </div>
                      )}

                      {res.txHash && (
                        <div className="flex items-center justify-between pt-0.5">
                          <span>
                            <span className="text-slate-400">Tx Hash: </span>
                            <span className="select-all">{truncateHash(res.txHash, 10, 8)}</span>
                          </span>
                          {explorerUrl ? (
                            <a
                              href={`${explorerUrl}/tx/${res.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-700 hover:underline flex items-center space-x-1"
                            >
                              <span>Explorer</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-sans">
                              (Local Chain)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Link to Capture Record */}
                    {res.captureId && (
                      <div className="pt-1">
                        <Link
                          href={`/v/${res.captureId}`}
                          className="text-xs font-semibold text-blue-700 hover:underline inline-flex items-center space-x-1"
                        >
                          <span>View Public Evidence Certificate</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Technical Architecture Guarantee Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm space-y-3">
        <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
          <Lock className="w-4 h-4 text-slate-700" />
          <h3>How Independent Client-Side Verification Operates</h3>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Anyone holding an artifact file, screenshot, or ZIP bundle can independently substantiate that it has not been modified since capture.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs text-slate-700">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="font-bold block text-slate-900 mb-1">1. Local Hashing</span>
            <span>Your browser reads the file bytes locally and evaluates the SHA-256 digest via W3C WebCrypto. No file bytes leave your device.</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="font-bold block text-slate-900 mb-1">2. Merkle Batch Tree</span>
            <span>The computed hash is matched against the Merkle batch tree to obtain the cryptographic inclusion path.</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="font-bold block text-slate-900 mb-1">3. Direct Blockchain Call</span>
            <span>Your browser directly queries the EvidenceRegistry smart contract to verify the anchored root and block timestamp.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
