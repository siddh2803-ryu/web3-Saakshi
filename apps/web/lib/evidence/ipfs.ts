import { PinataSDK } from "pinata";
import { computeSha256 } from "./hash";

export interface IpfsUploadOptions {
  name: string;
  captureId: string;
  kind: string;
}

export interface IpfsUploadResult {
  cid: string;
  bytes: number;
  pinataFileId?: string;
  isFallback?: boolean;
}

/**
 * Initializes and returns an authenticated PinataSDK instance if PINATA_JWT is configured.
 */
export function getPinataClient(): PinataSDK | null {
  const jwt = process.env.PINATA_JWT;
  if (!jwt || jwt.trim() === "") {
    return null;
  }
  const gateway = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";
  const cleanGateway = gateway.replace(/^https?:\/\//, "").replace(/\/ipfs\/?$/, "");
  return new PinataSDK({ pinataJwt: jwt.trim(), pinataGateway: cleanGateway });
}

/**
 * Counts existing files in Pinata account for the free-plan guard (500 files limit).
 */
export async function getPinataFileCount(client?: PinataSDK | null): Promise<number> {
  const pinata = client !== undefined ? client : getPinataClient();
  if (!pinata) return 0;

  try {
    const files = await pinata.files.list().all();
    return files.length;
  } catch (err) {
    console.warn("Failed to query Pinata file count:", err);
    return 0;
  }
}

/**
 * Checks Pinata free-tier file quota before uploading.
 * Free plan allows 500 files.
 * Warns at >400.
 * Refuses new uploads at >=480 (unless IPFS_FALLBACK=dev), avoiding mid-capture failures.
 */
export async function checkPinataQuota(client?: PinataSDK | null): Promise<{
  count: number;
  allowed: boolean;
  warning?: string;
}> {
  const pinata = client !== undefined ? client : getPinataClient();
  if (!pinata) {
    return { count: 0, allowed: true };
  }

  const count = await getPinataFileCount(pinata);

  if (count > 400 && count < 480) {
    const warning = `[Pinata Quota Warning] ${count}/500 files used. Approaching free tier limit.`;
    console.warn(warning);
    return { count, allowed: true, warning };
  }

  if (count >= 480) {
    const isDevFallback = process.env.IPFS_FALLBACK === "dev";
    if (isDevFallback) {
      const warning = `[Pinata Quota Warning] ${count}/500 files used (>=480 limit). IPFS_FALLBACK=dev enabled; continuing with development fallback.`;
      console.warn(warning);
      return { count, allowed: true, warning };
    }
    const message = `Pinata free-tier quota reached: ${count}/500 files used. Uploads refused to prevent partial capture failure. Please delete old files.`;
    console.error(`[Pinata Quota Error] ${message}`);
    return { count, allowed: false, warning: message };
  }

  return { count, allowed: true };
}

/**
 * Uploads a Buffer (ciphertext or file bytes) to IPFS via Pinata V3 Files API.
 * Tags every upload with key-values: { app: "saakshi", env: "dev"|"prod", captureId, kind }.
 * Ensures pin names and metadata contain NO URLs, titles, or user data.
 * Falls back to deterministic mock CID ONLY if IPFS_FALLBACK=dev.
 */
export async function uploadBufferToIpfs(
  buffer: Buffer,
  options: IpfsUploadOptions | string,
  client?: PinataSDK | null
): Promise<IpfsUploadResult> {
  const opts: IpfsUploadOptions =
    typeof options === "string"
      ? { name: options, captureId: "unknown", kind: "artifact" }
      : options;

  // Sanitize filename: strictly safe characters, no URLs, no titles, no user data
  const sanitizedName = opts.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const env = process.env.NODE_ENV === "production" ? "prod" : "dev";

  const keyvalues: Record<string, string> = {
    app: "saakshi",
    env,
    captureId: opts.captureId,
    kind: opts.kind,
  };

  const pinata = client !== undefined ? client : getPinataClient();

  if (!pinata) {
    if (process.env.IPFS_FALLBACK === "dev") {
      const hash = computeSha256(buffer);
      const mockCid = `bafy_mock_${hash.slice(0, 32)}`;
      return {
        cid: mockCid,
        bytes: buffer.length,
        isFallback: true,
      };
    }
    throw new Error(
      "PINATA_JWT is not configured in environment and IPFS_FALLBACK != dev. Production requires valid Pinata credentials."
    );
  }

  try {
    const uint8 = new Uint8Array(buffer);
    const file = new File([uint8], sanitizedName, { type: "application/octet-stream" });
    const res = await pinata.upload.file(file).addMetadata({
      name: sanitizedName,
      keyvalues,
    });

    return {
      cid: res.cid,
      bytes: res.size || buffer.length,
      pinataFileId: res.id,
      isFallback: false,
    };
  } catch (err: unknown) {
    console.error("Pinata V3 upload failed:", err);
    if (process.env.IPFS_FALLBACK === "dev") {
      const hash = computeSha256(buffer);
      const fallbackCid = `bafy_fallback_${hash.slice(0, 32)}`;
      return {
        cid: fallbackCid,
        bytes: buffer.length,
        isFallback: true,
      };
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Pinata IPFS upload failed: ${errMsg}`);
  }
}

/**
 * Uploads JSON object to IPFS using Pinata V3 Files API.
 */
export async function uploadJsonToIpfs(
  obj: unknown,
  options: IpfsUploadOptions | string,
  client?: PinataSDK | null
): Promise<IpfsUploadResult> {
  const str = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  const buf = Buffer.from(str, "utf8");
  return uploadBufferToIpfs(buf, options, client);
}

/**
 * Unpins / deletes a file from Pinata V3 (for crypto-shredding and dev cleanup).
 */
export async function unpinFromIpfs(
  pinataFileIdOrCid: string,
  client?: PinataSDK | null
): Promise<boolean> {
  const pinata = client !== undefined ? client : getPinataClient();
  if (!pinata) return false;

  try {
    // If it looks like a Pinata file UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pinataFileIdOrCid)) {
      await pinata.files.delete([pinataFileIdOrCid]);
      return true;
    }
    // If it's a CID, find its file ID first
    const listRes = await pinata.files.list().cid(pinataFileIdOrCid);
    if (listRes.files && listRes.files.length > 0) {
      const ids = listRes.files.map((f: any) => f.id);
      await pinata.files.delete(ids);
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`Failed to unpin ${pinataFileIdOrCid} from Pinata:`, err);
    return false;
  }
}
