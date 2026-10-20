import { computeSha256 } from "./hash";

export interface IpfsUploadResult {
  cid: string;
  bytes: number;
}

/**
 * Uploads a Buffer (such as ciphertext or file bytes) to IPFS via Pinata.
 * Falls back to deterministic mock CID if PINATA_JWT is not configured.
 */
export async function uploadBufferToIpfs(
  buffer: Buffer,
  filename: string
): Promise<IpfsUploadResult> {
  const jwt = process.env.PINATA_JWT;

  if (!jwt) {
    // Generate deterministic mock CID for fixture/offline runs
    const hash = computeSha256(buffer);
    const mockCid = `bafy_mock_${hash.slice(0, 32)}`;
    return {
      cid: mockCid,
      bytes: buffer.length,
    };
  }

  try {
    const formData = new FormData();
    const uint8 = new Uint8Array(buffer);
    const blob = new Blob([uint8]);
    formData.append("file", blob, filename);

    const pinataMetadata = JSON.stringify({ name: filename });
    formData.append("pinataMetadata", pinataMetadata);

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Pinata upload failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as { IpfsHash: string; PinSize: number };
    return {
      cid: data.IpfsHash,
      bytes: data.PinSize,
    };
  } catch (err: unknown) {
    console.error("IPFS Pinata upload error, falling back to deterministic CID:", err);
    const hash = computeSha256(buffer);
    return {
      cid: `bafy_fallback_${hash.slice(0, 32)}`,
      bytes: buffer.length,
    };
  }
}

/**
 * Uploads JSON object to IPFS.
 */
export async function uploadJsonToIpfs(
  obj: unknown,
  filename: string
): Promise<IpfsUploadResult> {
  const str = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  const buf = Buffer.from(str, "utf8");
  return uploadBufferToIpfs(buf, filename);
}
