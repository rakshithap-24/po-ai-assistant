const assert = require("node:assert/strict");
const test = require("node:test");

const { generatePurchaseOrderInsight } = require("../srv/ai/llmProxy");

const originalApiKey = process.env.OPENROUTER_API_KEY;
const originalClaudeKey = process.env.CLAUDE_API_KEY;

test.beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.CLAUDE_API_KEY;
});

test.after(() => {
  if (originalApiKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = originalApiKey;
  }

  if (originalClaudeKey === undefined) {
    delete process.env.CLAUDE_API_KEY;
  } else {
    process.env.CLAUDE_API_KEY = originalClaudeKey;
  }
});

test("normalizes a valid structured model response", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            riskSummary: "Routine purchase",
            recommendation: "Approve",
            riskLevel: "Low",
            reason: "Amount and description are consistent.",
            confidence: 0.82,
            evidence: [{ observation: "Order amount is within the supplied range.", source: "Amount" }]
          })
        }
      }]
    })
  });

  try {
    const result = await generatePurchaseOrderInsight({
      poNumber: "PO-1",
      amount: 100,
      currency: "USD"
    });

    assert.equal(result.recommendation, "Approve");
    assert.equal(result.riskLevel, "Low");
    assert.equal(result.riskSummary, "Routine purchase");
    assert.equal(result.confidence, 0.82);
    assert.equal(result.evidence[0].source, "Amount");
  } finally {
    global.fetch = originalFetch;
  }
});

test("falls back to Review when model values are outside allowed enums", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            riskSummary: "Needs review",
            recommendation: "Maybe",
            riskLevel: "Urgent",
            reason: "Insufficient details."
          })
        }
      }]
    })
  });

  try {
    const result = await generatePurchaseOrderInsight({ poNumber: "PO-2" });
    assert.equal(result.recommendation, "Review");
    assert.equal(result.riskLevel, "Medium");
    assert.equal(result.confidence, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test("rejects provider errors with the provider message", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    json: async () => ({ error: { message: "Provider unavailable" } })
  });

  try {
    await assert.rejects(
      generatePurchaseOrderInsight({ poNumber: "PO-3" }),
      /Provider unavailable/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("requires an API key", async () => {
  delete process.env.OPENROUTER_API_KEY;

  await assert.rejects(
    generatePurchaseOrderInsight({ poNumber: "PO-4" }),
    /Missing API key/
  );
});