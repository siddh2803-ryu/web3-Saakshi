"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ChirpPost } from "@/lib/sandbox/store";
import { ShieldCheck, RefreshCw, Trash2, Edit3, RotateCcw, ExternalLink, Terminal } from "lucide-react";

export default function SandboxAdminPage() {
  const [posts, setPosts] = useState<ChirpPost[]>([]);
  const [secret, setSecret] = useState("chirp_admin_secret_key_demo");
  const [loading, setLoading] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const fetchPosts = async () => {
    try {
      const res = await fetch("/api/sandbox");
      const data = await res.json();
      if (data.posts) setPosts(data.posts);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleAction = async (action: string, slug?: string, text?: string) => {
    setLoading(true);
    setStatusMsg("");
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, slug, text, secret }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(`Error: ${data.error || "Action failed"}`);
      } else {
        setStatusMsg(`Success: ${data.message || "Updated successfully"}`);
        setEditingSlug(null);
        await fetchPosts();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusMsg(`Network error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 py-10 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-1.5 bg-slate-100 text-slate-800 rounded-lg">
                <Terminal className="w-5 h-5 text-slate-700" />
              </span>
              <h1 className="text-xl font-bold text-slate-900">Sandbox Admin: Chirp Platform</h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Live simulation panel to trigger edit and deletion detection during demos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAction("reset")}
              disabled={loading}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Seed Posts</span>
            </button>
            <Link
              href="/dashboard"
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Return to Saakshi
            </Link>
          </div>
        </div>

        {/* Secret & Status */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3 w-full max-w-md">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
              Admin Secret:
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="w-full text-xs font-mono px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              placeholder="SANDBOX_ADMIN_SECRET"
            />
          </div>
          {statusMsg && (
            <div className="text-xs font-medium text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg truncate">
              {statusMsg}
            </div>
          )}
        </div>

        {/* Posts List */}
        <div className="space-y-4">
          {posts.map((post) => (
            <div
              key={post.slug}
              className={`p-6 bg-white rounded-xl border transition-all ${
                post.isDeleted
                  ? "border-rose-300 bg-rose-50/20"
                  : "border-slate-200/90 shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-slate-900">{post.authorName}</span>
                    <span className="text-xs text-slate-500 font-mono">{post.authorHandle}</span>
                    {post.isDeleted ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 rounded-md">
                        DELETED (404)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md">
                        ACTIVE LIVE
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-semibold text-slate-800 mt-1">{post.title}</h2>
                </div>

                <div className="flex items-center space-x-2">
                  <Link
                    href={`/sandbox/post/${post.slug}`}
                    target="_blank"
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="View Chirp Post"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                  {post.isDeleted ? (
                    <button
                      onClick={() => handleAction("restore", post.slug)}
                      disabled={loading}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors flex items-center space-x-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Restore Post</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction("delete", post.slug)}
                      disabled={loading}
                      className="px-3 py-1.5 text-xs font-semibold bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-300 rounded-lg transition-colors flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Simulate Delete (404)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Edit form vs display */}
              {editingSlug === post.slug ? (
                <div className="mt-4 space-y-3">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={4}
                    className="w-full text-sm p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleAction("edit", post.slug, editText)}
                      disabled={loading}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      Save Alteration
                    </button>
                    <button
                      onClick={() => setEditingSlug(null)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed font-mono">
                    {post.content}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      onClick={() => {
                        setEditingSlug(post.slug);
                        setEditText(post.content);
                      }}
                      className="text-xs text-blue-700 hover:underline font-semibold flex items-center space-x-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Post Content (Simulate Alteration)</span>
                    </button>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Target URL for Saakshi: /sandbox/post/{post.slug}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
