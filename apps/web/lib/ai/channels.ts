export interface ReportingChannel {
  id: string;
  name: string;
  category: "cyber" | "consumer" | "grievance" | "law_enforcement";
  url?: string;
  helpline?: string;
  description: string;
}

export const OFFICIAL_REPORTING_CHANNELS: ReportingChannel[] = [
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
];

export function getChannelById(id: string): ReportingChannel | undefined {
  return OFFICIAL_REPORTING_CHANNELS.find((c) => c.id === id);
}
