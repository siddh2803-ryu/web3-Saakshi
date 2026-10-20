import { computeSha256, toBytes32 } from "./hash";
import { canonicalJson } from "./canonical";

export type ArtifactKind =
  | "agent_step_screenshot"
  | "agent_step_html"
  | "agent_video"
  | "agent_result_json"
  | "fullpage_screenshot"
  | "page_pdf"
  | "dom_html"
  | "network_log"
  | "tls_info"
  | "fetch_markdown"
  | "fetch_meta";

export interface ManifestArtifact {
  id: string;
  kind: ArtifactKind;
  stepIndex?: number;
  stepId?: string;
  action?: string;
  mime: string;
  bytes: number;
  sha256: string;
  cid: string;
  capturedAt: string;
}

export interface EvidenceManifest {
  schema: "saakshi.evidence/v1";
  captureId: string;
  previousCaptureId: string | null;
  requester: {
    uidHash: string;
  };
  target: {
    url: string;
    finalUrl: string;
    goal?: string;
    mode: "standard" | "deep";
  };
  time: {
    serverStartedAt: string;
    serverFinishedAt: string;
    agentStartedAt?: string;
    agentFinishedAt?: string;
  };
  tools: {
    saakshiVersion: string;
    gitCommit: string;
    tinyfish: {
      agentRunId?: string;
      agentSteps?: number;
      browserSessionId?: string;
      browserProfile?: string;
      proxyCountry?: string;
      fetchLatencyMs?: number;
    };
  };
  observed: {
    title?: string | null;
    author?: string | null;
    publishedAtText?: string | null;
    contentHash: string;
  };
  artifacts: ManifestArtifact[];
  hashAlgorithm: "SHA-256";
  encryption: "AES-256-GCM (cid refers to ciphertext; sha256 refers to plaintext)";
}

/**
 * Computes canonical RFC 8785 JSON representation and its SHA-256 hash.
 */
export function computeManifestSha256(manifest: EvidenceManifest): {
  canonicalJsonString: string;
  manifestSha256: string;
  bytes32Hash: `0x${string}`;
} {
  const canonicalJsonString = canonicalJson(manifest);
  const manifestSha256 = computeSha256(Buffer.from(canonicalJsonString, "utf8"));
  const bytes32Hash = toBytes32(manifestSha256);
  return {
    canonicalJsonString,
    manifestSha256,
    bytes32Hash,
  };
}

/**
 * Generates an anonymous salted hash of the user UID.
 */
export function hashUid(uid: string, salt: string = process.env.UID_HASH_SALT || "saakshi_default_salt"): string {
  return computeSha256(`${uid}:${salt}`);
}
