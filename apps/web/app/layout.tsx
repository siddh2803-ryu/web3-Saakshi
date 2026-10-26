import "./globals.css";
import React from "react";
import Link from "next/link";
import { ShieldCheck, Plus, Search, LayoutDashboard, Terminal } from "lucide-react";

export const metadata = {
  title: "Saakshi | AI Witness for the Internet",
  description:
    "Agentic, tamper-proof, court-ready web evidence preserved by TinyFish web agents, fingerprinted with SHA-256, and anchored on Polygon.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isFixture = process.env.TINYFISH_MODE === "fixture";

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-[#F1F5F9] text-slate-900 antialiased">
        {/* Development Fixture Mode Notice */}
        {isFixture && (
          <div className="bg-amber-400 text-amber-950 px-4 py-1.5 text-xs font-semibold text-center flex items-center justify-center space-x-2">
            <span>⚡ FIXTURE MODE: TinyFish &amp; Polygon operations run in offline fixture mode for rapid UI testing.</span>
          </div>
        )}

        {/* Global Navigation Header */}
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            {/* Brand Logo */}
            <Link href="/" className="flex items-center space-x-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-night flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight text-night leading-none">
                  Saakshi
                </span>
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">
                  AI Web Witness
                </span>
              </div>
            </Link>

            {/* Navigation Links */}
            <nav className="flex items-center space-x-1 sm:space-x-3">
              <Link
                href="/dashboard"
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 rounded-lg flex items-center space-x-1.5 transition-colors"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>

              <Link
                href="/verify"
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 rounded-lg flex items-center space-x-1.5 transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Verify a File</span>
              </Link>

              <Link
                href="/sandbox/admin"
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 rounded-lg flex items-center space-x-1.5 transition-colors"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Chirp Sandbox</span>
              </Link>

              <Link
                href="/capture/new"
                className="ml-2 px-3.5 py-2 text-xs font-semibold text-white bg-saakshi-indigo hover:bg-indigo-700 rounded-lg shadow-sm flex items-center space-x-1.5 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Capture</span>
              </Link>
            </nav>
          </div>
        </header>

        {/* Main Content Body */}
        <main className="flex-1">{children}</main>

        {/* Global Footer */}
        <footer className="bg-white border-t border-slate-200/80 py-8 px-4 sm:px-6 lg:px-8 mt-auto">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Saakshi</span>
              <span>&bull; Built by Team Eclipse for KRITICAL HACKS &apos;26 (AssetMerkle &times; IGDTUW)</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/verify" className="hover:underline">
                Public Trustless Verifier
              </Link>
              <Link href="/sandbox/post/internship-scam-alert" className="hover:underline">
                Demo Post Target
              </Link>
              <span className="text-slate-400">BSA 2023 s.63(4) Part A Draft</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
