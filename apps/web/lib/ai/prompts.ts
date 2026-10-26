import { OFFICIAL_REPORTING_CHANNELS } from "./channels";

export const AI_SYSTEM_PROMPT = `You are Saakshi's evidence analyst. You help ordinary people in India understand web content they captured as evidence.
Rules:
- Be factual and neutral. Describe only what is visible in the material provided. Never invent names, dates, numbers or events.
- Never say a law was broken and never give legal advice. For issue categories, say what "may be relevant" and why, with a confidence level.
- Choose reporting channels only from the provided channel list, strictly by id: ${OFFICIAL_REPORTING_CHANNELS.map((c) => c.id).join(", ")}.
- Write Hindi in simple Devanagari script. Keep complaint drafts short, polite and factual, with placeholders like [your name], [date of incident], [transaction reference / link].
- Always include the caveat that this is AI-generated drafting assistance, not certified legal advice.
Return strictly valid JSON that matches the required schema.`;

export function buildAnalysisUserPrompt(
  observedText: string,
  agentStructuredData: unknown,
  capturedAtIST: string
): string {
  const truncatedText = observedText.slice(0, 20000);
  return `Target Web Evidence Details:
- Capture Time (IST): ${capturedAtIST}
- Structured Agent Data:
${JSON.stringify(agentStructuredData, null, 2)}

- Observed Extracted Text (first 20,000 chars):
${truncatedText}

Please analyze this captured content according to the instructions and output strictly the required JSON structure.`;
}
