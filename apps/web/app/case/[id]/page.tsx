"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Folder,
  Layers,
  ArrowLeft,
  Download,
  Trash2,
  Edit2,
  Check,
  X,
  Lock,
  Clock,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Plus,
  FileText,
  Save,
} from "lucide-react";
import { formatIST, truncateHash } from "@/lib/utils";

interface CaptureItem {
  id: string;
  url: string;
  goal?: string;
  status: string;
  createdAt: string;
  watchState?: string;
  isWatching?: boolean;
  watchAlert?: {
    type?: string;
    reason?: string;
    detectedAt?: string;
    recaptureId?: string;
  };
  manifest?: {
    observed?: {
      title?: string;
    };
    target?: {
      url?: string;
    };
  };
  anchoring?: {
    root?: string;
    txHash?: string;
    blockNumber?: number;
    anchoredAt?: string;
  };
}

interface CaseData {
  id: string;
  ownerUid: string;
  title: string;
  notes: string;
  captureIds: string[];
  createdAt: string;
  updatedAt: string;
}

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = (params?.id as string) || "";

  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  // Notes editing state
  const [notesInput, setNotesInput] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSavedSuccess, setNotesSavedSuccess] = useState(false);

  // Add capture state
  const [showAddModal, setShowAddModal] = useState(false);
  const [captureIdToAdd, setCaptureIdToAdd] = useState("");
  const [addingCapture, setAddingCapture] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Deleting case state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchCase = useCallback(async () => {
    if (!caseId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/cases/${caseId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Case not found");
        } else {
          setError("Failed to load case");
        }
        return;
      }
      const data = await res.json();
      setCaseData(data.case);
      setCaptures(data.captures || []);
      setTitleInput(data.case.title || "");
      setNotesInput(data.case.notes || "");
    } catch (err) {
      console.error(err);
      setError("Network error loading case");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchCase();
  }, [fetchCase]);

  const handleSaveTitle = async () => {
    if (!titleInput.trim()) return;
    setSavingTitle(true);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setCaseData(data.case);
        setIsEditingTitle(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingTitle(false);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesInput }),
      });
      if (res.ok) {
        const data = await res.json();
        setCaseData(data.case);
        setNotesSavedSuccess(true);
        setTimeout(() => setNotesSavedSuccess(false), 2500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captureIdToAdd.trim()) return;
    setAddingCapture(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/captures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captureId: captureIdToAdd.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "Failed to add capture");
        return;
      }
      setCaptureIdToAdd("");
      setShowAddModal(false);
      await fetchCase();
    } catch (err) {
      console.error(err);
      setAddError("Network error adding capture");
    } finally {
      setAddingCapture(false);
    }
  };

  const handleRemoveCapture = async (capId: string) => {
    if (!confirm(`Remove capture ${capId} from this case? The capture will be kept and unassigned.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/cases/${caseId}/captures?captureId=${capId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchCase();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCase = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/dashboard");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-xs font-mono text-slate-500">Loading case details...</div>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="min-h-[calc(100vh-4rem)] max-w-4xl mx-auto py-12 px-4 text-center">
        <Folder className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-slate-900">{error || "Case Not Found"}</h2>
        <p className="text-xs text-slate-500 mt-1">The case you requested does not exist or was deleted.</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center space-x-1.5 mt-6 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
    );
  }

  const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL || "https://amoy.polygonscan.com";

  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Breadcrumb Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>

        <div className="flex items-center space-x-2">
          <a
            href={`/api/cases/${caseId}/export`}
            download
            className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg shadow-2xs flex items-center space-x-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export Case ZIP</span>
          </a>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-3.5 py-1.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold rounded-lg shadow-2xs flex items-center space-x-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Case</span>
            </button>
          ) : (
            <div className="flex items-center space-x-1 bg-rose-50 border border-rose-300 p-1 rounded-lg">
              <span className="text-[11px] font-semibold text-rose-900 px-2">Keep captures &amp; delete?</span>
              <button
                onClick={handleDeleteCase}
                disabled={deleting}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded"
              >
                {deleting ? "Deleting..." : "Confirm"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 text-slate-600 hover:text-slate-900 text-xs"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Case Header Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                CASE
              </span>
              <span className="text-xs font-mono text-slate-500">{caseData.id}</span>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs text-slate-500 flex items-center space-x-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Created {formatIST(caseData.createdAt)}</span>
              </span>
            </div>

            {/* Editable Title */}
            {isEditingTitle ? (
              <div className="flex items-center space-x-2 mt-2">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="px-3 py-1.5 text-lg font-bold text-slate-900 border border-indigo-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-md"
                  autoFocus
                />
                <button
                  onClick={handleSaveTitle}
                  disabled={savingTitle}
                  className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setTitleInput(caseData.title);
                    setIsEditingTitle(false);
                  }}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-3 group">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  {caseData.title}
                </h1>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="opacity-70 hover:opacity-100 text-slate-400 hover:text-slate-800 transition-opacity p-1"
                  title="Rename Case"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            )}

            <p className="text-xs text-slate-500">
              Preserved case matter grouping {captures.length} evidentiary record{captures.length === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Assign Capture</span>
            </button>
          </div>
        </div>

        {/* Modal: Add Capture */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Assign Capture to Case</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Enter an existing Capture ID (e.g. <code className="font-mono text-slate-700">cap_...</code>) to link it with this case.
              </p>
              <form onSubmit={handleAddCapture} className="space-y-3">
                <input
                  type="text"
                  placeholder="cap_..."
                  value={captureIdToAdd}
                  onChange={(e) => setCaptureIdToAdd(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  autoFocus
                />
                {addError && <p className="text-xs text-rose-600">{addError}</p>}
                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingCapture || !captureIdToAdd.trim()}
                    className="px-4 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    {addingCapture ? "Adding..." : "Assign to Case"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Private Notes Section */}
        <div className="mt-6 pt-6 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Private Case Notes</span>
              <span className="text-[10px] font-normal text-slate-400">(Private to case owner, unanchored)</span>
            </div>

            <div className="flex items-center space-x-2">
              {notesSavedSuccess && (
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center space-x-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Notes saved</span>
                </span>
              )}
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-md flex items-center space-x-1 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingNotes ? "Saving..." : "Save Notes"}</span>
              </button>
            </div>
          </div>

          <textarea
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            placeholder="Record legal citations, internal incident IDs, complaint reference numbers, or investigatory notes..."
            rows={4}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 font-sans"
          />
        </div>
      </div>

      {/* Case Timeline Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-slate-900">Evidence Timeline</h2>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold font-mono">
              {captures.length}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            All evidentiary captures gathered under this case matter.
          </p>
        </div>

        {captures.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
            <Layers className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">No Captures in this Case</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Assign existing captures to this case or capture new evidence directly from the Repost Finder.
            </p>
            <div className="flex justify-center space-x-3 pt-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
              >
                Assign Existing Capture
              </button>
              <Link
                href="/capture/new"
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg"
              >
                New Capture
              </Link>
            </div>
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
            {captures.map((cap, idx) => {
              const isAnchored = cap.status === "ANCHORED" && Boolean(cap.anchoring?.txHash);
              const isDeleted = cap.watchState === "deleted_detected" || cap.watchAlert?.type === "DELETED";
              const isEdited = cap.watchState === "edited_detected" || cap.watchAlert?.type === "EDITED";

              return (
                <div key={cap.id} className="relative group">
                  {/* Timeline bullet dot */}
                  <div
                    className={`absolute -left-6 top-4 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs ${
                      isDeleted
                        ? "bg-rose-500"
                        : isEdited
                        ? "bg-amber-500"
                        : isAnchored
                        ? "bg-emerald-500"
                        : "bg-indigo-600"
                    }`}
                  />

                  {/* Capture Card */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-700">
                          {cap.id}
                        </span>

                        {/* Status Chip */}
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

                        {/* Watch Indicators */}
                        {isDeleted ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-300 flex items-center space-x-1">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>DELETED</span>
                          </span>
                        ) : isEdited ? (
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

                        <span className="text-xs text-slate-400">&bull;</span>
                        <span className="text-xs text-slate-500 font-mono">
                          {formatIST(cap.createdAt)}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 truncate">
                        {cap.manifest?.observed?.title || cap.url}
                      </h3>

                      <div className="flex items-center space-x-2 text-xs text-slate-500 font-mono">
                        <span className="truncate max-w-md">{cap.url}</span>
                      </div>

                      {/* Blockchain Anchor Info */}
                      {isAnchored && cap.anchoring ? (
                        <div className="pt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                          <span className="flex items-center space-x-1 font-semibold text-emerald-700">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Anchored (Block #{cap.anchoring.blockNumber || "N/A"})</span>
                          </span>
                          <span className="font-mono text-slate-500">
                            Root: {truncateHash(cap.anchoring.root || "")}
                          </span>
                          {cap.anchoring.txHash && !cap.anchoring.txHash.startsWith("0xmock") && (
                            <a
                              href={`${explorerUrl}/tx/${cap.anchoring.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 flex items-center space-x-0.5 font-semibold"
                            >
                              <span>Polygonscan</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="pt-1 text-[11px] text-slate-400">
                          <span>Not yet anchored to blockchain</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                      <Link
                        href={`/capture/${cap.id}`}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs flex items-center space-x-1"
                      >
                        <span>View Evidence</span>
                      </Link>
                      <button
                        onClick={() => handleRemoveCapture(cap.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Remove from Case"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
