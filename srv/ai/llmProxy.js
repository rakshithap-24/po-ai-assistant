require("dotenv").config();

/**
 * Extract JSON safely from AI response.
 * Sometimes the model may wrap JSON inside ```json ... ```.
 */
function extractJsonObject(text) {
  if (!text) {
    throw new Error("AI response was empty");
  }

  let cleanedText = text.trim();

  cleanedText = cleanedText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const firstBrace = cleanedText.indexOf("{");
  const lastBrace = cleanedText.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("AI response did not contain a JSON object");
  }

  const jsonText = cleanedText.substring(firstBrace, lastBrace + 1);
  return JSON.parse(jsonText);
}

/**
 * Limit text before saving into HANA columns.
 */
function limitText(value, maxLength, fallbackValue) {
  if (!value || typeof value !== "string") {
    return fallbackValue;
  }

  return value.substring(0, maxLength);
}

/**
 * Normalize recommendation to only allowed values.
 */
function normalizeRecommendation(value) {
  if (!value || typeof value !== "string") {
    return "Review";
  }

  const normalized = value.trim();

  if (["Approve", "Review", "Reject"].includes(normalized)) {
    return normalized;
  }

  return "Review";
}

/**
 * Normalize risk level to only allowed values.
 */
function normalizeRiskLevel(value) {
  if (!value || typeof value !== "string") {
    return "Medium";
  }

  const normalized = value.trim();

  if (["Low", "Medium", "High"].includes(normalized)) {
    return normalized;
  }

  return "Medium";
}

function normalizeConfidence(value) {
  const confidence = Number(value);
  return Number.isFinite(confidence)
    ? Math.min(1, Math.max(0, confidence))
    : 0;
}

function normalizeEvidence(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 8)
    .map((item) => ({
      observation: limitText(item.observation, 300, "Evidence not available."),
      source: limitText(item.source, 100, "Purchase order data")
    }));
}

/**
 * Generates structured AI insight for a Purchase Order.
 *
 * This uses OpenRouter because your key is sk-or-v1 style.
 * It supports either:
 * OPENROUTER_API_KEY=sk-or-v1-...
 * or:
 * CLAUDE_API_KEY=sk-or-v1-...
 */
async function generatePurchaseOrderInsight(po) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.CLAUDE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing API key. Add OPENROUTER_API_KEY or CLAUDE_API_KEY in .env"
    );
  }

  const prompt = `
You are an enterprise SAP purchase order review assistant.

Analyze this purchase order and return only structured JSON.

Purchase Order:
- PO Number: ${po.poNumber}
- Vendor ID: ${po.vendor_ID}
- Description: ${po.description}
- Amount: ${po.amount} ${po.currency}
- Current Status: ${po.status}

Return ONLY valid JSON.
Do not return markdown.
Do not return headings.
Do not return a table.
Do not return bullets.
Do not return explanation outside JSON.

Use exactly this JSON structure:
{
  "riskSummary": "Short business risk summary under 500 characters",
  "recommendation": "Approve",
  "riskLevel": "Low",
  "reason": "Short business reason under 500 characters",
  "confidence": 0.75,
  "evidence": [{"observation": "Evidence from supplied order data", "source": "Purchase order data"}]
}

Rules:
- recommendation must be exactly one of: Approve, Review, Reject.
- riskLevel must be exactly one of: Low, Medium, High.
- riskSummary must be short enough to store in a database column.
- reason must be short, business-friendly, and suitable for an SAP approval workflow.
- confidence must be a number from 0 to 1 and reflect uncertainty; do not imply statistical calibration.
- evidence must contain only observations grounded in the supplied purchase order fields, with a short source label.
`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:4004",
      "X-Title": "AI Purchase Order Assistant"
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 350,
      temperature: 0.2
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("OpenRouter API error:", JSON.stringify(data, null, 2));
    throw new Error(data?.error?.message || "AI insight generation failed");
  }

  const aiText = data.choices?.[0]?.message?.content;

  if (!aiText) {
    throw new Error("AI response did not contain message content");
  }

  let parsedInsight;

  try {
    parsedInsight = extractJsonObject(aiText);
  } catch (error) {
    console.error("AI response was not valid JSON:", aiText);

    parsedInsight = {
      riskSummary: aiText.substring(0, 500),
      recommendation: "Review",
      riskLevel: "Medium",
      reason: "AI response could not be parsed into structured JSON.",
      confidence: 0,
      evidence: []
    };
  }

  return {
    riskSummary: limitText(
      parsedInsight.riskSummary,
      500,
      "AI risk summary not available."
    ),
    recommendation: normalizeRecommendation(parsedInsight.recommendation),
    riskLevel: normalizeRiskLevel(parsedInsight.riskLevel),
    reason: limitText(
      parsedInsight.reason,
      500,
      "AI reason not available."
    ),
    confidence: normalizeConfidence(parsedInsight.confidence),
    evidence: normalizeEvidence(parsedInsight.evidence)
  };
}

module.exports = {
  generatePurchaseOrderInsight
};