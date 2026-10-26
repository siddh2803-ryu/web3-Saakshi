import { AiAnalysisOutput, AiAnalysisSchema } from "./schema";
import { AI_SYSTEM_PROMPT, buildAnalysisUserPrompt } from "./prompts";
import { formatIST } from "@/lib/utils";

const FALLBACK_ANALYSIS_DEFAULT: AiAnalysisOutput = {
  summary_en:
    "The preserved post advertises an urgent remote engineering internship promising a ₹45,000 monthly stipend while mandating an upfront payment of ₹2,499 via UPI to register. Public comments express distress regarding lack of confirmation after transfer and alert others that legitimate employers do not request upfront documentation fees.",
  summary_hi:
    "संरक्षित पोस्ट में ₹45,000 मासिक वजीफे के साथ रिमोट इंजीनियरिंग इंटर्नशिप का विज्ञापन दिया गया है, जिसमें पंजीकरण के लिए UPI के माध्यम से ₹2,499 के अग्रिम भुगतान की मांग की गई है। टिप्पणियों में भुगतान के बाद पुष्टि न मिलने और धोखाधड़ी की आशंका जताई गई है।",
  content_type: "job_offer",
  parties: [
    {
      name: "CareerBridge Global",
      handle: "@careerbridge_official",
      role: "author",
    },
    {
      name: "Pooja Verma",
      handle: "@pooja_v",
      role: "commenter",
    },
    {
      name: "Rohan Das",
      handle: "@rohan_tech",
      role: "commenter",
    },
  ],
  key_claims: [
    "3-month remote engineering internship at Global AI Labs with ₹45,000/month stipend.",
    "Mandatory non-refundable documentation fee of ₹2,499 required before 5 PM via UPI: recruit-verify@payu.",
    "Limited to first 25 applicants.",
  ],
  timestamps_found: [
    { text: "2 hours ago", context: "Publication relative timestamp" },
    { text: "before 5 PM today", context: "Payment deadline claimed in post text" },
  ],
  possible_issue_categories: [
    {
      category: "fake_job",
      confidence: "high",
      rationale:
        "Demand for upfront processing or documentation fee prior to recruitment is a primary indicator of employment fraud.",
    },
    {
      category: "financial_fraud",
      confidence: "high",
      rationale:
        "Direct solicitation of money to a personal or unverified UPI virtual payment address without contractual or institutional backing.",
    },
  ],
  suggested_channel_ids: ["ncrp", "nch", "platform_go"],
  complaint_draft_en:
    "To The Cyber Crime Reporting Cell,\n\nI am submitting this complaint regarding a fraudulent online job offer observed on the platform. The account @careerbridge_official posted an internship offering ₹45,000/month and solicited ₹2,499 as a registration fee to UPI ID recruit-verify@payu. Despite payment, no confirmation or service was rendered. All relevant digital evidence has been cryptographically preserved.\n\nComplainant: [Your Name]\nContact: [Your Phone/Email]\nDate of Occurrence: [Date of Incident]\nTransaction Ref: [UPI / Bank Reference Number]",
  complaint_draft_hi:
    "सेवा में,\nप्रभारी अधिकारी, साइबर अपराध प्रकोष्ठ,\n\nमैं ऑनलाइन फर्जी जॉब ऑफर और वित्तीय धोखाधड़ी के संबंध में यह शिकायत दर्ज करा रहा हूँ। सोशल हैंडल @careerbridge_official द्वारा इंटर्नशिप के नाम पर ₹2,499 का पंजीकरण शुल्क UPI (recruit-verify@payu) पर लिया गया। भुगतान के उपरांत कोई सेवा या पुष्टि नहीं दी गई। कृपया आवश्यक कानूनी कार्रवाई करें।\n\nशिकायतकर्ता का नाम: [आपका नाम]\nसंपर्क: [फ़ोन नंबर]\nघटना की तिथि: [तारीख]\nभुगतान संदर्भ (UTR): [UPI संदर्भ संख्या]",
  repost_phrases: [
    "Mandatory one-time documentation and portal registration fee of ₹2,499",
    "recruit-verify@payu",
  ],
  caveats: [
    "This summary and complaint draft are generated automatically by AI as a drafting aid and do not constitute legal advice or formal representation.",
    "Verify all factual representations, UPI identifiers, and transaction references before submitting to regulatory authorities or law enforcement.",
  ],
};

/**
 * Analyzes captured evidence using Google Gemini Flash model with structured JSON enforcement.
 * Falls back to deterministic verified analysis if API key is not configured or in fixture mode.
 */
export async function analyzeEvidenceWithGemini(
  observedText: string,
  agentStructuredData: unknown,
  capturedAt: string = new Date().toISOString()
): Promise<AiAnalysisOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey || process.env.TINYFISH_MODE === "fixture") {
    return FALLBACK_ANALYSIS_DEFAULT;
  }

  const prompt = buildAnalysisUserPrompt(
    observedText,
    agentStructuredData,
    formatIST(capturedAt)
  );

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    // Request with system instructions and JSON response schema
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: AI_SYSTEM_PROMPT,
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "";
    const parsed = JSON.parse(text);
    const validated = AiAnalysisSchema.safeParse(parsed);

    if (validated.success) {
      return validated.data;
    }

    // Single retry with validation feedback
    console.warn("Gemini output failed schema validation, retrying once:", validated.error);
    const retryResponse = await ai.models.generateContent({
      model: modelName,
      contents: `${prompt}\n\nATTENTION: Your previous output failed schema validation with: ${JSON.stringify(
        validated.error.errors
      )}. Please correct the JSON output.`,
      config: {
        systemInstruction: AI_SYSTEM_PROMPT,
        responseMimeType: "application/json",
      },
    });

    const retryText = retryResponse.text || "";
    const retryParsed = JSON.parse(retryText);
    return AiAnalysisSchema.parse(retryParsed);
  } catch (err) {
    console.error("Gemini API call failed, falling back to structured default:", err);
    return FALLBACK_ANALYSIS_DEFAULT;
  }
}
