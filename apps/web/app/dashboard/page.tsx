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
  Activity,
} from "lucide-react";
import { formatIST } from "@/lib/utils";

export default function DashboardPage() {
  const [captures, setCaptures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [quota, setQuota] = useState<{ remaining: number; total: number } | null>(null);

  const fetchCaptures = async () => {
    try {
      const res = await fetch("/api/captures");
      if (res.ok) {
        const data = await res.json();
        setCaptures(data.captures || []);
        if (data.quota) {
          setQuota(data.quota);
        }
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
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Evidence Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your preserved digital records, Merkle anchors, and active deletion watches.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-sm">
            Quota:{" "}
            <span className="text-blue-700 font-mono">
              {quota ? `${quota.remaining} of ${quota.total} remaining today` : "5 remaining today"}
            </span>
          </div>
          <Link
            href="/capture/new"
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900"
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
            placeholder="Search captures by URL, ID, or title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-sm"
          />
        </div>
      </div>

      {/* Captures Table / List */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 font-mono">Loading captures...</div>
        ) : filteredCaptures.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Layers className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">No Captures Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You haven&apos;t preserved any web evidence yet. Try capturing our Chirp demo post.
            </p>
            <Link
              href="/capture/new"
              className="inline-block mt-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
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
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        cap.status === "ANCHORED"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                          : cap.status === "READY"
                          ? "bg-blue-50 text-blue-800 border border-blue-200"
                          : cap.status === "PARTIAL"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : cap.status === "FAILED"
                          ? "bg-rose-50 text-rose-800 border border-rose-200"
                          : "bg-slate-100 text-slate-800 border border-slate-200"
                      }`}
                    >
                      {cap.status}
                    </span>
                    {cap.isWatching && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-300 flex items-center space-x-1">
                        <Activity className="w-3 h-3 text-slate-600" />
                        <span>WATCHING</span>
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
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center space-x-1 transition-colors"
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
