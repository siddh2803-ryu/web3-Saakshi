"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Plus,
  Layers,
  Eye,
  Clock,
  ArrowRight,
  ExternalLink,
  Search,
  Filter,
} from "lucide-react";
import { formatIST } from "@/lib/utils";

export default function DashboardPage() {
  const [captures, setCaptures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchCaptures = async () => {
    try {
      const res = await fetch("/api/captures");
      if (res.ok) {
        const data = await res.json();
        setCaptures(data.captures || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaptures();
  }, []);

  const filteredCaptures = captures.filter((c) => {
    const text = `${c.url} ${c.goal || ""} ${c.manifest?.observed?.title || ""}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-night">Evidence Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your preserved digital records, Merkle anchors, and active deletion watches.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-card">
            Quota: <span className="text-saakshi-indigo">5 remaining today</span>
          </div>
          <Link
            href="/capture/new"
            className="px-4 py-2 bg-saakshi-indigo hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-soft flex items-center space-x-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Capture</span>
          </Link>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search captures by URL or title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-saakshi-indigo shadow-card"
          />
        </div>
      </div>

      {/* Captures Table / List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading captures...</div>
        ) : filteredCaptures.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Layers className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">No Captures Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You haven&apos;t preserved any web evidence yet. Try capturing our Chirp demo post.
            </p>
            <Link
              href="/capture/new"
              className="inline-block mt-2 px-4 py-2 bg-saakshi-indigo text-white text-xs font-semibold rounded-lg"
            >
              Start First Capture
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredCaptures.map((cap) => (
              <div
                key={cap.id}
                className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-slate-700">{cap.id}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        cap.status === "ANCHORED"
                          ? "bg-emerald-100 text-emerald-800"
                          : cap.status === "READY"
                          ? "bg-indigo-100 text-saakshi-indigo"
                          : cap.status === "PARTIAL"
                          ? "bg-amber-100 text-amber-800"
                          : cap.status === "FAILED"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {cap.status}
                    </span>
                    {cap.isWatching && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                        WATCHING
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 leading-snug">
                    {cap.manifest?.observed?.title || cap.url}
                  </h3>
                  <div className="flex items-center space-x-3 text-xs text-slate-400 font-mono">
                    <span className="truncate max-w-sm">{cap.url}</span>
                    <span>&bull;</span>
                    <span>{formatIST(cap.createdAt)}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <Link
                    href={`/capture/${cap.id}`}
                    className="px-3.5 py-1.5 text-xs font-semibold text-saakshi-indigo bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center space-x-1 transition-colors"
                  >
                    <span>View Evidence</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
