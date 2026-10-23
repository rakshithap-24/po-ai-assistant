"use strict";

function policyMatches(policy, purchaseOrder) {
  if (policy.enabled === false) {
    return false;
  }

  const amount = Number(purchaseOrder.amount || 0);
  const minimumAmount = Number(policy.minimumAmount || 0);
  const maximumAmount = policy.maximumAmount == null
    ? Number.POSITIVE_INFINITY
    : Number(policy.maximumAmount);

  return amount >= minimumAmount &&
    amount <= maximumAmount &&
    (!policy.riskLevel || policy.riskLevel === purchaseOrder.riskLevel) &&
    (!policy.department || policy.department === purchaseOrder.department) &&
    (!policy.currency || policy.currency === purchaseOrder.currency);
}

function evaluatePurchaseOrderPolicy(purchaseOrder, policies = []) {
  const matchingPolicies = policies
    .filter((policy) => policyMatches(policy, purchaseOrder))
    .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0));
  const policy = matchingPolicies[0] || null;
  const findings = [];

  if (!purchaseOrder.vendor_ID) {
    findings.push({ code: "VENDOR_REQUIRED", severity: "block", message: "A vendor must be assigned." });
  }

  if (policy?.requiresContract && !purchaseOrder.contractReference) {
    findings.push({ code: "CONTRACT_REQUIRED", severity: "block", message: "A contract reference is required by the matching policy." });
  }

  if (policy?.requiresAIReview && (!purchaseOrder.aiGeneratedAt || !purchaseOrder.aiRecommendation || purchaseOrder.aiRecommendation === "Pending")) {
    findings.push({ code: "AI_REVIEW_REQUIRED", severity: "block", message: "Generate an AI review before submitting this purchase order." });
  }

  if ((policy?.blockHighRisk && purchaseOrder.riskLevel === "High") || purchaseOrder.aiRecommendation === "Reject") {
    findings.push({ code: "HIGH_RISK_REVIEW", severity: "block", message: "This purchase order is blocked by its risk assessment." });
  }

  return {
    policy,
    findings,
    blocked: findings.some((finding) => finding.severity === "block"),
    requiredApprovals: Math.max(1, Number(policy?.requiredApprovals || 1))
  };
}

module.exports = { evaluatePurchaseOrderPolicy };