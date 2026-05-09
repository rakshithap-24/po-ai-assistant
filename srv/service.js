require("dotenv").config();

const cds = require("@sap/cds");
const { generatePurchaseOrderInsight } = require("./ai/llmProxy");

module.exports = cds.service.impl(async function () {
  const { PurchaseOrder } = this.entities;

  /**
   * Set default values and validate Purchase Order before creation.
   */
  this.before("CREATE", "PurchaseOrder", async (req) => {
    if (!req.data.status) {
      req.data.status = "Draft";
    }

    if (req.data.amount <= 0) {
      return req.error(400, "Amount must be greater than 0");
    }
  });

  /**
   * Approve Purchase Order.
   */
  this.on("approvePO", "PurchaseOrder", async (req) => {
    console.log("Approve action triggered");

    const ID = req.params[0].ID;
    const tx = cds.tx(req);

    const po = await tx.read(PurchaseOrder).where({ ID });

    if (!po.length) {
      return req.error(404, "Purchase Order not found");
    }

    const currentPO = po[0];

    if (currentPO.status === "Approved") {
      return req.error(400, "Purchase Order is already approved");
    }

    if (currentPO.status === "Rejected") {
      return req.error(400, "Rejected Purchase Order cannot be approved");
    }

    if (currentPO.aiRecommendation === "Reject") {
      return req.error(
        400,
        "Purchase Order cannot be approved because AI recommendation is Reject"
      );
    }

    await tx
      .update(PurchaseOrder)
      .set({
        status: "Approved",
        approvedBy: req.user?.id || "System",
        approvedAt: new Date()
      })
      .where({ ID });

    return `PO ${currentPO.poNumber || ID} approved successfully`;
  });

  /**
   * Reject Purchase Order.
   */
  this.on("rejectPO", "PurchaseOrder", async (req) => {
    console.log("Reject action triggered");

    const ID = req.params[0].ID;
    const tx = cds.tx(req);

    const po = await tx.read(PurchaseOrder).where({ ID });

    if (!po.length) {
      return req.error(404, "Purchase Order not found");
    }

    const currentPO = po[0];

    if (currentPO.status === "Rejected") {
      return req.error(400, "Purchase Order is already rejected");
    }

    if (currentPO.status === "Approved") {
      return req.error(400, "Approved Purchase Order cannot be rejected");
    }

    await tx
      .update(PurchaseOrder)
      .set({
        status: "Rejected"
      })
      .where({ ID });

    return `PO ${currentPO.poNumber || ID} rejected successfully`;
  });

  /**
   * Generate AI Insight for selected Purchase Order.
   *
   * Flow:
   * 1. Read selected PO.
   * 2. Call OpenRouter/Claude through llmProxy.js.
   * 3. Receive structured JSON:
   *    - riskSummary
   *    - recommendation
   *    - riskLevel
   *    - reason
   * 4. Save values into PurchaseOrder.
   */
  this.on("generatePOInsight", "PurchaseOrder", async (req) => {
    console.log("Generate AI Insight action triggered");

    const ID = req.params[0].ID;
    const tx = cds.tx(req);

    const po = await tx.read(PurchaseOrder).where({ ID });

    if (!po.length) {
      return req.error(404, "Purchase Order not found");
    }

    const currentPO = po[0];

    try {
      const aiInsight = await generatePurchaseOrderInsight(currentPO);

      const riskSummary = aiInsight.riskSummary
        ? aiInsight.riskSummary.substring(0, 1000)
        : "AI risk summary not available.";

      const aiRecommendation = aiInsight.recommendation
        ? aiInsight.recommendation.substring(0, 1000)
        : "Review";

      const aiReason = aiInsight.reason
        ? aiInsight.reason.substring(0, 1000)
        : "AI reason not available.";

      const riskLevel = aiInsight.riskLevel
        ? aiInsight.riskLevel.substring(0, 20)
        : "Medium";

      await tx
        .update(PurchaseOrder)
        .set({
          riskSummary,
          aiRecommendation,
          aiReason,
          riskLevel,
          aiGeneratedAt: new Date()
        })
        .where({ ID });

      return `AI insight generated successfully: ${aiRecommendation}`;
    } catch (error) {
      console.error("Generate AI Insight failed:", error);

      return req.error(
        500,
        `AI insight generation failed: ${error.message}`
      );
    }
  });
});