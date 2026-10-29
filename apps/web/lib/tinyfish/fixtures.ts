import { AgentRunResponse, TinyFishAgentStep } from "./agent";
import { BrowserCaptureResult } from "./browser";
import { FetchResult } from "./fetch";
import { MonitorCreateResponse, MonitorRunResponse } from "./monitor";
import { SearchResponse } from "./search";

// Minimal valid 1x1 JPEG in Base64 for step screenshots
export const MOCK_JPEG_BASE64 =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

export const FIXTURE_AGENT_STEPS: TinyFishAgentStep[] = [
  {
    id: "step_01",
    timestamp: new Date(Date.now() - 60000).toISOString(),
    status: "success",
    action: "Navigated to target URL and verified page loaded",
    screenshot: MOCK_JPEG_BASE64,
    duration: 1.4,
  },
  {
    id: "step_02",
    timestamp: new Date(Date.now() - 50000).toISOString(),
    status: "success",
    action: "Closed cookie consent notification banner",
    screenshot: MOCK_JPEG_BASE64,
    duration: 0.8,
  },
  {
    id: "step_03",
    timestamp: new Date(Date.now() - 40000).toISOString(),
    status: "success",
    action: "Scrolled viewport to examine main publication content and author details",
    screenshot: MOCK_JPEG_BASE64,
    duration: 1.2,
  },
  {
    id: "step_04",
    timestamp: new Date(Date.now() - 30000).toISOString(),
    status: "success",
    action: "Recorded image attachment URL and verification badges",
    screenshot: MOCK_JPEG_BASE64,
    duration: 0.9,
  },
  {
    id: "step_05",
    timestamp: new Date(Date.now() - 20000).toISOString(),
    status: "success",
    action: "Expanded reply discussion section and retrieved 3 public comments",
    screenshot: MOCK_JPEG_BASE64,
    duration: 1.6,
  },
  {
    id: "step_06",
    timestamp: new Date(Date.now() - 10000).toISOString(),
    status: "success",
    action: "Finalized inspection and validated structured schema fields",
    screenshot: MOCK_JPEG_BASE64,
    duration: 0.7,
  },
];

export interface FixtureMetadata {
  source: "synthetic" | "recorded";
  createdAt: string;
  notes?: string;
  runId?: string;
  targetUrl?: string;
}

export const FIXTURE_METADATA: FixtureMetadata = {
  source: "synthetic",
  createdAt: "2026-10-26T00:00:00.000Z",
  notes: "Synthetic baseline fixture simulating Chirp sandbox fraud post with 6 steps and screenshots.",
};

const SYNTHETIC_AGENT_RUN: AgentRunResponse & { _metadata: FixtureMetadata } = {
  _metadata: FIXTURE_METADATA,
  run_id: "run_fixture_tinyfish_001",
  status: "COMPLETED",
  streaming_url: "https://agent.tinyfish.ai/stream/mock-session-001",
  num_of_steps: FIXTURE_AGENT_STEPS.length,
  steps: FIXTURE_AGENT_STEPS,
  result: {
    page_title: "Fast-Track Winter Internship Program (Registration Fee Required)",
    platform: "Chirp",
    author_name: "CareerBridge Global",
    author_handle: "@careerbridge_official",
    author_profile_url: "https://chirp.local/u/careerbridge_official",
    published_at_text: "2 hours ago",
    content_text:
      "Exclusive 3-month remote engineering internship at Global AI Labs. Guaranteed stipend of ₹45,000/month. Mandatory one-time documentation and portal registration fee of ₹2,499 to be transferred to UPI id: recruit-verify@payu before 5 PM today. Limited to the first 25 applicants only! Apply immediately.",
    media: [
      {
        type: "image",
        url: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3",
      },
    ],
    engagement: {
      likes: "142",
      comments: "3",
      shares: "28",
      views: "1,240",
    },
    comments: [
      {
        author: "Pooja Verma",
        text: "I paid the fee 30 minutes ago on that UPI, but haven't received any confirmation email or login credentials. Can someone assist?",
        time_text: "45 minutes ago",
      },
      {
        author: "Rohan Das",
        text: "Legitimate internships never ask candidates for registration fees. This looks like a complete scam.",
        time_text: "30 minutes ago",
      },
    ],
    blocked: false,
    block_reason: null,
  },
};

import recordedRunJson from "../../fixtures/recorded_sandbox_run.json";

function getActiveFixtureAgentRun(): AgentRunResponse & { _metadata: FixtureMetadata } {
  if (recordedRunJson && (recordedRunJson as any)._metadata?.source === "recorded") {
    return recordedRunJson as unknown as AgentRunResponse & { _metadata: FixtureMetadata };
  }
  return SYNTHETIC_AGENT_RUN;
}

export const FIXTURE_AGENT_RUN: AgentRunResponse & { _metadata: FixtureMetadata } = getActiveFixtureAgentRun();

