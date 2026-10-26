import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Image,
} from "@react-pdf/renderer";
import { EvidenceManifest } from "@/lib/evidence/manifest";
import { formatIST } from "@/lib/utils";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1E293B",
    lineHeight: 1.4,
  },
  headerBanner: {
    backgroundColor: "#1E1B4B",
    color: "#FFFFFF",
    padding: 10,
    borderRadius: 4,
    marginBottom: 12,
    textAlign: "center",
  },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 8,
    color: "#E2E8F0",
  },
  section: {
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#1E1B4B",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  fieldRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  fieldLabel: {
    width: "35%",
    fontFamily: "Helvetica-Bold",
    color: "#475569",
  },
  fieldValue: {
    width: "65%",
    color: "#0F172A",
  },
  blankLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#94A3B8",
    width: "60%",
    marginTop: 10,
  },
  table: {
    width: "100%",
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  tableHeader: {
    backgroundColor: "#F1F5F9",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  col1: { width: "15%" },
  col2: { width: "25%" },
  col3: { width: "12%" },
  col4: { width: "48%" },
  hashText: {
    fontFamily: "Courier",
    fontSize: 7,
    color: "#334155",
  },
  annexBox: {
    backgroundColor: "#F8FAFC",
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 4,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    textAlign: "center",
    fontSize: 7,
    color: "#94A3B8",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 6,
  },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    paddingTop: 10,
  },
  signatureBlock: {
    width: "45%",
  },
  qrCode: {
    width: 60,
    height: 60,
    alignSelf: "flex-end",
  },
});

export interface CertificateAnchoringDetails {
  root?: string;
  txHash?: string;
  blockNumber?: number;
  anchoredAt?: string;
  contract?: string;
  chainId?: number;
}

interface CertificateProps {
  manifest: EvidenceManifest;
  manifestSha256: string;
  anchoring?: CertificateAnchoringDetails | null;
  qrDataUrl?: string | null;
}

