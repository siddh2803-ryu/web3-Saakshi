import dotenv from "dotenv";
dotenv.config({ path: "apps/web/.env.local" });

import { AiAnalysisSchema, AiAnalysisOutput } from "../apps/web/lib/ai/schema";
import { analyzeEvidenceWithGemini } from "../apps/web/lib/ai/gemini";
import { formatIST } from "../apps/web/lib/utils";

interface CaptureEvaluationTarget {
  id: string;
  name: string;
  url: string;
  contentType: string;
  observedText: string;
  agentStructuredData: any;
}

const TARGETS: CaptureEvaluationTarget[] = [
  {
    id: "cap_eval_scam",
    name: "Sandbox Internship-Scam Post",
    url: "https://chirp.local/sandbox/post/internship-scam-alert",
    contentType: "job_offer",
    observedText: `CareerBridge Global (@careerbridge_official)
Fast-Track Winter Internship Program (Registration Fee Required)
Exclusive 3-month remote engineering internship at Global AI Labs. Guaranteed stipend of ₹45,000/month. Mandatory one-time documentation and portal registration fee of ₹2,499 to be transferred to UPI id: recruit-verify@payu before 5 PM today. Limited to the first 25 applicants only! Apply immediately.
Comments:
- Pooja Verma (@pooja_v): I paid the fee 30 minutes ago on that UPI, but haven't received any confirmation email or login credentials. Can someone assist?
- Rohan Das (@rohan_tech): Legitimate internships never ask candidates for registration fees. This looks like a complete scam.
- CareerBridge Support (@careerbridge_help): @pooja_v kindly DM your transaction reference ID and Aadhaar number to expedite onboarding.`,
    agentStructuredData: {
      author_name: "CareerBridge Global",
      author_handle: "@careerbridge_official",
      platform: "Chirp",
      comments_count: 3,
    },
  },
  {
    id: "cap_eval_defamation",
    name: "Sandbox Defamation Post",
    url: "https://chirp.local/sandbox/post/defamation-case-study",
    contentType: "social_post",
    observedText: `Campus Uncensored (@campus_uncensored_ig)
Notice regarding student council election malpractice.
Shocking revelation: Candidate R.S. was caught manipulating ballots and colluding with the faculty election observer in room 304. We have photographic evidence and will be filing a formal complaint tomorrow. Do not vote for this fraud!
Comments:
- Dev Mehra (@dev_m): These are completely fabricated accusations. The election commission already cleared the observer.
- Sunita Rao (@sunita_r): Preserving this post right now before the admin deletes it when called out.`,
    agentStructuredData: {
      author_name: "Campus Uncensored",
      author_handle: "@campus_uncensored_ig",
      platform: "Chirp",
      comments_count: 2,
    },
  },
  {
    id: "cap_eval_public_wiki",
    name: "Real Public Page (Wikipedia - Internet)",
    url: "https://en.wikipedia.org/wiki/Internet",
    contentType: "article",
    observedText: `The Internet (or internet) is the global system of interconnected computer networks that uses the Internet protocol suite (TCP/IP) to communicate between networks and devices. It is a network of networks that consists of private, public, academic, business, and government networks of local to global scope, linked by a broad array of electronic, wireless, and optical networking technologies. The Internet carries a vast range of information resources and services, such as the interlinked hypertext documents and applications of the World Wide Web (WWW), electronic mail, telephony, and file sharing.`,
    agentStructuredData: {
      page_title: "Internet - Wikipedia",
      platform: "Wikipedia",
    },
  },
];

async function runValidation() {
  console.log("=== Saakshi Phase 7 Part 2: 3-Capture AI Live Validation ===");

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const isKeySet = Boolean(apiKey);
  console.log(`GEMINI_API_KEY status: ${isKeySet ? "CONFIGURED (hidden)" : "UNSET / MISSING"}`);
  console.log(`Configured Model: ${process.env.GEMINI_MODEL || "gemini-2.5-flash"}`);

  if (!isKeySet) {
    console.log("\n⚠️  GEMINI_API_KEY is not set in environment or apps/web/.env.local.");
    console.log("Per PRD Section 17 & AUDIT.md: Anything not verified with live Gemini output is PENDING.");
    console.log("Testing schema validation against mock/fixture data...\n");

    for (const target of TARGETS) {
      console.log(`Testing target: ${target.name} (${target.url})`);
      process.env.AI_FALLBACK = "dev";
      const start = Date.now();
      const result = await analyzeEvidenceWithGemini(
        target.observedText,
        target.agentStructuredData,
        new Date().toISOString()
      );
      const latency = Date.now() - start;

      const parsed = AiAnalysisSchema.safeParse(result);
      console.log(`- Validation: ${parsed.success ? "PASS" : "FAIL"}`);
      console.log(`- Status: ${result.status || "SUCCESS"}`);
      console.log(`- Latency: ${latency}ms`);
      console.log(`- Hindi Summary Present: ${Boolean(result.summary_hi)}`);
      console.log(`- Hindi Draft Present: ${Boolean(result.complaint_draft_hi)}`);
      console.log(`- Caveats Count: ${result.caveats?.length || 0}`);
      console.log(`- Categories: ${result.possible_issue_categories?.map(c => `${c.category} (${c.confidence})`).join(", ")}`);
      console.log(`- Live Execution: PENDING (requires live GEMINI_API_KEY)\n`);
    }
    return;
  }

  // Live execution when key is present
  for (const target of TARGETS) {
    console.log(`\nEvaluating Live Target: ${target.name}`);
    console.log(`URL: ${target.url}`);
    const start = Date.now();
    try {
      const result = await analyzeEvidenceWithGemini(
        target.observedText,
        target.agentStructuredData,
        new Date().toISOString()
      );
      const latency = Date.now() - start;

      const parsed = AiAnalysisSchema.safeParse(result);
      console.log(`- Validation: ${parsed.success ? "PASS" : "FAIL"}`);
      console.log(`- Model Used: ${process.env.GEMINI_MODEL || "gemini-2.5-flash"}`);
      console.log(`- Latency: ${latency}ms`);
      console.log(`- Hindi Summary Present: ${Boolean(result.summary_hi)}`);
      console.log(`- Hindi Draft Present: ${Boolean(result.complaint_draft_hi)}`);
      console.log(`- Caveats Present: ${Boolean(result.caveats && result.caveats.length > 0)}`);
      console.log(`- Safety Blocked: ${result.status === "UNAVAILABLE" ? "YES (" + (result.error || "BLOCKED") + ")" : "NO"}`);
      console.log(`- Categories: ${result.possible_issue_categories?.map(c => `${c.category} (${c.confidence})`).join(", ")}`);
    } catch (err: any) {
      console.error(`- Evaluation Error: ${err.message}`);
    }
  }
}

runValidation().catch((err) => {
  console.error("Fatal validation script error:", err);
  process.exit(1);
});
