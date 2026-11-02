"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, CheckCircle2, XCircle, ShieldCheck, AlertCircle } from "lucide-react";

interface ScopedArtifact {
  id: string;
  kind: string;
  sha256: string;
}

interface ScopedVerifierProps {
  captureId: string;
  manifestSha256?: string;
  artifacts: ScopedArtifact[];
}

interface MatchResult {
  filename: string;
  sha256: string;
  matched: boolean;
  message: string;
  detail?: string;
}

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB limit

export function ScopedVerifier({ captureId, manifestSha256, artifacts }: ScopedVerifierProps) {
  const [verifying, setVerifying] = useState(false);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const computeSha256InBrowser = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const digestBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(digestBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toLowerCase();
  };

  const processFiles = async (files: FileList | File[]) => {
    setVerifying(true);
    setStatusMessage("Computing cryptographic SHA-256 digest locally in browser...");
    const newResults: MatchResult[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        newResults.push({
          filename: file.name,
          sha256: "skipped",
          matched: false,
          message: "File exceeds 200 MB limit. Files are never uploaded: only the 64-character hash is verified.",
        });
        continue;
      }

      try {
        const hash = await computeSha256InBrowser(file);

        // Check if hash matches manifest
        if (manifestSha256 && hash === manifestSha256.toLowerCase()) {
          newResults.push({
            filename: file.name,
            sha256: hash,
            matched: true,
            message: "Exact match: This file matches the canonical manifest.json for this capture.",
            detail: `Manifest SHA-256: ${hash}`,
          });
          continue;
        }

        // Check if hash matches an artifact in this capture
        const matchedArtifact = artifacts.find(
          (a) => a.sha256.toLowerCase() === hash
        );

        if (matchedArtifact) {
          newResults.push({
            filename: file.name,
            sha256: hash,
            matched: true,
            message: `Exact match: This file matches preserved artifact "${matchedArtifact.id}" (${matchedArtifact.kind}) in this capture.`,
            detail: `Artifact ID: ${matchedArtifact.id} | Kind: ${matchedArtifact.kind}`,
          });
        } else {
          newResults.push({
            filename: file.name,
            sha256: hash,
            matched: false,
            message: `This file does not match any artifact recorded in capture ${captureId}.`,
            detail: `Computed SHA-256: ${hash}`,
          });
        }
      } catch (err) {
        newResults.push({
          filename: file.name,
          sha256: "error",
          matched: false,
          message: `Failed to hash file: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    setResults(newResults);
    setVerifying(false);
    setStatusMessage(`Completed verification for ${newResults.length} file(s).`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  return (
    <section className="space-y-4 pt-4 border-t border-slate-100" aria-labelledby="scoped-verifier-heading">
      <div className="flex items-center space-x-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        <h3 id="scoped-verifier-heading" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Verify a file against this capture
        </h3>
      </div>
      <p className="text-xs text-slate-600">
        Drop any loose file or export to confirm it belongs to this specific capture record unaltered.
      </p>

      {/* Accessible Drag & Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-all bg-slate-50/50 ${
          dragOver ? "border-emerald-600 bg-emerald-50/20" : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-xs font-semibold text-slate-800">
          Drop a file here to compare against this capture
        </p>
        <p className="text-[11px] text-slate-500 mt-1">
          Supported: JPG/PNG screenshots, PDF, JSON, text and ZIP evidence bundles (up to 200 MB).
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          id="scoped-file-input"
          aria-label="Choose files to verify against this capture"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              processFiles(e.target.files);
            }
          }}
        />

        <div className="mt-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors focus:ring-2 focus:ring-slate-900 focus:outline-none"
          >
            Select Local File
          </button>
        </div>
      </div>

      {/* Accessible Live Region */}
      <div className="sr-only" aria-live="polite" role="status">
        {statusMessage}
      </div>

      {verifying && (
        <div className="p-3 bg-white border border-slate-200 rounded-lg text-center text-xs text-slate-600 font-mono">
          Evaluating SHA-256 hash locally in browser...
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2 mt-4">
          {results.map((res, i) => (
            <div
              key={i}
              data-testid="scoped-match-result"
              data-matched={String(res.matched)}
              className={`p-3 rounded-lg border text-xs flex items-start space-x-3 ${
                res.matched
                  ? "bg-emerald-50/60 border-emerald-300 text-emerald-950"
                  : "bg-rose-50/60 border-rose-300 text-rose-950"
              }`}
            >
              {res.matched ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{res.filename}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      res.matched
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-rose-100 text-rose-800 border border-rose-300"
                    }`}
                  >
                    {res.matched ? "MATCH CONFIRMED" : "NO MATCH IN THIS CAPTURE"}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed">{res.message}</p>
                {res.detail && (
                  <p className="font-mono text-[10px] text-slate-500 break-all select-all pt-0.5">
                    {res.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
