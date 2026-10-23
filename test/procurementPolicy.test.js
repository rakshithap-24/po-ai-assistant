const assert = require("node:assert/strict");
const test = require("node:test");

const { evaluatePurchaseOrderPolicy } = require("../srv/procurement/policy");

test("selects the highest-priority matching policy", () => {
  const result = evaluatePurchaseOrderPolicy(
    { amount: 42000, currency: "USD", department: "IT", vendor_ID: "vendor-1", riskLevel: "Low" },
    [
      { ID: "default", priority: 1, requiredApprovals: 1 },
      { ID: "it-large", priority: 10, department: "IT", minimumAmount: 10000, requiredApprovals: 2 }
    ]
  );

  assert.equal(result.policy.ID, "it-large");
  assert.equal(result.requiredApprovals, 2);
  assert.equal(result.blocked, false);
});

test("blocks submission when contract or AI review is required", () => {
  const result = evaluatePurchaseOrderPolicy(
    { amount: 5000, currency: "USD", vendor_ID: "vendor-1", riskLevel: "Low" },
    [{ requiresContract: true, requiresAIReview: true }]
  );

  assert.equal(result.blocked, true);
  assert.deepEqual(result.findings.map((finding) => finding.code), ["CONTRACT_REQUIRED", "AI_REVIEW_REQUIRED"]);
});

test("blocks rejected AI recommendations and missing vendors", () => {
  const result = evaluatePurchaseOrderPolicy({
    amount: 5000,
    riskLevel: "Low",
    aiRecommendation: "Reject"
  });

  assert.equal(result.blocked, true);
  assert.deepEqual(result.findings.map((finding) => finding.code), ["VENDOR_REQUIRED", "HIGH_RISK_REVIEW"]);
});