export const FIXTURE_FETCH_RESULT: FetchResult = {
  text: `# Fast-Track Winter Internship Program (Registration Fee Required)
Author: CareerBridge Global (@careerbridge_official)
Published: 2 hours ago

Exclusive 3-month remote engineering internship at Global AI Labs. Guaranteed stipend of ₹45,000/month. Mandatory one-time documentation and portal registration fee of ₹2,499 to be transferred to UPI id: recruit-verify@payu before 5 PM today. Limited to the first 25 applicants only! Apply immediately.

## Comments
- **Pooja Verma**: I paid the fee 30 minutes ago on that UPI, but haven't received any confirmation email or login credentials. Can someone assist?
- **Rohan Das**: Legitimate internships never ask candidates for registration fees. This looks like a complete scam.`,
  meta: {
    title: "Fast-Track Winter Internship Program (Registration Fee Required)",
    description: "Exclusive 3-month remote engineering internship at Global AI Labs.",
    author: "CareerBridge Global",
    published_date: "2026-10-20T12:00:00Z",
    language: "en",
    final_url: "https://chirp.local/sandbox/post/internship-scam-alert",
    links: ["https://chirp.local/u/careerbridge_official"],
    image_links: ["https://images.unsplash.com/photo-1516321318423-f06f85e504b3"],
    etag: 'W/"saakshi-fixture-etag-001"',
    last_modified: "2026-10-20T12:05:00Z",
    latency_ms: 342,
    errors: [],
    error_codes: [],
    error_events: [],
  },
  title: "Fast-Track Winter Internship Program (Registration Fee Required)",
  description: "Exclusive 3-month remote engineering internship at Global AI Labs.",
  author: "CareerBridge Global",
  publishedDate: "2026-10-20T12:00:00Z",
  language: "en",
  finalUrl: "https://chirp.local/sandbox/post/internship-scam-alert",
  links: ["https://chirp.local/u/careerbridge_official"],
  imageLinks: ["https://images.unsplash.com/photo-1516321318423-f06f85e504b3"],
  etag: 'W/"saakshi-fixture-etag-001"',
  lastModified: "2026-10-20T12:05:00Z",
  latencyMs: 342,
  errors: [],
  errorCodes: [],
  errorEvents: [],
};

export const FIXTURE_BROWSER_CAPTURE: BrowserCaptureResult = {
  fullpageScreenshot: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  ),
  pagePdf: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n162\n%%EOF\n"),
  domHtml:
    "<!DOCTYPE html><html><head><title>Chirp Post</title></head><body><h1>Fast-Track Winter Internship Program</h1><p>Captured by Saakshi Fixture</p></body></html>",
  networkLog: [
    {
      url: "https://chirp.local/sandbox/post/internship-scam-alert",
      status: 200,
      method: "GET",
      resourceType: "document",
      contentType: "text/html; charset=utf-8",
      timing: 142,
    },
    {
      url: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3",
      status: 200,
      method: "GET",
      resourceType: "image",
      contentType: "image/jpeg",
      timing: 215,
    },
  ],
  tlsInfo: {
    protocol: "TLS 1.3",
    issuer: "CN=Let's Encrypt Authority X3, O=Let's Encrypt, C=US",
    subjectName: "CN=chirp.local",
    subject: "CN=chirp.local",
    validFrom: 1735689600,
    validTo: 1767225600,
  },
  finalUrl: "https://chirp.local/sandbox/post/internship-scam-alert",
  pageTitle: "Fast-Track Winter Internship Program (Registration Fee Required)",
};

export const FIXTURE_MONITOR_RESPONSE: MonitorCreateResponse = {
  monitor: {
    id: "mon_fixture_991823",
    type: "fetch",
    name: "saakshi-watch-fixture",
    status: "active",
    schedule_cron: "0 * * * *",
    created_at: new Date().toISOString(),
  },
  run: {
    id: "run_mon_001",
    is_baseline: true,
    status: "COMPLETED",
    results: [
      {
        text: FIXTURE_FETCH_RESULT.text,
        final_url: "https://chirp.local/sandbox/post/internship-scam-alert",
        title: FIXTURE_FETCH_RESULT.title,
      },
    ],
    errors: [],
  },
};

export const FIXTURE_SEARCH_RESPONSE: SearchResponse = {
  query: '"Mandatory one-time documentation and portal registration fee of ₹2,499"',
  results: [
    {
      title: "Scam Alert: Fake Global AI Labs Internship Posting",
      url: "https://forum.local/t/internship-scams-october-2026/4102",
      snippet:
        "...the post claimed a mandatory one-time documentation and portal registration fee of ₹2,499 to be transferred to UPI id recruit-verify@payu...",
    },
    {
      title: "CareerBridge Global Internship Review",
      url: "https://glassdoor-mirror.local/reviews/careerbridge-scam",
      snippet:
        "...do not pay the registration fee of ₹2,499. Multiple applicants have reported fraud...",
    },
  ],
};
