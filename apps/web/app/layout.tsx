import "./globals.css";
import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck, Plus, Search, LayoutDashboard, Terminal, Activity, FileCheck, Scale, Lock } from "lucide-react";

export const metadata: Metadata = {
  title: "Saakshi | Cryptographic Web Evidence & Verification",
  description:
    "Agentic, tamper-proof, court-admissible web evidence preserved by autonomous web agents, fingerprinted with SHA-256, and timestamped on Polygon.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isFixture = process.env.TINYFISH_MODE === "fixture";

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 antialiased selection:bg-slate-900 selection:text-white">
        {/* Development Fixture Mode Notice */}
        {isFixture && (
          <div className="bg-amber-100/90 border-b border-amber-200 text-amber-950 px-4 py-1.5 text-xs font-medium text-center flex items-center justify-center space-x-2">
            <Activity className="w-3.5 h-3.5 text-amber-800 shrink-0" />
            <span>
              <strong>FIXTURE MODE:</strong> TinyFish agent captures and blockchain operations run in local fixture mode for rapid testing.
            </span>
          </div>
        )}

        {/* Global Navigation Header */}
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/90">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            {/* Brand Logo */}
            <Link
              href="/"
              className="flex items-center space-x-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded-lg p-1"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-sm border border-slate-800 transition-colors">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight text-slate-900 leading-none">
                  Saakshi
                </span>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-0.5">
                  Web Evidence Engine
                </span>
              </div>
            </Link>

            {/* Navigation Links */}
            <nav className="flex items-center space-x-1 sm:space-x-2">
              <Link
                href="/dashboard"
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg flex items-center space-x-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>

              <Link
                href="/verify"
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg flex items-center space-x-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Verify a File</span>
              </Link>

              <Link
                href="/sandbox/admin"
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg flex items-center space-x-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Chirp Sandbox</span>
              </Link>

              <Link
                href="/capture/new"
                className="ml-2 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm flex items-center space-x-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Capture</span>
              </Link>
            </nav>
          </div>
        </header>

        {/* Main Content Body */}
        <main className="flex-1">{children}</main>

        {/* Global Production Footer */}
        <footer className="bg-white border-t border-slate-200 py-12 px-4 sm:px-6 lg:px-8 mt-auto">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 text-xs text-slate-600">
            {/* Column 1: Brand & Architecture */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded bg-slate-900 flex items-center justify-center text-white">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <span className="font-bold text-slate-900 text-sm tracking-tight">Saakshi (साक्षी)</span>
              </div>
              <p className="text-slate-500 leading-relaxed max-w-md">
                An autonomous web evidence preservation engine. Autonomous web agents document unalterable browser filmstrips, fingerprint plaintext artifacts with SHA-256, format canonical RFC 8785 manifests, and anchor immutable timestamps on Polygon.
              </p>
              <div className="text-[11px] text-slate-400 font-mono">
                BSA 2023 s.63(4) Part A Drafting Aid &bull; Client-Side WebCrypto Verification
              </div>
            </div>

            {/* Column 2: Platform Links */}
            <div className="space-y-2">
              <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                Platform
              </div>
              <ul className="space-y-1.5">
                <li>
                  <Link href="/capture/new" className="hover:text-slate-900 hover:underline">
                    Initiate Capture
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="hover:text-slate-900 hover:underline">
                    Evidence Dashboard
                  </Link>
                </li>
                <li>
                  <Link href="/verify" className="hover:text-slate-900 hover:underline">
                    Public Trustless Verifier
                  </Link>
                </li>
                <li>
                  <Link href="/sandbox/admin" className="hover:text-slate-900 hover:underline">
                    Chirp Platform Simulator
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3: Legal & Standards */}
            <div className="space-y-2">
              <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                Legal &amp; Architecture
              </div>
              <ul className="space-y-1.5">
                <li>
                  <Link href="/privacy" className="hover:text-slate-900 hover:underline">
                    Privacy Policy &amp; Data Governance
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-slate-900 hover:underline">
                    Terms &amp; Evidentiary Disclaimers
                  </Link>
                </li>
                <li>
                  <a
                    href="https://amoy.polygonscan.com"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-slate-900 hover:underline"
                  >
                    Polygon Amoy Explorer
                  </a>
                </li>
                <li>
                  <Link href="/sandbox/post/internship-scam-alert" className="hover:text-slate-900 hover:underline">
                    Demo Post Benchmark
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="max-w-7xl mx-auto pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
            <div>
              &copy; 2026 Saakshi. Built by Team Eclipse for KRITICAL HACKS &apos;26 (AssetMerkle &times; IGDTUW).
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/privacy" className="hover:text-slate-900">
                Privacy
              </Link>
              <span>&bull;</span>
              <Link href="/terms" className="hover:text-slate-900">
                Terms
              </Link>
              <span>&bull;</span>
              <Link href="/verify" className="hover:text-slate-900">
                Verify
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
