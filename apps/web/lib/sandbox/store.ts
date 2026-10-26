export interface ChirpComment {
  id: string;
  author: string;
  handle: string;
  text: string;
  timeText: string;
}

export interface ChirpPost {
  slug: string;
  title: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  publishedAtText: string;
  content: string;
  imageUrl?: string;
  likes: number;
  commentsCount: number;
  shares: number;
  comments: ChirpComment[];
  isDeleted: boolean;
  updatedAt: string;
}

const SEED_POSTS: Record<string, ChirpPost> = {
  "internship-scam-alert": {
    slug: "internship-scam-alert",
    title: "Fast-Track Winter Internship Program (Registration Fee Required)",
    authorName: "CareerBridge Global",
    authorHandle: "@careerbridge_official",
    authorAvatar: "https://api.dicebear.com/7.x/identicon/svg?seed=CareerBridge",
    publishedAtText: "2 hours ago",
    content:
      "Exclusive 3-month remote engineering internship at Global AI Labs. Guaranteed stipend of ₹45,000/month. Mandatory one-time documentation and portal registration fee of ₹2,499 to be transferred to UPI id: recruit-verify@payu before 5 PM today. Limited to the first 25 applicants only! Apply immediately.",
    imageUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80",
    likes: 142,
    commentsCount: 3,
    shares: 28,
    comments: [
      {
        id: "c1",
        author: "Pooja Verma",
        handle: "@pooja_v",
        text: "I paid the fee 30 minutes ago on that UPI, but haven't received any confirmation email or login credentials. Can someone assist?",
        timeText: "45 minutes ago",
      },
      {
        id: "c2",
        author: "Rohan Das",
        handle: "@rohan_tech",
        text: "Legitimate internships never ask candidates for registration fees. This looks like a complete scam.",
        timeText: "30 minutes ago",
      },
      {
        id: "c3",
        author: "CareerBridge Support",
        handle: "@careerbridge_help",
        text: "@pooja_v kindly DM your transaction reference ID and Aadhaar number to expedite onboarding.",
        timeText: "15 minutes ago",
      },
    ],
    isDeleted: false,
    updatedAt: new Date().toISOString(),
  },
  "defamation-case-sample": {
    slug: "defamation-case-sample",
    title: "Notice regarding student council election malpractice",
    authorName: "Campus Uncensored",
    authorHandle: "@campus_uncensored_ig",
    authorAvatar: "https://api.dicebear.com/7.x/identicon/svg?seed=CampusUncensored",
    publishedAtText: "Yesterday at 11:42 PM",
    content:
      "Shocking revelation: Candidate R.S. was caught manipulating ballots and colluding with the faculty election observer in room 304. We have photographic evidence and will be filing a formal complaint tomorrow. Do not vote for this fraud!",
    imageUrl: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=800&auto=format&fit=crop&q=80",
    likes: 389,
    commentsCount: 2,
    shares: 114,
    comments: [
      {
        id: "c4",
        author: "Dev Mehra",
        handle: "@dev_m",
        text: "These are completely fabricated accusations. The election commission already cleared the observer.",
        timeText: "18 hours ago",
      },
      {
        id: "c5",
        author: "Sunita Rao",
        handle: "@sunita_r",
        text: "Preserving this post right now before the admin deletes it when called out.",
        timeText: "14 hours ago",
      },
    ],
    isDeleted: false,
    updatedAt: new Date().toISOString(),
  },
};

// Global in-memory cache preserved across hot-reloads in development
const globalStore = global as unknown as { __chirpPosts?: Record<string, ChirpPost> };
if (!globalStore.__chirpPosts) {
  globalStore.__chirpPosts = JSON.parse(JSON.stringify(SEED_POSTS));
}

export function getChirpPost(slug: string): ChirpPost | null {
  const posts = globalStore.__chirpPosts || SEED_POSTS;
  return posts[slug] || null;
}

export function getAllChirpPosts(): ChirpPost[] {
  const posts = globalStore.__chirpPosts || SEED_POSTS;
  return Object.values(posts);
}

export function updateChirpPost(slug: string, updates: Partial<ChirpPost>): ChirpPost | null {
  if (!globalStore.__chirpPosts) globalStore.__chirpPosts = JSON.parse(JSON.stringify(SEED_POSTS));
  const post = globalStore.__chirpPosts[slug];
  if (!post) return null;

  const updated: ChirpPost = {
    ...post,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  globalStore.__chirpPosts[slug] = updated;
  return updated;
}

export function deleteChirpPost(slug: string): boolean {
  if (!globalStore.__chirpPosts) globalStore.__chirpPosts = JSON.parse(JSON.stringify(SEED_POSTS));
  const post = globalStore.__chirpPosts[slug];
  if (!post) return false;
  post.isDeleted = true;
  post.updatedAt = new Date().toISOString();
  return true;
}

export function restoreChirpPost(slug: string): boolean {
  if (!globalStore.__chirpPosts) globalStore.__chirpPosts = JSON.parse(JSON.stringify(SEED_POSTS));
  const post = globalStore.__chirpPosts[slug];
  if (!post) return false;
  post.isDeleted = false;
  post.updatedAt = new Date().toISOString();
  return true;
}

export function resetChirpPosts(): void {
  globalStore.__chirpPosts = JSON.parse(JSON.stringify(SEED_POSTS));
}
