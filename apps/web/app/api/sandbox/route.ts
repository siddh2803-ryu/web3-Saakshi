import { NextRequest, NextResponse } from "next/server";
import {
  getAllChirpPosts,
  getChirpPost,
  updateChirpPost,
  deleteChirpPost,
  restoreChirpPost,
  resetChirpPosts,
} from "@/lib/sandbox/store";

export async function GET() {
  const posts = getAllChirpPosts();
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, slug, text, secret } = body;

    const expectedSecret = process.env.SANDBOX_ADMIN_SECRET || "chirp_admin_secret_key_demo";
    if (secret !== expectedSecret) {
      return NextResponse.json({ error: "Invalid admin secret" }, { status: 401 });
    }

    if (action === "reset") {
      resetChirpPosts();
      return NextResponse.json({ success: true, message: "Reset to seed posts" });
    }

    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    if (action === "edit") {
      if (typeof text !== "string") {
        return NextResponse.json({ error: "text is required for edit" }, { status: 400 });
      }
      const updated = updateChirpPost(slug, { content: text });
      return NextResponse.json({ success: true, post: updated });
    }

    if (action === "delete") {
      deleteChirpPost(slug);
      return NextResponse.json({ success: true, message: `Post ${slug} marked as deleted` });
    }

    if (action === "restore") {
      restoreChirpPost(slug);
      return NextResponse.json({ success: true, message: `Post ${slug} restored` });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
