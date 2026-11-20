"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Plus,
  Layers,
  Folder,
  Eye,
  Clock,
  ArrowRight,
  ExternalLink,
  Search,
  Filter,
  Activity,
  AlertTriangle,
  AlertCircle,
  FolderPlus,
  X,
  Check,
} from "lucide-react";
import { formatIST } from "@/lib/utils";

type StatusFilterType = "ALL" | "READY" | "ANCHORED" | "WATCHING" | "EDITED" | "DELETED";

export default function DashboardPage() {
  const [captures, setCaptures] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>("ALL");
  const [caseFilter, setCaseFilter] = useState<string>("ALL");
  const [quota, setQuota] = useState<{ remaining: number; total: number } | null>(null);

  // New Case Modal state
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [newCaseTitle, setNewCaseTitle] = useState("");
  const [newCaseNotes, setNewCaseNotes] = useState("");
  const [creatingCase, setCreatingCase] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [capturesRes, casesRes] = await Promise.all([
        fetch("/api/captures"),
        fetch("/api/cases"),
      ]);

      if (capturesRes.ok) {
        const data = await capturesRes.json();
        setCaptures(data.captures || []);
        if (data.quota) {
          setQuota(data.quota);
        }
      }

      if (casesRes.ok) {
        const data = await casesRes.json();
        setCases(data.cases || []);
      }
      setFetchError(null);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setFetchError("Unable to load evidence dashboard records. Please check your network and retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseTitle.trim()) return;
    setCreatingCase(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newCaseTitle.trim(),
          notes: newCaseNotes.trim(),
        }),
      });
      if (res.ok) {
        setNewCaseTitle("");
        setNewCaseNotes("");
        setShowNewCaseModal(false);
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingCase(false);
    }
  };

  // Helper matching capture to status
  const matchesStatus = (c: any, filter: StatusFilterType): boolean => {
    if (filter === "ALL") return true;
    if (filter === "ANCHORED") return c.status === "ANCHORED";
    if (filter === "READY") return c.status === "READY";
    if (filter === "WATCHING") return Boolean(c.isWatching || c.watchState === "active");
    if (filter === "EDITED") {
      return c.watchState === "edited_detected" || c.watchAlert?.type === "EDITED";
    }
    if (filter === "DELETED") {
      return (
        c.watchState === "deleted_detected" ||
        c.watchAlert?.type === "DELETED" ||
        c.status === "DELETED"
      );
    }
    return true;
  };

  // Filtered captures calculation
  const filteredCaptures = captures.filter((c) => {
    // Search text filter
    const text = `${c.id} ${c.url} ${c.goal || ""} ${c.manifest?.observed?.title || ""}`.toLowerCase();
    if (searchTerm && !text.includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Status filter chip
    if (!matchesStatus(c, statusFilter)) {
      return false;
    }

    // Case filter dropdown
    if (caseFilter === "ALL") return true;
    if (caseFilter === "UNASSIGNED") return !c.caseId;
    return c.caseId === caseFilter;
  });

  const alertCaptures = captures.filter(
    (c) => Boolean(c.watchAlert) || c.watchState === "deleted_detected" || c.watchState === "edited_detected"
  );

  // Status counts for chips
  const countAll = captures.length;
  const countReady = captures.filter((c) => c.status === "READY").length;
  const countAnchored = captures.filter((c) => c.status === "ANCHORED").length;
  const countWatching = captures.filter((c) => Boolean(c.isWatching || c.watchState === "active")).length;
  const countEdited = captures.filter((c) => c.watchState === "edited_detected" || c.watchAlert?.type === "EDITED").length;
  const countDeleted = captures.filter(
    (c) => c.watchState === "deleted_detected" || c.watchAlert?.type === "DELETED" || c.status === "DELETED"
  ).length;

  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {fetchError && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2 text-rose-800 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            onClick={() => {
              setFetchError(null);
              setLoading(true);
              fetchData();
            }}
            className="px-3 py-1 bg-white border border-rose-300 text-rose-800 text-xs font-semibold rounded-md hover:bg-rose-100/50"
          >
            Retry
          </button>
        </div>
      )}

      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Evidence Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your preserved digital records, case matters, Merkle anchors, and active deletion watches.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-sm">
            Quota:{" "}
            <span className="text-blue-700 font-mono">
              {quota ? `${quota.remaining} of ${quota.total} remaining today` : "5 remaining today"}
            </span>
          </div>

          <button
            onClick={() => setShowNewCaseModal(true)}
            className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 transition-all"
          >
            <FolderPlus className="w-4 h-4 text-slate-600" />
            <span>New Case</span>
          </button>

          <Link
            href="/capture/new"
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900"
          >
            <Plus className="w-4 h-4" />
            <span>New Capture</span>
          </Link>
        </div>
      </div>

      {/* New Case Modal */}
      {showNewCaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FolderPlus className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Create New Case Matter</h3>
              </div>
              <button
                onClick={() => setShowNewCaseModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Group captures into a case for coordinated legal analysis, private notes, and case-level ZIP export.
            </p>
            <form onSubmit={handleCreateCase} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Case Title</label>
                <input
                  type="text"
                  placeholder="e.g. Chirp Defamation Matter - Nov 2026"
                  value={newCaseTitle}
                  onChange={(e) => setNewCaseTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Private Notes (Optional)</label>
                <textarea
                  placeholder="Private case references, client names, legal section citations..."
                  value={newCaseNotes}
                  onChange={(e) => setNewCaseNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCaseModal(false)}
                  className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCase || !newCaseTitle.trim()}
                  className="px-4 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  {creatingCase ? "Creating..." : "Create Case"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Alert Banners for Active Watch Detections */}
      {alertCaptures.length > 0 && (
        <div className="mb-6 space-y-3">
          {alertCaptures.map((ac) => {
            const alertType = ac.watchAlert?.type || (ac.watchState === "deleted_detected" ? "DELETED" : "EDITED");
            const isDel = alertType === "DELETED";
            return (
              <div
                key={ac.id}
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
                  isDel
                    ? "bg-rose-50/90 border-rose-300 text-rose-950"
                    : "bg-amber-50/90 border-amber-300 text-amber-950"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <AlertTriangle
                    className={`w-5 h-5 shrink-0 mt-0.5 ${
                      isDel ? "text-rose-600" : "text-amber-600"
                    }`}
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-bold text-xs uppercase px-2 py-0.5 rounded border ${
                          isDel
                            ? "bg-rose-100 border-rose-300 text-rose-900"
                            : "bg-amber-100 border-amber-300 text-amber-900"
                        }`}
                      >
                        {alertType} ALERT
                      </span>
                      <span className="text-xs font-bold text-slate-900 truncate max-w-md">
                        {ac.manifest?.observed?.title || ac.url}
                      </span>
                    </div>
                    <p className="text-xs mt-1 text-slate-700">
                      {ac.watchAlert?.reason || "Target URL was altered or removed after capture."}
                      {ac.watchAlert?.detectedAt && (
                        <span className="text-slate-500 ml-1">
                          (Detected {formatIST(ac.watchAlert.detectedAt)})
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                  <Link
                    href={`/capture/${ac.id}`}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold shadow-2xs"
                  >
                    View Diff &amp; Watch
                  </Link>
                  {ac.watchAlert?.recaptureId && (
                    <Link
                      href={`/capture/${ac.watchAlert.recaptureId}`}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs flex items-center space-x-1"
                    >
                      <span>Re-Capture</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cases Shelf (if any cases exist) */}
      {cases.length > 0 && (
        <div className="mb-6 p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Folder className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Case Matters</h2>
              <span className="text-xs text-slate-400">({cases.length})</span>
            </div>
            <button
              onClick={() => setShowNewCaseModal(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center space-x-1"
            >
              <Plus className="w-3 h-3" />
              <span>Create Case</span>
            </button>
          </div>

          <div className="flex items-center space-x-3 overflow-x-auto pb-1">
            {cases.map((c) => (
              <Link
                key={c.id}
                href={`/case/${c.id}`}
                className="px-3.5 py-2 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 bg-slate-50/50 transition-all shrink-0 flex items-center space-x-2 text-xs"
              >
                <Folder className="w-3.5 h-3.5 text-indigo-500" />
                <span className="font-semibold text-slate-800 max-w-[200px] truncate">{c.title}</span>
                <span className="px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] font-mono text-slate-600 font-bold">
                  {c.captureIds?.length || 0}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="mb-6 space-y-4">
        {/* Status Chips Row */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1">
          <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center space-x-1">
            <Filter className="w-3 h-3" />
            <span>Status:</span>
          </span>

          {[
            { id: "ALL", label: "All", count: countAll },
            { id: "READY", label: "Ready", count: countReady },
            { id: "ANCHORED", label: "Anchored", count: countAnchored },
            { id: "WATCHING", label: "Watching", count: countWatching },
            { id: "EDITED", label: "Edited", count: countEdited },
            { id: "DELETED", label: "Deleted", count: countDeleted },
          ].map((chip) => {
            const active = statusFilter === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => setStatusFilter(chip.id as StatusFilterType)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center space-x-1.5 ${
                  active
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>{chip.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                    active ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Case Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search captures by URL, ID, or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Filter Case:</span>
            <select
              value={caseFilter}
              onChange={(e) => setCaseFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs w-full sm:w-auto"
            >
              <option value="ALL">All Cases ({captures.length})</option>
              <option value="UNASSIGNED">Unassigned ({captures.filter((c) => !c.caseId).length})</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.captureIds?.length || 0})
                </option>
              ))}
            </select>
          </div>
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
              No evidentiary records matched the active search or filters.
            </p>
            {(statusFilter !== "ALL" || caseFilter !== "ALL" || searchTerm) && (
              <button
                onClick={() => {
                  setStatusFilter("ALL");
                  setCaseFilter("ALL");
                  setSearchTerm("");
                }}
                className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredCaptures.map((cap) => {
              const capCase = cases.find((cs) => cs.id === cap.caseId);
              return (
                <div
                  key={cap.id}
                  className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
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
                      {cap.watchState === "deleted_detected" || cap.watchAlert?.type === "DELETED" ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-300 flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>DELETED</span>
                        </span>
                      ) : cap.watchState === "edited_detected" || cap.watchAlert?.type === "EDITED" ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>EDITED</span>
                        </span>
                      ) : cap.isWatching ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center space-x-1">
                          <Activity className="w-3 h-3 text-emerald-600" />
                          <span>WATCHING</span>
                        </span>
                      ) : null}

                      {/* Case Tag */}
                      {capCase && (
                        <Link
                          href={`/case/${capCase.id}`}
                          className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 flex items-center space-x-1"
                        >
                          <Folder className="w-3 h-3 text-indigo-600" />
                          <span className="truncate max-w-[120px]">{capCase.title}</span>
                        </Link>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug truncate">
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
