import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trustless Public Verifier",
  description:
    "Verify any digital artifact or Saakshi evidence bundle locally in your browser using W3C WebCrypto SHA-256 and direct Polygon RPC query. Zero files uploaded.",
  openGraph: {
    title: "Verify Web Evidence (Client-Side) | Saakshi",
    description:
      "Verify any digital artifact or evidence bundle locally in your browser with zero file uploads.",
  },
};

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
