import { AiAnalysisOutput, AiAnalysisSchema } from "./schema";
import {
  AI_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
  buildMultimodalPrompt,
  StepScreenshotInput,
} from "./prompts";
import { formatIST } from "@/lib/utils";

export const GEMINI_TIMEOUT_MS = 60000;

/**
 * OpenAPI-compatible JSON Schema for Gemini structured output per PRD 12.2.
 */
export const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary_en: {
      type: "string",
      description: "Factual summary in plain English (max 120 words)",
    },
    summary_hi: {
      type: "string",
      description: "Factual summary in simple Devanagari Hindi",
    },
    content_type: {
      type: "string",
      enum: [
        "social_post",
        "profile",
        "listing",
        "job_offer",
        "article",
        "message",
        "other",
      ],
    },
    parties: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", nullable: true },
          handle: { type: "string", nullable: true },
          role: {
            type: "string",
            enum: ["author", "mentioned", "commenter", "organisation"],
          },
        },
        required: ["role"],
      },
    },
    key_claims: {
      type: "array",
      items: { type: "string" },
    },
    timestamps_found: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          context: { type: "string" },
        },
        required: ["text", "context"],
      },
    },
    possible_issue_categories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "harassment",
              "impersonation",
              "morphed_image",
              "financial_fraud",
              "fake_job",
              "defamation",
              "consumer_dispute",
              "ip_infringement",
              "hate_speech",
              "other",
            ],
          },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          rationale: { type: "string" },
        },
        required: ["category", "confidence", "rationale"],
      },
    },
    suggested_channel_ids: {
      type: "array",
      items: {
        type: "string",
        enum: ["ncrp", "nch", "ejagriti", "platform_go", "police"],
      },
      description:
        "Official Indian reporting channel IDs only. Never return URLs.",
    },
    complaint_draft_en: {
      type: "string",
      description: "Polite, objective draft complaint in English with placeholders",
    },
    complaint_draft_hi: {
      type: "string",
      description: "Polite, objective draft complaint in Hindi with placeholders",
    },
    repost_phrases: {
      type: "array",
      items: { type: "string" },
      description: "Max 2 distinctive phrases (<= 12 words) to locate reposts/mirrors",
    },
    caveats: {
      type: "array",
      items: { type: "string" },
      description: "Legal disclaimer caveats",
    },
  },
  required: [
    "summary_en",
    "summary_hi",
    "content_type",
    "parties",
    "key_claims",
    "timestamps_found",
    "possible_issue_categories",
    "suggested_channel_ids",
    "complaint_draft_en",
    "complaint_draft_hi",
    "repost_phrases",
    "caveats",
  ],
};

const verifiedModelCache = new Set<string>();

/**
 * Resets the in-memory cache of verified models (useful for testing).
 */
export function resetModelVerificationCache(): void {
  verifiedModelCache.clear();
}

/**
 * Retrieves and validates the Gemini configuration from the environment.
 * The model name is strictly resolved from GEMINI_MODEL without any hardcoded fallback.
 */
export function getGeminiConfig(): { apiKey: string; modelName: string } {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not configured. Live Gemini analysis requires a valid API key."
    );
  }

  const modelName = process.env.GEMINI_MODEL;
  if (!modelName || !modelName.trim()) {
    throw new Error(
      "GEMINI_MODEL environment variable is not configured. Please set GEMINI_MODEL in your environment (e.g. gemini-2.5-flash). Hardcoded model names are strictly prohibited."
    );
  }

  return { apiKey: apiKey.trim(), modelName: modelName.trim() };
}

/**
 * Verifies that the configured model is accessible with the provided API key by calling ai.models.list().
 * Fails with a clear message showing available models if the model is not found.
 */
