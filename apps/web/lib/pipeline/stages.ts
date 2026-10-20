export type CaptureStatus =
  | "QUEUED"
  | "AGENT_RUNNING"
  | "AGENT_DONE"
  | "BROWSER_CAPTURE"
  | "FETCHING"
  | "FINGERPRINTING"
  | "ENCRYPTING"
  | "UPLOADING"
  | "ANALYZING"
  | "READY"
  | "PARTIAL"
  | "ANCHORING"
  | "ANCHORED"
  | "FAILED";

export interface PipelineStageEvent {
  stage: CaptureStatus;
  message: string;
  at: string;
}

export const STAGE_DESCRIPTIONS: Record<CaptureStatus, string> = {
  QUEUED: "Capture job queued for execution",
  AGENT_RUNNING: "TinyFish Web Agent actively browsing and interacting with target page",
  AGENT_DONE: "Agent goal completed and action step history retrieved",
  BROWSER_CAPTURE: "TinyFish Browser API capturing full-page snapshot, PDF, DOM and network logs",
  FETCHING: "TinyFish Fetch extracting clean markdown and metadata",
  FINGERPRINTING: "Computing SHA-256 fingerprints over all plaintext artifacts",
  ENCRYPTING: "Generating DEK and executing AES-256-GCM envelope encryption",
  UPLOADING: "Pinning encrypted artifacts and canonical manifest to IPFS via Pinata",
  ANALYZING: "Gemini analyzing content facts and drafting Section 63(4) materials",
  READY: "Evidence sealed, fingerprinted, and ready for anchoring",
  PARTIAL: "Evidence captured with caveats (content was partially blocked or restricted)",
  ANCHORING: "Constructing Merkle tree batch and broadcasting transaction to Polygon Amoy",
  ANCHORED: "Cryptographically anchored on-chain with immutable block timestamp",
  FAILED: "Pipeline execution encountered an error",
};
