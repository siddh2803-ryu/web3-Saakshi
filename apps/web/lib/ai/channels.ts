export const REPORTING_CHANNEL_IDS = [
  "ncrp",
  "nch",
  "ejagriti",
  "platform_go",
  "police",
] as const;

export type ReportingChannelId = (typeof REPORTING_CHANNEL_IDS)[number];

export interface ReportingChannel {
  id: ReportingChannelId;
  name: string;
  category: "cyber" | "consumer" | "grievance" | "law_enforcement";
  url?: string;
  helpline?: string;
  description: string;
}

/**
 * Official Indian reporting channels per PRD Section 12.3.
 * Stable IDs: ncrp, nch, ejagriti, platform_go, police.
 * Text-only entries (platform_go, police) deliberately have no URL.
 * Web entries use authoritative government URLs.
 */
export const OFFICIAL_REPORTING_CHANNELS: readonly ReportingChannel[] = [
  {
    id: "ncrp",
    name: "National Cyber Crime Reporting Portal (NCRP)",
    category: "cyber",
    url: "https://cybercrime.gov.in",
    helpline: "1930",
    description:
      "Official Government of India portal for reporting cyber fraud, online harassment, financial scams, and morphed images.",
  },
  {
    id: "nch",
    name: "National Consumer Helpline (NCH)",
    category: "consumer",
    url: "https://consumerhelpline.gov.in",
    helpline: "1915",
    description:
      "Department of Consumer Affairs portal for consumer fraud, misleading listings, and unfulfilled paid transactions.",
  },
  {
    id: "ejagriti",
    name: "e-Daakhil / e-Jagriti Consumer Portal",
    category: "consumer",
    url: "https://e-jagriti.gov.in",
    description:
      "Online filing of consumer disputes and grievances directly before Consumer Dispute Redressal Commissions across India.",
  },
  {
    id: "platform_go",
    name: "Platform Resident Grievance Officer (IT Rules, 2021)",
    category: "grievance",
    description:
      "Statutory grievance officer mandated under Rule 3(2) of the Information Technology (Intermediary Guidelines) Rules, 2021 to acknowledge and act on unlawful content within 24–72 hours.",
  },
  {
    id: "police",
    name: "Local Police Cyber Cell / Police Station",
    category: "law_enforcement",
    description:
      "Jurisdictional cyber police station or local station for registering an FIR (First Information Report) or formal complaint.",
  },
] as const;

/**
 * Checks whether an untrusted string is a valid official reporting channel ID.
 */
export function isValidChannelId(id: string): id is ReportingChannelId {
  return (REPORTING_CHANNEL_IDS as readonly string[]).includes(id);
}

/**
 * Retrieves channel metadata by ID.
 */
export function getChannelById(id: string): ReportingChannel | undefined {
  return OFFICIAL_REPORTING_CHANNELS.find((c) => c.id === id);
}

/**
 * Returns all channels that provide a live destination URL.
 * Text-only channels (platform_go, police) are excluded.
 */
export function getChannelsWithUrls(): Array<ReportingChannel & { url: string }> {
  return OFFICIAL_REPORTING_CHANNELS.filter(
    (c): c is ReportingChannel & { url: string } => typeof c.url === "string" && c.url.length > 0
  );
}