export async function verifyModelAvailability(
  ai: any,
  targetModel: string
): Promise<boolean> {
  const cleanTarget = targetModel.replace(/^models\//, "");
  if (verifiedModelCache.has(cleanTarget)) {
    return true;
  }

  try {
    const pager = await ai.models.list();
    const availableModels: string[] = [];

    if (pager) {
      if (typeof pager[Symbol.asyncIterator] === "function") {
        for await (const m of pager) {
          if (m?.name) availableModels.push(m.name);
        }
      } else if (Array.isArray(pager)) {
        for (const m of pager) {
          if (m?.name) availableModels.push(m.name);
        }
      } else if (Array.isArray(pager.page)) {
        for (const m of pager.page) {
          if (m?.name) availableModels.push(m.name);
        }
      }
    }

    const matches = availableModels.some((name) => {
      const cleanName = name.replace(/^models\//, "");
      return cleanName === cleanTarget;
    });

    if (!matches && availableModels.length > 0) {
      const sample = availableModels
        .slice(0, 8)
        .map((m) => m.replace(/^models\//, ""))
        .join(", ");
      throw new Error(
        `Configured model "${targetModel}" is not available to the provided API key. Available models: ${sample}${
          availableModels.length > 8 ? "..." : ""
        }`
      );
    }

    verifiedModelCache.add(cleanTarget);
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not available to the provided API key")) {
      throw err;
    }
    console.warn(`[Gemini] Model availability check warning: ${msg}`);
    return false;
  }
}

/**
 * Executes an async operation with a guaranteed 60-second timeout.
 */
export async function executeGeminiWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = GEMINI_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const timeoutPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => {
      reject(new Error(`Gemini API request timed out after ${timeoutMs / 1000} seconds`));
    });
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks whether a Gemini response was safety-blocked or empty.
 */
export function isResponseSafetyBlockedOrEmpty(response: any): {
  isBlocked: boolean;
  blockReason?: string;
} {
  if (!response) {
    return { isBlocked: true, blockReason: "EMPTY_RESPONSE" };
  }

  const promptBlock = response.promptFeedback?.blockReason;
  if (promptBlock) {
    return { isBlocked: true, blockReason: `PROMPT_BLOCKED_${promptBlock}` };
  }

  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    return { isBlocked: true, blockReason: "NO_CANDIDATES" };
  }

  const firstCandidate = candidates[0];
  const finishReason = firstCandidate?.finishReason;
  if (
    finishReason &&
    ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "MALICIOUS"].includes(
      String(finishReason).toUpperCase()
    )
  ) {
    return { isBlocked: true, blockReason: `FINISH_REASON_${finishReason}` };
  }

  const text = typeof response.text === "string" ? response.text : "";
  if (!text.trim()) {
    return { isBlocked: true, blockReason: "EMPTY_TEXT" };
  }

  return { isBlocked: false };
}

/**
 * Constructs an analysis result marked UNAVAILABLE when content is safety-blocked or empty.
 */
export function createUnavailableAnalysis(
  friendlyMessage = "AI summary unavailable for this content",
  blockReason?: string
): AiAnalysisOutput {
  return {
    status: "UNAVAILABLE",
    summary_en: friendlyMessage,
    summary_hi: "इस सामग्री के लिए एआई सारांश उपलब्ध नहीं है।",
    content_type: "other",
    parties: [],
    key_claims: [],
    timestamps_found: [],
    possible_issue_categories: [],
    suggested_channel_ids: [],
    complaint_draft_en: "[AI summary unavailable for this content]",
    complaint_draft_hi: "[इस सामग्री के लिए एआई सारांश उपलब्ध नहीं है]",
    repost_phrases: [],
    caveats: [
      "AI summary is unavailable for this content due to automated safety filter policies. All original web evidence and cryptographic hashes remain preserved and verifiable.",
    ],
    error: blockReason || "SAFETY_BLOCKED",
  };
}

/**
 * Constructs a fallback analysis result marked as FAILED with a friendly message.
 * Ensures the capture pipeline never halts or fails due to AI analysis errors.
 */
export function createFailedAnalysis(
  friendlyMessage = "AI analysis could not be completed for this capture. The model output could not be validated.",
  errorDetail?: string
): AiAnalysisOutput {
  return {
    status: "FAILED",
    summary_en: friendlyMessage,
    summary_hi: "इस साक्ष्य के लिए एआई सारांश उपलब्ध नहीं हो सका।",
    content_type: "other",
    parties: [],
    key_claims: [],
    timestamps_found: [],
    possible_issue_categories: [],
    suggested_channel_ids: [],
    complaint_draft_en: "[AI summary unavailable for complaint drafting]",
    complaint_draft_hi: "[शिकायत प्रारूप के लिए एआई विश्लेषण अनुपलब्ध]",
    repost_phrases: [],
    caveats: [
      "AI analysis failed schema validation. The original web evidence remains securely fingerprinted and unaltered.",
    ],
    error: errorDetail,
  };
}

