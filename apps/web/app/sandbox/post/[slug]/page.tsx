import { notFound } from "next/navigation";
import { getChirpPost } from "@/lib/sandbox/store";
import Link from "next/link";
import { MessageSquare, Heart, Share2, ShieldAlert } from "lucide-react";

interface PageProps {
  params: { slug: string };
}

export const dynamic = "force-dynamic";

export default function ChirpPostPage({ params }: PageProps) {
  const post = getChirpPost(params.slug);

  if (!post || post.isDeleted) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Sandbox Notice Banner */}
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-950">
          <div className="flex items-center space-x-2">
            <span className="font-bold px-2 py-0.5 bg-amber-200 text-amber-950 rounded-md">DEMO SANDBOX</span>
            <span>Simulated target platform &quot;Chirp&quot; for KRITICAL HACKS &apos;26 testing.</span>
          </div>
          <Link href="/sandbox/admin" className="font-semibold underline hover:text-amber-900">
            Admin Controls
          </Link>
        </div>

        {/* Chirp Platform Card */}
        <article className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
          {/* Post Header */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.authorAvatar}
                  alt={post.authorName}
                  className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 object-cover"
                />
                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-tight">
                    {post.authorName}
                  </h2>
                  <p className="text-xs text-slate-500 font-mono">{post.authorHandle}</p>
                </div>
              </div>
              <span className="text-xs text-slate-400 font-mono">{post.publishedAtText}</span>
            </div>

            {/* Post Title & Content */}
            <div className="mt-4">
              <h1 className="text-lg font-bold text-slate-900 mb-2">{post.title}</h1>
              <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-line">
                {post.content}
              </p>
            </div>

            {/* Optional Image */}
            {post.imageUrl && (
              <div className="mt-4 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.imageUrl}
                  alt="Post visual attachment"
                  className="w-full max-h-96 object-cover"
                />
              </div>
            )}

            {/* Engagement Metrics */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-slate-500 text-xs font-medium">
              <div className="flex items-center space-x-6">
                <span className="flex items-center space-x-1.5 hover:text-rose-600 transition-colors cursor-pointer">
                  <Heart className="w-4 h-4" />
                  <span>{post.likes}</span>
                </span>
                <span className="flex items-center space-x-1.5 hover:text-blue-700 transition-colors cursor-pointer">
                  <MessageSquare className="w-4 h-4" />
                  <span>{post.commentsCount}</span>
                </span>
                <span className="flex items-center space-x-1.5 hover:text-slate-900 transition-colors cursor-pointer">
                  <Share2 className="w-4 h-4" />
                  <span>{post.shares}</span>
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">Chirp v2.4</span>
            </div>
          </div>

          {/* Comments Section */}
          <div className="p-6 bg-slate-50/60">
            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-4">
              Replies &amp; Discussion ({post.comments.length})
            </h3>
            <div className="space-y-4">
              {post.comments.map((comment) => (
                <div
                  key={comment.id}
                  className="p-4 bg-white rounded-lg border border-slate-200/80 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-900">{comment.author}</span>
                      <span className="text-xs text-slate-400 font-mono">{comment.handle}</span>
                    </div>
                    <span className="text-xs text-slate-400">{comment.timeText}</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-normal">{comment.text}</p>
                </div>
              ))}
            </div>
          </div>
        </article>

        {/* Footer info for bot/capture agents */}
        <div className="mt-6 text-center text-xs text-slate-500">
          Permanent URI: <span className="font-mono">/sandbox/post/{post.slug}</span> &bull; Updated: {post.updatedAt}
        </div>
      </div>
    </div>
  );
}