export const CertificateDocument: React.FC<CertificateProps> = ({
  manifest,
  manifestSha256,
  anchoring,
  qrDataUrl,
}) => {
  return (
    <Document title={`Certificate_s63_4_${manifest.captureId}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerBanner}>
          <Text style={styles.title}>
            DRAFT: CERTIFICATE UNDER SECTION 63(4) OF THE BHARATIYA SAKSHYA ADHINIYAM, 2023
          </Text>
          <Text style={styles.subtitle}>
            Part A (To be completed and signed by the party producing the electronic record)
          </Text>
        </View>

        {/* 1. Declarant */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Particulars of Declarant</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Full Name:</Text>
            <View style={styles.blankLine} />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Son / Daughter / Spouse of:</Text>
            <View style={styles.blankLine} />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Residential Address:</Text>
            <View style={styles.blankLine} />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Mobile / Email:</Text>
            <View style={styles.blankLine} />
          </View>
        </View>

        {/* 2. Source of the Records */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Source and Capture Environment</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Generating System:</Text>
            <Text style={styles.fieldValue}>
              Cloud-hosted browser session operated by TinyFish on behalf of Saakshi
            </Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Saakshi Capture ID:</Text>
            <Text style={[styles.fieldValue, { fontFamily: "Courier" }]}>{manifest.captureId}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>TinyFish Agent Run ID:</Text>
            <Text style={[styles.fieldValue, { fontFamily: "Courier" }]}>
              {manifest.tools.tinyfish.agentRunId || "N/A (Browser direct)"}
            </Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Target URL:</Text>
            <Text style={styles.fieldValue}>{manifest.target.url}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Final Resolved URL:</Text>
            <Text style={styles.fieldValue}>{manifest.target.finalUrl}</Text>
          </View>
        </View>

        {/* 3. Date & Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Timestamp of Electronic Record</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Server Capture Time (IST):</Text>
            <Text style={styles.fieldValue}>{formatIST(manifest.time.serverFinishedAt)}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Universal Time Coordinated (UTC):</Text>
            <Text style={styles.fieldValue}>{manifest.time.serverFinishedAt}</Text>
          </View>
        </View>

        {/* 4. Lawful Control Statement */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Lawful Custody & Operation Statement</Text>
          <Text style={{ fontSize: 8, fontStyle: "italic", color: "#334155" }}>
            [I state that the electronic records detailed herein were obtained by accessing the public World Wide Web in the ordinary course of gathering information. The device and cloud automated browser used were operating properly at the material time without unauthorized interference.]
          </Text>
        </View>

        {/* 5. Cryptographic Fingerprints */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Cryptographic Hash Disclosures (BSA 2023 s.63(4))</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Hash Algorithm:</Text>
            <Text style={styles.fieldValue}>[X] SHA-256    [ ] SHA-1    [ ] MD5    [ ] Other</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Canonical Manifest SHA-256:</Text>
            <Text style={[styles.fieldValue, styles.hashText]}>{manifestSha256}</Text>
          </View>

          {/* Artifacts Table */}
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={styles.col1}>Artifact ID</Text>
              <Text style={styles.col2}>Kind</Text>
              <Text style={styles.col3}>Size</Text>
              <Text style={styles.col4}>SHA-256 Plaintext Hash</Text>
            </View>
            {manifest.artifacts.slice(0, 10).map((art) => (
              <View key={art.id} style={styles.tableRow}>
                <Text style={styles.col1}>{art.id}</Text>
                <Text style={styles.col2}>{art.kind}</Text>
                <Text style={styles.col3}>{(art.bytes / 1024).toFixed(1)} KB</Text>
                <Text style={[styles.col4, styles.hashText]}>{art.sha256}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 6. Blockchain Anchoring Annex */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Annex: On-Chain Merkle Timestamping</Text>
          <View style={[styles.annexBox, { flexDirection: "row", justifyContent: "space-between" }]}>
            <View style={{ width: qrDataUrl ? "78%" : "100%" }}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Blockchain Network:</Text>
                <Text style={styles.fieldValue}>Polygon Amoy Testnet (Chain ID: 80002)</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Contract Address:</Text>
                <Text style={[styles.fieldValue, styles.hashText]}>
                  {anchoring?.contract || "Pending batch anchoring"}
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Transaction Hash:</Text>
                <Text style={[styles.fieldValue, styles.hashText]}>
                  {anchoring?.txHash || "Pending batch anchoring"}
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Merkle Root:</Text>
                <Text style={[styles.fieldValue, styles.hashText]}>
                  {anchoring?.root || "Pending batch anchoring"}
                </Text>
              </View>
            </View>
            {qrDataUrl && (
              <View style={{ width: "20%", alignItems: "center" }}>
                <Image src={qrDataUrl} style={styles.qrCode} />
                <Text style={{ fontSize: 6, color: "#64748B", marginTop: 2 }}>Scan to Verify</Text>
              </View>
            )}
          </View>
        </View>

        {/* Signatures */}
        <View style={styles.signatureRow}>
          <View style={styles.signatureBlock}>
            <Text style={{ fontSize: 8, color: "#475569" }}>Date: ________________________</Text>
            <Text style={{ fontSize: 8, color: "#475569", marginTop: 8 }}>
              Place: _______________________
            </Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={{ fontSize: 8, color: "#475569", textAlign: "right" }}>
              _________________________________
            </Text>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#1E293B", textAlign: "right" }}>
              Signature of Declarant (Part A)
            </Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Generated by Saakshi as a drafting aid under BSA, 2023 s.63(4). Not legal advice. Check the wording against the official Schedule. Part B must be completed by a qualified electronic evidence expert.
        </Text>
      </Page>
    </Document>
  );
};

export async function renderCertificatePdf(
  manifest: EvidenceManifest,
  manifestSha256: string,
  anchoring?: CertificateAnchoringDetails | null,
  qrDataUrl?: string | null
): Promise<Buffer> {
  const doc = (
    <CertificateDocument
      manifest={manifest}
      manifestSha256={manifestSha256}
      anchoring={anchoring}
      qrDataUrl={qrDataUrl}
    />
  );
  const blob = await pdf(doc).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