export const FALLBACK_ANALYSIS_DEFAULT: AiAnalysisOutput = {
  status: "SUCCESS",
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
 * Parses and validates raw model text with Zod.
 * On first failure, invokes retryFn once with error details.
 * On second failure, returns a friendly FAILED analysis without crashing.
 */
export async function validateWithOneRetry(
  firstRawText: string,
  retryFn: (validationError: string) => Promise<string>
): Promise<AiAnalysisOutput> {
  let firstParsed: unknown;
  try {
    firstParsed = JSON.parse(firstRawText);
  } catch (parseErr: unknown) {
    const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    console.warn(`[Gemini] First attempt returned invalid JSON syntax: ${parseMsg}`);
    try {
      const retryText = await retryFn(`Invalid JSON syntax: ${parseMsg}. Return strictly valid JSON.`);
      const retryParsed = JSON.parse(retryText);
      const validated = AiAnalysisSchema.safeParse(retryParsed);
      if (validated.success) return validated.data;
      return createFailedAnalysis(
        "AI analysis could not be completed for this capture. The model output could not be validated after retry.",
        JSON.stringify(validated.error.issues)
      );
    } catch (secondErr: unknown) {
      return createFailedAnalysis(
        "AI analysis could not be completed for this capture. The model output could not be parsed.",
        secondErr instanceof Error ? secondErr.message : String(secondErr)
      );
    }
  }

  const firstValidated = AiAnalysisSchema.safeParse(firstParsed);
  if (firstValidated.success) {
    return firstValidated.data;
  }

  const validationErrors = JSON.stringify(firstValidated.error.issues);
  console.warn(`[Gemini] First attempt failed Zod schema validation: ${validationErrors}`);

  try {
    const retryText = await retryFn(
      `Your previous JSON output failed schema validation with errors: ${validationErrors}. Please correct the output to strictly conform to the required JSON schema.`
    );
    const retryParsed = JSON.parse(retryText);
    const secondValidated = AiAnalysisSchema.safeParse(retryParsed);
    if (secondValidated.success) {
      return secondValidated.data;
    }
    console.warn(`[Gemini] Second attempt also failed schema validation: ${JSON.stringify(secondValidated.error.issues)}`);
    return createFailedAnalysis(
      "AI analysis could not be completed for this capture. The model output could not be validated after retry.",
      JSON.stringify(secondValidated.error.issues)
    );
  } catch (secondErr: unknown) {
    const secondMsg = secondErr instanceof Error ? secondErr.message : String(secondErr);
    console.warn(`[Gemini] Second attempt failed to execute or parse: ${secondMsg}`);
    return createFailedAnalysis(
      "AI analysis could not be completed for this capture. The model output could not be parsed.",
      secondMsg
    );
  }
}

/**
 * Analyzes captured evidence using Google Gemini model with structured JSON enforcement and 1 validation retry.
 */
export async function analyzeEvidenceWithGemini(
  observedText: string,
  agentStructuredData: unknown,
  capturedAt: string = new Date().toISOString(),
  screenshots?: StepScreenshotInput[]
): Promise<AiAnalysisOutput> {
  const apiKey = process.env.GEMINI_API_KEY;

  // Canned fallback handling (restricted in Commit 9)
  if (!apiKey || process.env.TINYFISH_MODE === "fixture") {
    return FALLBACK_ANALYSIS_DEFAULT;
  }

  let validKey: string;
  let modelName: string;
  try {
    const config = getGeminiConfig();
    validKey = config.apiKey;
    modelName = config.modelName;
  } catch (cfgErr) {
    console.error("Gemini configuration error:", cfgErr);
    return createFailedAnalysis(
      "AI analysis unavailable: Gemini model configuration is incomplete.",
      cfgErr instanceof Error ? cfgErr.message : String(cfgErr)
    );
  }

  const multimodal = buildMultimodalPrompt({
    observedText,
    agentStructuredData,
    capturedAtIST: formatIST(capturedAt),
    screenshots,
  });

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: validKey });

    // Startup model availability verification
    await verifyModelAvailability(ai, modelName);

    return await executeGeminiWithTimeout(async () => {
      // First attempt with structured schema
      const response = await ai.models.generateContent({
        model: modelName,
        contents: multimodal.parts,
        config: {
          systemInstruction: AI_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      });

      const safetyCheck = isResponseSafetyBlockedOrEmpty(response);
      if (safetyCheck.isBlocked) {
        console.warn(`[Gemini] First attempt blocked or empty: ${safetyCheck.blockReason}`);
        return createUnavailableAnalysis(
          "AI summary unavailable for this content",
          safetyCheck.blockReason
        );
      }

      const firstText = response.text || "";

      return await validateWithOneRetry(firstText, async (validationError) => {
        const retryResponse = await ai.models.generateContent({
          model: modelName,
          contents: [
            ...multimodal.parts,
            {
              text: `ATTENTION: ${validationError}`,
            },
          ],
          config: {
            systemInstruction: AI_SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: GEMINI_RESPONSE_SCHEMA,
          },
        });

        const retrySafety = isResponseSafetyBlockedOrEmpty(retryResponse);
        if (retrySafety.isBlocked) {
          console.warn(`[Gemini] Retry response blocked or empty: ${retrySafety.blockReason}`);
          throw new Error(`SAFETY_BLOCKED:${retrySafety.blockReason}`);
        }

        return retryResponse.text || "";
      });
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (
      errMsg.includes("SAFETY_BLOCKED") ||
      errMsg.toUpperCase().includes("SAFETY") ||
      errMsg.toUpperCase().includes("BLOCKLIST") ||
      errMsg.toUpperCase().includes("PROHIBITED_CONTENT")
    ) {
      console.warn(`[Gemini] Analysis blocked by safety filters: ${errMsg}`);
      return createUnavailableAnalysis("AI summary unavailable for this content", errMsg);
    }
    console.error("Gemini analysis error:", err);
    return createFailedAnalysis(
      "AI analysis encountered an error. The original capture remains fully intact.",
      errMsg
    );
  }
}
