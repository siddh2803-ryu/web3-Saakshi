import React from "react";
import Link from "next/link";
import { ShieldCheck, ArrowLeft, Lock, Database, Cpu, Eye, FileText, Scale } from "lucide-react";

export const metadata = {
  title: "Privacy Policy | Saakshi",
  description:
    "Data collection, cryptographic processing, browser verification guarantees, and storage architecture for the Saakshi web evidence platform.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
      {/* Back button */}
      <div className="mb-8">
        <Link
          href="/"
          className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
      </div>

      {/* Header */}
      <div className="border-b border-slate-200 pb-8 mb-10">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium mb-3">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-700" />
          <span>Data Governance &amp; Cryptographic Architecture</span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-xs text-slate-500 mt-2 font-mono">
          Last Updated: October 2026 &bull; Project: Saakshi (Team Eclipse)
        </p>
      </div>

      {/* Content */}
      <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-700 space-y-10">
        {/* Section 1 */}
        <section className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-base">
            <Lock className="w-5 h-5 text-slate-700" />
            <h2>1. Core Privacy Architecture &amp; Client-Side Verification</h2>
          </div>
          <p>
            Saakshi is built upon a fundamental architectural commitment: trust through cryptographic verification rather than centralized authority.
          </p>
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-950 space-y-2">
            <p className="font-semibold text-emerald-900">
              Zero-Knowledge Verification Guarantee (W3C WebCrypto API)
            </p>
            <p>
              When you drop or select a file on the public verifier page (/verify), your file is never uploaded to Saakshi servers or external services. The SHA-256 digest is calculated locally inside your browser memory using the standard W3C WebCrypto API (crypto.subtle.digest). Only the resulting 64-character hexadecimal hash string is matched against the public blockchain index.
            </p>
          </div>
        </section>

        {/* Section 2 */}
        <section className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-base">
            <Database className="w-5 h-5 text-slate-700" />
            <h2>2. Information Collected and Processed During Evidence Capture</h2>
          </div>
          <p>
            When an authenticated or authorized user initiates an evidence capture session, Saakshi collects and processes the following parameters:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600">
            <li>
              <strong>Target Uniform Resource Identifier (URL):</strong> The public web address designated by the user for forensic preservation.
            </li>
            <li>
              <strong>Investigation Objective:</strong> Optional user-defined instructions directing the autonomous agent to observe specific page sections, reply chains, or payment disclosures.
            </li>
            <li>
              <strong>Preserved Web Artifacts:</strong> Static HTML source code, full-page PNG screenshots, PDF document exports, HTTP transaction headers, and step-by-step navigation filmstrips captured by our autonomous browser agents.
            </li>
            <li>
              <strong>Cryptographic Manifests:</strong> Canonical JSON representations (RFC 8785 JCS), SHA-256 hash digests, Merkle branch paths, and transaction hashes generated during anchoring.
            </li>
            <li>
              <strong>Chain of Custody Logs:</strong> System event timestamps, capture identifiers, and cryptographically salted, one-way hashed user identifiers. Salted hashes prevent reverse identification while maintaining verifiable provenance.
            </li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-base">
            <Cpu className="w-5 h-5 text-slate-700" />
            <h2>3. Third-Party Integrations and Processing Systems</h2>
          </div>
          <p>
            To deliver automated, court-ready evidence pipelines, Saakshi interfaces with specialized technical providers:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <span className="font-bold text-slate-900 block">TinyFish Automation Suite</span>
              <p className="text-slate-600">
                Managed headless Chromium browser sessions and autonomous agents navigate target URLs using neutral, read-only profiles. The agents never authenticate into private accounts or bypass paywalls.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <span className="font-bold text-slate-900 block">Google Gemini API</span>
              <p className="text-slate-600">
                Text extracts from preserved artifacts are processed by Gemini to generate bilingual factual summaries (English and Hindi), identify parties, and draft Part A certificates under Section 63(4) of the BSA, 2023.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <span className="font-bold text-slate-900 block">Polygon Blockchain (Amoy Testnet)</span>
              <p className="text-slate-600">
                Merkle root hashes and custody transaction logs are broadcast to the Polygon Amoy testnet contract (EvidenceRegistry.sol). Blockchain state is permanent, public, and immutable.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <span className="font-bold text-slate-900 block">InterPlanetary File System (Pinata IPFS)</span>
              <p className="text-slate-600">
                Encrypted evidence archives and manifests are pinned to IPFS. Artifact payloads are protected with AES-256-GCM envelope encryption prior to distribution.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4 */}
        <section className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-base">
            <Eye className="w-5 h-5 text-slate-700" />
            <h2>4. Encryption, Data Retention, &amp; Deletion Watches</h2>
          </div>
          <p>
            Evidence integrity relies on layered cryptographic security:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600">
            <li>
              <strong>Envelope Encryption:</strong> Plaintext evidence files are sealed with AES-256-GCM. Per-capture Data Encryption Keys (DEKs) are wrapped with master key encryption.
            </li>
            <li>
              <strong>Expiring Share Links:</strong> Shared evidence bundles use cryptographic tokens with configurable expirations (default: 7 days), preventing indefinite exposure.
            </li>
            <li>
              <strong>Deletion Watch Monitor:</strong> Scheduled monitors periodically fetch target URLs to detect modifications or 404 deletion events. Historical hashes remain stored to demonstrate the delta between original and altered content.
            </li>
            <li>
              <strong>On-Chain Permanence:</strong> While local encrypted files may be removed upon request, cryptographic hashes committed to the Polygon blockchain cannot be retracted, edited, or deleted by any entity.
            </li>
          </ul>
        </section>

        {/* Section 5 */}
        <section className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-base">
            <Scale className="w-5 h-5 text-slate-700" />
            <h2>5. Legal Inquiries &amp; Information Requiring Enterprise Confirmation</h2>
          </div>
          <p>
            This software was created as an engineering research implementation by Team Eclipse for KRITICAL HACKS &apos;26 (AssetMerkle &times; IGDTUW).
          </p>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2 text-slate-700">
            <p>
              <strong>Notice of Enterprise Parameters:</strong> Formal corporate entity incorporation details, registered physical address, and designated Data Protection Officer (DPO) registration require formal confirmation prior to commercial corporate deployment.
            </p>
            <p>
              For technical inquiries, bug disclosures, or data requests, contact the project maintainers through our official GitHub repository.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
